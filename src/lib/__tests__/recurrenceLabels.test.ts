import { describe, expect, it } from 'vitest'
import type { Recurrence } from '@/db/schema'
import { daysLabel, describeRecurrence } from '@/lib/recurrenceLabels'
import { dateOnly } from '@/lib/utils'

const DAY = 86_400_000
const TODAY = dateOnly(2026, 5, 15) // Monday

describe('daysLabel', () => {
  it('names today', () => {
    expect(daysLabel(TODAY, TODAY)).toBe('today')
  })

  it('counts forward', () => {
    expect(daysLabel(TODAY + 3 * DAY, TODAY)).toBe('in 3d')
  })

  it('counts overdue days as a positive number', () => {
    expect(daysLabel(TODAY - 2 * DAY, TODAY)).toBe('2d overdue')
  })

  it('does not read the clock — the same inputs always give the same answer', () => {
    expect(daysLabel(TODAY + DAY, TODAY)).toBe(daysLabel(TODAY + DAY, TODAY))
  })
})

describe('describeRecurrence', () => {
  function rec(overrides: Partial<Recurrence> = {}) {
    return { frequency: 'monthly', nextDue: dateOnly(2026, 5, 15), ...overrides } as Recurrence
  }

  it('names a daily and a quarterly cadence', () => {
    expect(describeRecurrence(rec({ frequency: 'daily' }))).toBe('Daily')
    expect(describeRecurrence(rec({ frequency: 'quarterly' }))).toBe('Quarterly')
  })

  it('names the weekly anchor the Recurrence carries', () => {
    expect(describeRecurrence(rec({ frequency: 'weekly', dayOfWeek: 3 }))).toBe('Weekly, Wednesday')
  })

  it('falls back to the weekday of the next due date when no anchor is set', () => {
    // 15 Jun 2026 is a Monday.
    expect(describeRecurrence(rec({ frequency: 'weekly' }))).toBe('Weekly, Monday')
  })

  it('names the monthly anchor from the next due date, read as UTC', () => {
    expect(describeRecurrence(rec({ nextDue: dateOnly(2026, 5, 1) }))).toBe('Monthly, on the 1st')
    expect(describeRecurrence(rec({ nextDue: dateOnly(2026, 5, 22) }))).toBe('Monthly, on the 22nd')
    expect(describeRecurrence(rec({ nextDue: dateOnly(2026, 5, 3) }))).toBe('Monthly, on the 3rd')
  })
})
