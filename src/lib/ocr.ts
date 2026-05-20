import { createWorker } from 'tesseract.js'

/**
 * Pre-process a receipt image for better OCR accuracy:
 * - Convert to greyscale
 * - Boost contrast (stretch histogram toward black/white)
 * - Scale up if small (Tesseract works best at ~300 DPI equivalent)
 *
 * Circular icons (profile avatars, ₹ glyphs rendered as images) are high-contrast
 * elements that confuse Tesseract into outputting "0". Greyscale + contrast stretch
 * makes them either clearly text or clearly non-text, reducing false reads.
 */
async function preprocessImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)

  // Scale up small screenshots for better recognition
  const MIN_WIDTH = 1200
  const scale = bitmap.width < MIN_WIDTH ? MIN_WIDTH / bitmap.width : 1
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.drawImage(bitmap, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Greyscale + contrast stretch
  // First pass: find min/max luminance
  let minL = 255
  let maxL = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    if (l < minL) minL = l
    if (l > maxL) maxL = l
  }
  const range = maxL - minL || 1

  // Second pass: greyscale + stretch + write back
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    const stretched = Math.round(((l - minL) / range) * 255)
    data[i] = stretched
    data[i + 1] = stretched
    data[i + 2] = stretched
    // alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

/**
 * Run Tesseract OCR on an image.
 * Pre-processes for contrast before recognition.
 * Language data cached in IndexedDB — works offline after first use (~4 MB).
 */
export async function extractTextFromImage(
  image: Blob | File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const processed = await preprocessImage(image)

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(Math.round(m.progress * 100))
      }
    },
  })

  // PSM 6: assume uniform block of text — better for receipt/SMS screenshots
  // than PSM 3 (auto) which may try to detect columns and misread UI chrome.
  // No char whitelist — it overrides Tesseract's confidence scoring and mangles
  // amounts when the engine is forced to map glyphs to a restricted set.
  // Icon noise (profile avatars → "0") is handled by the contrast preprocessing
  // and by the parser's score-based amount extraction.
  await worker.setParameters({
    tessedit_pageseg_mode: '6' as never,
  })

  const {
    data: { text },
  } = await worker.recognize(processed)
  await worker.terminate()
  return text
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedReceipt {
  amount: number | null // rupees (float), not paise
  note: string // merchant name, normalized
  date: number | null // unix ms midnight UTC, or null if not found
  categoryHint: string | null // category name suggestion, or null
}

// ─── Amount extraction ────────────────────────────────────────────────────────

interface CandidateAmount {
  value: number
  score: number // higher = more likely the correct total
}

/**
 * Find all ₹/Rs/INR amounts in text, score them by label context,
 * and return the highest-scored candidate.
 *
 * Scoring rules:
 *  +100  labeled: TOTAL AMOUNT / GRAND TOTAL / NET PAYABLE / AMOUNT PAYABLE / TOTAL BILL
 *  +80   labeled: TOTAL / BILL AMOUNT / NET AMOUNT / PAYABLE
 *  +60   labeled: AMOUNT / PAID / DEBITED / SENT / SPENT / CHARGED
 *  +20   bare number (no label) — lowest confidence
 *  +10   bonus if value > 10 (avoid misc small charges)
 *  –20   labeled: SUBTOTAL / TAX / GST / SGST / CGST / DISCOUNT / TIP / DELIVERY FEE
 */
