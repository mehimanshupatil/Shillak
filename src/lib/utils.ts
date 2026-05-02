import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RecurrenceFrequency } from '@/db/schema'

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

/** Short format: ₹1.2K, ₹3.4L, ₹1.2Cr */
export function formatCurrencyCompact(paise: number, currency = 'INR'): string {
  const amount = paise / 100
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`
  return formatCurrency(paise, currency)
}

/** FX rate stored as integer basis points. 1 USD = 83.50 INR → 835000. */
export function applyFxRate(amountPaise: number, fxRateBasisPoints: number): number {
  return Math.round((amountPaise * fxRateBasisPoints) / 10_000)
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Strip time — returns midnight UTC unix ms for a given date. */
export function toDateOnly(date: Date | number): number {
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

export function formatDate(unixMs: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(unixMs))
}

export function formatDateShort(unixMs: number): string {
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
