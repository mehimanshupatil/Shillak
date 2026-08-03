import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RecurrenceFrequency, Transaction } from '@/db/schema'

// ─── Tailwind class merge ──────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Money — integer paise ────────────────────────────────────────────────────

/** User-facing rupees (float) → storage paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

/** Storage paise → display string (₹1,234.56). */
export function formatCurrency(paise: number, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(paise / 100)
}

/**
 * Storage paise → compact display (₹45K, ₹1.2L, ₹12.3L, ₹1.2Cr).
 * Uses Intl.NumberFormat compact notation — en-IN locale natively outputs L/Cr.
 * Use in space-constrained UI (summary cards, column headers).
 */
export function formatCompact(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(paise / 100)
}

/**
 * Normalize a transaction amount to the space's base currency.
 * If same currency, returns amount as-is.
 * If multi-currency, applies stored fxRate (basis points) to originalAmount.
 * Falls back to raw amount if fxRate/originalAmount missing.
 */
export function toBaseCurrency(
  txn: Pick<Transaction, 'amount' | 'currency' | 'fxRate' | 'originalAmount'>,
  baseCurrency: string,
): number {
  if (txn.currency === baseCurrency || !txn.fxRate || !txn.originalAmount) return txn.amount
  return Math.round((txn.originalAmount * txn.fxRate) / 10000)
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Strip time — returns midnight UTC unix ms for a given date. */
function toDateOnly(date: Date | number): number {
  const d = typeof date === 'number' ? new Date(date) : date
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Today at midnight UTC. */
export function today(): number {
  return toDateOnly(new Date())
}

/** 1 → '1st', 2 → '2nd', 3 → '3rd', 4 → '4th', 11-13 → '11th'/'12th'/'13th', etc. */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * Advance a date by interval × frequency.
 * Clamps to last valid day of target month (Jan 31 + 1m = Feb 28/29, not Mar 2).
 */
export function advanceDate(
  date: number,
  frequency: RecurrenceFrequency,
  interval: number,
): number {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const day = d.getUTCDate()

  switch (frequency) {
    case 'daily':
      return Date.UTC(year, month, day + interval)

    case 'weekly':
      return Date.UTC(year, month, day + 7 * interval)

    case 'monthly': {
      const targetMonth = month + interval
      const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
      return Date.UTC(year, targetMonth, Math.min(day, lastDay))
    }

    case 'quarterly': {
      const targetMonth = month + 3 * interval
      const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
      return Date.UTC(year, targetMonth, Math.min(day, lastDay))
    }
  }
}

/** Smallest midnight-UTC timestamp ≥ `date` that falls on `dayOfWeek` (0 = Sun … 6 = Sat). */
export function nextWeekday(date: number, dayOfWeek: number): number {
  const d = new Date(date)
  const diff = (dayOfWeek - d.getUTCDay() + 7) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff)
}

/**
 * Next recurrence date strictly after `after` for a fixed-cadence (interval 1) recurrence.
 * For weekly, aligns to `dayOfWeek` first, then skips forward a week if that lands on `after` itself.
 */
export function nextOccurrence(
  after: number,
  frequency: RecurrenceFrequency,
  dayOfWeek?: number,
): number {
  if (frequency === 'weekly') {
    const dow = dayOfWeek ?? new Date(after).getUTCDay()
    const aligned = nextWeekday(after, dow)
    return aligned === after ? advanceDate(aligned, 'weekly', 1) : aligned
  }
  return advanceDate(after, frequency, 1)
}

// ─── Date display ─────────────────────────────────────────────────────────────

function formatDateShort(unixMs: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(unixMs))
}

/** Returns 'Today', 'Yesterday', or a short date. */
export function relativeDate(unixMs: number): string {
  const t = toDateOnly(new Date())
  const d = toDateOnly(new Date(unixMs))
  if (d === t) return 'Today'
  if (d === t - 86_400_000) return 'Yesterday'
  if (d >= t - 6 * 86_400_000) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(new Date(unixMs))
  }
  return formatDateShort(unixMs)
}

// ─── Date input parsing ───────────────────────────────────────────────────────

/**
 * Parse a `YYYY-MM-DD` date input string to midnight UTC unix ms.
 * Throws if the string is not a valid date.
 */
export function parseDateStr(dateStr: string): number {
  const parts = dateStr.split('-')
  const y = Number(parts[0])
  const mo = Number(parts[1])
  const d = Number(parts[2])
  if (!y || !mo || !d) throw new Error(`Invalid date string: ${dateStr}`)
  return Date.UTC(y, mo - 1, d)
}

/** Midnight-UTC unix ms (or a UTC-anchored Date) → 'YYYY-MM-DD'. Inverse of parseDateStr. */
export function formatDateStr(date: number | Date): string {
  const d = typeof date === 'number' ? new Date(date) : date
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * Today in the user's local calendar day, as 'YYYY-MM-DD' — for defaulting a date-input field
 * to "today". NOT for reading a stored UTC-midnight timestamp; use formatDateStr for that.
 */
export function todayLocalDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  timeZone: 'UTC',
})

/** 0-indexed month (0 = Jan … 11 = Dec) → short label, e.g. 'Jan'. */
export function monthShort(monthIndex: number): string {
  return MONTH_SHORT_FORMATTER.format(new Date(Date.UTC(2000, monthIndex, 1)))
}

const WEEKDAY_SHORT_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  timeZone: 'UTC',
})
const WEEKDAY_LONG_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  timeZone: 'UTC',
})

/** 0 = Sun … 6 = Sat → weekday label. Jan 2 2000 (a UTC Sunday) is used as a stable anchor. */
export function weekdayLabel(dayOfWeek: number, style: 'short' | 'long' = 'short'): string {
  const anchor = new Date(Date.UTC(2000, 0, 2 + dayOfWeek))
  return (style === 'long' ? WEEKDAY_LONG_FORMATTER : WEEKDAY_SHORT_FORMATTER).format(anchor)
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID()
}

/** Pick nth group color from the palette (wraps). */
export const GROUP_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
  '#64748b',
  '#f43f5e',
] as const

export function groupColor(index: number): string {
  // biome-ignore lint/style/noNonNullAssertion: array is const, index always valid
  return GROUP_COLORS[index % GROUP_COLORS.length]!
}