function extractAmount(text: string): number | null {
  // Work on both flat (single-space) and line-aware versions
  const flat = text.replace(/\s+/g, ' ')
  // Preserve newlines for line-context matching
  const lined = text

  const HIGH_TOTAL =
    /total\s*amount|grand\s*total|net\s*payable|amount\s*payable|total\s*bill|bill\s*total|final\s*amount|payable\s*amount/i
  const MED_TOTAL = /\btotal\b|bill\s*amount|net\s*amount|\bpayable\b/i
  const LOW_LABEL = /\bamount\b|\bpaid\b|\bdebited\b|\bsent\b|\bspent\b|\bcharged\b/i
  const NOISE_LABEL =
    /subtotal|tax\b|gst|sgst|cgst|igst|discount|tip\b|delivery\s*fee|convenience\s*fee|platform\s*fee|handling\s*fee/i

  const candidates: CandidateAmount[] = []

  // ── Pass 1: explicit currency prefix (₹ / Rs / INR) ──────────────────────
  // Pattern captures optional label (up to 40 chars before) + currency + amount
  const AMOUNT_RE = /(?:([\w\s.]{1,40}?)\s+)?(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((m = AMOUNT_RE.exec(flat)) !== null) {
    const label = m[1]?.trim() ?? ''
    const raw = (m[2] ?? '').replace(/,/g, '')
    const value = parseFloat(raw)
    if (Number.isNaN(value) || value <= 0) continue
    let score = 20
    if (HIGH_TOTAL.test(label)) score = 100
    else if (MED_TOTAL.test(label)) score = 80
    else if (LOW_LABEL.test(label)) score = 60
    if (NOISE_LABEL.test(label)) score -= 20
    if (value > 10) score += 10
    candidates.push({ value, score })
  }

  // ── Pass 2: ₹ OCR'd as junk (BHIM, GPay screenshots) ────────────────────
  // Look for a decimal number that stands alone on a line immediately after
  // a "Paid / Debited / Amount" keyword line (common in UPI app screens).
  // e.g.  "Paid\n250.00"  or  "0 Paid\n250.00"  (0 = OCR artefact of ₹)
  if (candidates.length === 0) {
    const lines = lined.split('\n').map((l) => l.trim())
    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i] ?? ''
      const next = lines[i + 1] ?? ''
      if (LOW_LABEL.test(label) || /paid/i.test(label)) {
        const val = parseFloat(next.replace(/,/g, ''))
        if (!Number.isNaN(val) && val > 0) {
          candidates.push({ value: val, score: 55 })
        }
      }
    }
  }

  // ── Pass 3: bare decimal after currency keyword (last resort) ────────────
  if (candidates.length === 0) {
    const bare = /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|paid|debited|spent|sent|charged)/i.exec(flat)
    if (bare?.[1]) {
      const value = parseFloat(bare[1].replace(/,/g, ''))
      if (!Number.isNaN(value) && value > 0) candidates.push({ value, score: 40 })
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score || b.value - a.value)
  // biome-ignore lint/style/noNonNullAssertion: array is non-empty (checked above)
  return candidates[0]!.value
}

// ─── Merchant extraction ──────────────────────────────────────────────────────

/**
 * Ordered by specificity — first match wins.
 * Each pattern targets a different app / receipt format.
 */
