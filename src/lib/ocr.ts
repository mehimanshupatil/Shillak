import { createWorker } from 'tesseract.js'

/**
 * Run Tesseract OCR on an image.
 * Language data is cached by Tesseract in IndexedDB — works offline after first use.
 * @param onProgress - called with 0–100 during recognition
 */
export async function extractTextFromImage(
  image: Blob | File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(Math.round(m.progress * 100))
      }
    },
  })
  const {
    data: { text },
  } = await worker.recognize(image)
  await worker.terminate()
  return text
}

/**
 * Parse OCR'd receipt text for amount and merchant name.
 * Handles GPay, PhonePe, HDFC/ICICI/Kotak SMS screenshots.
 */
export function parseReceiptText(raw: string): { amount: number | null; note: string } {
  const text = raw.replace(/\s+/g, ' ').trim()

  const amountPatterns = [
    /₹\s*([\d,]+(?:\.\d{1,2})?)/,
    /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /INR\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|paid|debited|spent|sent)/i,
  ]
  let amount: number | null = null
  for (const pat of amountPatterns) {
    const m = text.match(pat)
    if (m?.[1]) {
      amount = parseFloat(m[1].replace(/,/g, ''))
      break
    }
  }

  const merchantPatterns = [
    /paid\s+to\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i,
    /sent\s+to\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i,
    /to\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i,
    /merchant[:\s]+([A-Za-z0-9 &.'"-]+?)(?:\s*[|\n]|$)/i,
    /at\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|\s*[|\n]|$)/i,
  ]
  let note = ''
  for (const pat of merchantPatterns) {
    const m = text.match(pat)
    if (m?.[1]) {
      note = m[1].trim()
      break
    }
  }

  return { amount, note }
}
