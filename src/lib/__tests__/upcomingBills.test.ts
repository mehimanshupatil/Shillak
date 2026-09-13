import { beforeEach, describe, expect, it } from 'vitest'
import type { Recurrence } from '@/db/schema'
import { computeUpcomingBills } from '../upcomingBills'
import { today } from '../utils'

let recurrences: Recurrence[] = []

function makeRecurrence(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    recurrenceId: 'rec-1',
    groupId: 'g1',
    ownerId: 'u1',
    template: {
      groupId: 'g1',
      ownerId: 'u1',
      categoryId: 'cat-1',
      type: 'expense',
      amount: 50000,
      currency: 'INR',
      fxRate: null,
      originalAmount: null,
      note: 'Rent',
      tags: [],
      attachmentIds: [],
      accountId: null,
      paidBy: null,
    } as Recurrence['template'],
    frequency: 'monthly',
    interval: 1,
    nextDue: today(),
    lastGeneratedAt: null,
    endDate: null,
    active: true,
    createdAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  recurrences = []
})

const DAY = 86_400_000

describe('computeUpcomingBills', () => {
  it('includes a recurrence due within the 30-day window', () => {
    recurrences.push(makeRecurrence({ nextDue: today() + 10 * DAY }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.upcoming).toHaveLength(1)
    expect(result.upcoming[0]?.amount).toBe(50000)
    expect(result.overdue).toHaveLength(0)
  })

  it('excludes a recurrence due beyond the 30-day window', () => {
    recurrences.push(makeRecurrence({ nextDue: today() + 40 * DAY }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.upcoming).toHaveLength(0)
  })

  it('puts a recurrence with nextDue in the past into the overdue bucket, not upcoming', () => {
    recurrences.push(makeRecurrence({ nextDue: today() - 3 * DAY }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.overdue).toHaveLength(1)
    expect(result.upcoming).toHaveLength(0)
  })

  it('excludes income recurrences', () => {
    recurrences.push(
      makeRecurrence({
        nextDue: today() + 5 * DAY,
        template: { ...makeRecurrence().template, type: 'income' },
      }),
    )
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.upcoming).toHaveLength(0)
    expect(result.overdue).toHaveLength(0)
  })

  it('excludes inactive recurrences', () => {
    recurrences.push(makeRecurrence({ nextDue: today() + 5 * DAY, active: false }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.upcoming).toHaveLength(0)
  })

  it('does not filter by isFixed — includes discretionary recurrences too', () => {
    recurrences.push(makeRecurrence({ nextDue: today() + 5 * DAY, isFixed: false }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.upcoming).toHaveLength(1)
  })

  it('projects every occurrence landing in the window for a weekly recurrence', () => {
    recurrences.push(
      makeRecurrence({ nextDue: today() + 2 * DAY, frequency: 'weekly', interval: 1 }),
    )
    const result = computeUpcomingBills(recurrences, 'INR', today())
    // weekly for 30 days from day 2: day 2, 9, 16, 23, 30 -> 5 occurrences (30 <= windowEnd)
    expect(result.upcoming.length).toBeGreaterThanOrEqual(4)
    const dates = result.upcoming.map((i) => i.date)
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
  })

  it('stops projecting once past endDate, even within the 30-day window', () => {
    recurrences.push(
      makeRecurrence({
        nextDue: today() + 2 * DAY,
        frequency: 'weekly',
        interval: 1,
        endDate: today() + 10 * DAY,
      }),
    )
    const result = computeUpcomingBills(recurrences, 'INR', today())
    // day 2 and day 9 are <= endDate (day 10); day 16 would exceed it
    expect(result.upcoming).toHaveLength(2)
  })

  it('excludes a finished recurrence whose stale nextDue sits past endDate', () => {
    // Only the owner's device advances nextDue, so a peer's ended recurrence
    // keeps a past nextDue forever — it must not read as overdue here.
    recurrences.push(makeRecurrence({ nextDue: today() - 3 * DAY, endDate: today() - 10 * DAY }))
    const result = computeUpcomingBills(recurrences, 'INR', today())
    expect(result.overdue).toHaveLength(0)
    expect(result.upcoming).toHaveLength(0)
  })

  it('sums upcomingTotal in base currency, using toBaseCurrency conversion', () => {
    recurrences.push(
      makeRecurrence({
        nextDue: today() + 5 * DAY,
        template: {
          ...makeRecurrence().template,
          amount: 10000,
          currency: 'USD',
          fxRate: 8300, // 1 USD = 83.00 INR, basis points
          originalAmount: 10000,
        },
      }),
    )
    const result = computeUpcomingBills(recurrences, 'INR', today())
    // toBaseCurrency: (originalAmount * fxRate) / 10000 = (10000 * 8300) / 10000 = 8300
    expect(result.upcomingTotal).toBe(8300)
  })
})
