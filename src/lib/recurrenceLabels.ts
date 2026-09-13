import type { Recurrence } from '@/db/schema'
import { ordinal, weekdayLabel } from '@/lib/utils'

/**
 * How far off a due date is, in words. `today` is passed in so the label is the
 * same every time it is asked for a given day.
 */
export function daysLabel(dueDate: number, today: number): string {
  const daysUntil = Math.round((dueDate - today) / 86_400_000)
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`
  if (daysUntil === 0) return 'today'
  return `in ${daysUntil}d`
}

/**
 * A Recurrence's cadence in words. Weekly is the one frequency with an explicit
 * anchor; monthly and quarterly reuse the day-of-month of their next due date.
 */
export function describeRecurrence(
  rec: Pick<Recurrence, 'frequency' | 'dayOfWeek' | 'nextDue'>,
): string {
  switch (rec.frequency) {
    case 'daily':
      return 'Daily'
    case 'weekly':
      return `Weekly, ${weekdayLabel(rec.dayOfWeek ?? new Date(rec.nextDue).getUTCDay(), 'long')}`
    case 'monthly':
      return `Monthly, on the ${ordinal(new Date(rec.nextDue).getUTCDate())}`
    case 'quarterly':
      return 'Quarterly'
  }
}
