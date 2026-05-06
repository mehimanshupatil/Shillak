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
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Today at midnight UTC. */
export function today(): number {
  return toDateOnly(new Date())
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

    case 'yearly': {
      const targetYear = year + interval
      const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate()
      return Date.UTC(targetYear, month, Math.min(day, lastDay))
    }
  }
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
