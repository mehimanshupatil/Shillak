import type { Recurrence } from '@/db/schema'
import { advanceDate, toBaseCurrency } from '@/lib/utils'

const WINDOW_DAYS = 30
const DAY_MS = 86_400_000

export interface UpcomingBillItem {
  recurrenceId: string
  categoryId: string
  note: string
  amount: number // base currency
  date: number
  frequency: Recurrence['frequency']
}

export interface UpcomingBillsResult {
  overdue: UpcomingBillItem[]
  upcoming: UpcomingBillItem[]
  upcomingTotal: number
}

function toItem(rec: Recurrence, date: number, currency: string): UpcomingBillItem {
  return {
    recurrenceId: rec.recurrenceId,
    categoryId: rec.template.categoryId,
    note: rec.template.note,
    amount: toBaseCurrency(rec.template, currency),
    date,
    frequency: rec.frequency,
  }
}

/**
 * Household-wide expense recurrences due in the next 30 days, plus a
 * distinct overdue bucket for recurrences whose owner hasn't caught up
 * processRecurrences yet (nextDue already in the past). Projects every
 * occurrence landing in the window, not just the next one.
 *
 * `now` is a midnight-UTC date supplied by the caller — nothing here reads the
 * clock, so the projection is the same every time it is asked.
 */
export function computeUpcomingBills(
  recurrences: Recurrence[],
  currency: string,
  now: number,
): UpcomingBillsResult {
  const windowEnd = now + WINDOW_DAYS * DAY_MS

  const overdue: UpcomingBillItem[] = []
  const upcoming: UpcomingBillItem[] = []

  for (const rec of recurrences) {
    if (!rec.active || rec.template.type !== 'expense') continue

    // Past endDate the recurrence is finished: neither overdue nor upcoming.
    // nextDue can still sit in the past here — only the owner's device runs
    // processRecurrences, so a peer's ended recurrence never advances locally.
    if (rec.endDate !== null && rec.nextDue > rec.endDate) continue

    if (rec.nextDue < now) {
      overdue.push(toItem(rec, rec.nextDue, currency))
      continue
    }

    let dueDate = rec.nextDue
    while (dueDate <= windowEnd) {
      if (rec.endDate !== null && dueDate > rec.endDate) break
      upcoming.push(toItem(rec, dueDate, currency))
      dueDate = advanceDate(dueDate, rec.frequency, rec.interval)
    }
  }

  overdue.sort((a, b) => a.date - b.date)
  upcoming.sort((a, b) => a.date - b.date)
  const upcomingTotal = upcoming.reduce((s, item) => s + item.amount, 0)

  return { overdue, upcoming, upcomingTotal }
}