const MERCHANT_PATTERNS: Array<{ re: RegExp; multiline?: boolean }> = [
  // ── BHIM / UPI app: "Banking Name\nCHANDRAKANT D NAIK" ────────────────────
  // Capture only to end of that line (no \n in group)
  { re: /banking\s+name\s*\n\s*([^\n]{2,60})/i, multiline: true },
  // ── BHIM: "Payment received by NAME" (rest of line only) ──────────────────
  { re: /payment\s+received\s+by\s+([^\n]{2,60})/i },
  // ── Generic UPI / payment app flat patterns ────────────────────────────────
  { re: /paid\s+to\s+([A-Za-z0-9 &.'"@-]+?)(?:\s+on\b|\s+for\b|\s+via\b|\s*[|\n]|$)/i },
  { re: /sent\s+to\s+([A-Za-z0-9 &.'"@-]+?)(?:\s+on\b|\s+for\b|\s+via\b|\s*[|\n]|$)/i },
  { re: /transferred\s+to\s+([A-Za-z0-9 &.'"@-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i },
  { re: /payment\s+to\s+([A-Za-z0-9 &.'"@-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i },
  // ── Physical receipt / bank SMS ────────────────────────────────────────────
  { re: /merchant\s*[:-]\s*([A-Za-z0-9 &.'".-]+?)(?:\s*[|\n]|$)/i },
  { re: /store\s*[:-]\s*([A-Za-z0-9 &.'".-]+?)(?:\s*[|\n]|$)/i },
  { re: /vendor\s*[:-]\s*([A-Za-z0-9 &.'".-]+?)(?:\s*[|\n]|$)/i },
  { re: /at\s+([A-Za-z][A-Za-z0-9 &.'".-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i },
  { re: /to\s+([A-Za-z][A-Za-z0-9 &.'"@-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i },
  { re: /for\s+([A-Za-z][A-Za-z0-9 &.'".-]+?)(?:\s+on\b|\s*[|\n]|$)/i },
]

/** Normalize a merchant name: strip UPI handle, noise suffixes, excess whitespace. */
function normalizeMerchant(raw: string): string {
  let name = raw.trim()
  // UPI VPA: take part before @
  name = name.replace(/@[A-Za-z0-9]+$/, '').trim()
  // Strip legal suffixes
  name = name
    .replace(/\b(pvt\.?\s*ltd\.?|private\s+limited|limited|llp|inc\.?|corp\.?)\b/gi, '')
    .trim()
  // Strip trailing punctuation
  name = name.replace(/[.,\-|:;]+$/, '').trim()
  // Title-case if all-caps
  if (name === name.toUpperCase() && name.length > 2) {
    name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return name
}

function extractMerchant(rawText: string): string {
  const flat = rawText.replace(/\s+/g, ' ').trim()
  for (const { re, multiline } of MERCHANT_PATTERNS) {
    // Multiline patterns run on original text to see line breaks
    const m = (multiline ? rawText : flat).match(re)
    if (m?.[1]) {
      const normalized = normalizeMerchant(m[1])
      if (normalized.length >= 2) return normalized
    }
  }
  return ''
}

// ─── Date extraction ──────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

/** Expand a year that might be 2-digit (e.g. "26" → 2026). */
function expandYear(y: number): number {
  if (y >= 100) return y
  // 00–49 → 2000–2049, 50–99 → 1950–1999
  return y < 50 ? 2000 + y : 1900 + y
}

const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => number | null }> = [
  // YYYY-MM-DD (ISO — check first to avoid ambiguity with DD/MM/YYYY)
  {
    re: /\b(\d{4})[/-](\d{2})[/-](\d{2})\b/,
    parse: (m) => {
      const y = Number(m[1] ?? 0),
        mo = Number(m[2] ?? 0),
        d = Number(m[3] ?? 0)
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
      return Date.UTC(y, mo - 1, d)
    },
  },
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (4-digit year)
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/,
    parse: (m) => {
      const d = Number(m[1] ?? 0),
        mo = Number(m[2] ?? 0),
        y = Number(m[3] ?? 0)
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
      return Date.UTC(y, mo - 1, d)
    },
  },
  // "5th May 2026" or "05 May, 26" — ordinal suffix + optional comma + 2 or 4 digit year
  {
    re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[,.\s]+(\d{2,4})\b/i,
    parse: (m) => {
      const mo = MONTH_MAP[(m[2] ?? '').toLowerCase().slice(0, 3)]
      if (mo === undefined) return null
      const y = expandYear(Number(m[3] ?? 0))
      return Date.UTC(y, mo, Number(m[1] ?? 0))
    },
  },
  // "May 5, 2025" or "May 05 26"
  {
    re: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?[,.\s]+(\d{2,4})\b/i,
    parse: (m) => {
      const mo = MONTH_MAP[(m[1] ?? '').toLowerCase().slice(0, 3)]
      if (mo === undefined) return null
      const y = expandYear(Number(m[3] ?? 0))
      return Date.UTC(y, mo, Number(m[2] ?? 0))
    },
  },
]

function extractDate(text: string): number | null {
  for (const { re, parse } of DATE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const ts = parse(m)
      if (ts !== null) {
        // Sanity: reject dates more than 1 year in future or > 30 years ago
        const now = Date.now()
        if (ts > now + 365 * 86400_000 || ts < now - 30 * 365 * 86400_000) continue
        return ts
      }
    }
  }
  return null
}

// ─── Category hint ────────────────────────────────────────────────────────────

/**
 * Map merchant/context keywords → category name (matches DEFAULT_EXPENSE_CATEGORIES).
 * Returns null if no confident match.
 */
function inferCategoryHint(merchant: string, rawText: string): string | null {
  const ctx = `${merchant} ${rawText}`.toLowerCase()

  const rules: Array<{ keywords: string[]; category: string }> = [
    {
      keywords: [
        'swiggy',
        'zomato',
        'eatsure',
        'foodpanda',
        'restaurant',
        'cafe',
        'dhaba',
        'hotel food',
        'biryani',
        'pizza',
        'burger',
        'kfc',
        'mcdonald',
        'domino',
        'subway',
        'starbucks',
      ],
      category: 'Dining',
    },
    {
      keywords: [
        'bigbasket',
        'blinkit',
        'grofers',
        'jiomart',
        'dmart',
        'reliance fresh',
        'more supermarket',
        'grocery',
        'vegetables',
        'fruits',
        'kirana',
      ],
      category: 'Groceries',
    },
    {
      keywords: [
        'uber',
        'ola',
        'rapido',
        'metro',
        'irctc',
        'railway',
        'bus ticket',
        'airport',
        'flight',
        'indigo',
        'airindia',
        'spicejet',
        'toll',
        'fuel',
        'petrol',
        'diesel',
      ],
      category: 'Transport',
    },
    {
      keywords: [
        'petrol',
        'diesel',
        'hpcl',
        'bpcl',
        'iocl',
        'indian oil',
        'shell',
        'fuel station',
        'gas station',
      ],
      category: 'Fuel',
    },
    {
      keywords: [
        'amazon',
        'flipkart',
        'myntra',
        'ajio',
        'nykaa',
        'meesho',
        'snapdeal',
        'clothing',
        'apparel',
        'fashion',
        'shoes',
        'shopping mall',
        'retail',
      ],
      category: 'Shopping',
    },
    {
      keywords: [
        'doctor',
        'hospital',
        'clinic',
        'pharmacy',
        'medplus',
        'apollo pharmacy',
        'netmeds',
        '1mg',
        'pharmeasy',
        'diagnostic',
        'lab test',
        'pathology',
        'medicine',
      ],
      category: 'Health',
    },
    {
      keywords: [
        'netflix',
        'hotstar',
        'prime video',
        'spotify',
        'youtube premium',
        'bookmyshow',
        'pvr',
        'inox',
        'cinema',
        'movie',
        'concert',
        'game',
      ],
      category: 'Entertainment',
    },
    {
      keywords: [
        'electricity',
        'bescom',
        'msedcl',
        'tata power',
        'adani electricity',
        'water bill',
        'gas bill',
        'broadband',
        'jio',
        'airtel',
        'bsnl',
        'vi ',
        'vodafone',
        'recharge',
        'mobile bill',
        'wifi',
      ],
      category: 'Utilities',
    },
    {
      keywords: [
        'emi',
        'loan',
        'home loan',
        'car loan',
        'personal loan',
        'credit card bill',
        'credit card payment',
        'iciciprulife',
        'hdfc loan',
      ],
      category: 'EMI',
    },
    {
      keywords: [
        'lic',
        'insurance premium',
        'term plan',
        'health insurance',
        'general insurance',
        'star health',
        'bajaj allianz',
        'icici lombard',
      ],
      category: 'Insurance',
    },
    {
      keywords: [
        'school fee',
        'college fee',
        'tuition',
        'coaching',
        'udemy',
        'coursera',
        'byju',
        'unacademy',
        'books',
        'stationery',
      ],
      category: 'Education',
    },
    {
      keywords: [
        'salon',
        'spa',
        'parlour',
        'parlor',
        'haircut',
        'beauty',
        'grooming',
        'personal care',
      ],
      category: 'Personal Care',
    },
    {
      keywords: ['rent', 'house rent', 'flat rent', 'apartment', 'pg rent', 'hostel rent'],
      category: 'Rent',
    },
    {
      keywords: [
        'plumber',
        'electrician',
        'carpenter',
        'maid',
        'cook',
        'repair',
        'maintenance',
        'housekeeping',
      ],
      category: 'Household',
    },
  ]

  for (const { keywords, category } of rules) {
    if (keywords.some((kw) => ctx.includes(kw))) return category
  }
  return null
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Intelligently parse OCR'd text from receipts, payment screenshots, and bank SMSes.
 * Returns amount (rupees), merchant note, date (unix ms), and category hint.
 */
export function parseReceiptText(raw: string): ParsedReceipt {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const flat = text.replace(/\s+/g, ' ')

  const amount = extractAmount(flat)
  const note = extractMerchant(flat)
  const date = extractDate(flat)
  const categoryHint = inferCategoryHint(note, flat)

  return { amount, note, date, categoryHint }
}
