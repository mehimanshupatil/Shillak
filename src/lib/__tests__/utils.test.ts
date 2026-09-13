import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dateOnly,
  formatDateFull,
  formatDateShort,
  formatDateStr,
  GROUP_COLORS,
  groupColor,
  relativeDate,
  toDateOnly,
  today,
} from '../utils'

describe('groupColor', () => {
  it('returns a color from GROUP_COLORS for indices within range', () => {
    expect(groupColor(0)).toBe(GROUP_COLORS[0])
    expect(groupColor(GROUP_COLORS.length - 1)).toBe(GROUP_COLORS[GROUP_COLORS.length - 1])
  })

  it('wraps around via modulo for an index beyond the palette length', () => {
    expect(groupColor(GROUP_COLORS.length)).toBe(GROUP_COLORS[0])
    expect(groupColor(GROUP_COLORS.length + 2)).toBe(GROUP_COLORS[2])
  })
})

describe('date display is UTC-pinned', () => {
  const MIDNIGHT_UTC = dateOnly(2026, 5, 15)

  it('runs west of UTC, so an unpinned formatter would slip a day', () => {
    // Guards the guard: if this ever prints 15, the assertions below prove nothing.
    const unpinned = new Intl.DateTimeFormat('en-IN', { day: '2-digit' })
    expect(unpinned.format(new Date(MIDNIGHT_UTC))).toBe('14')
  })

  it('formatDateShort prints the stored day, not the local one', () => {
    expect(formatDateShort(MIDNIGHT_UTC)).toBe('15 Jun')
  })

  it('formatDateFull prints the stored day, not the local one', () => {
    expect(formatDateFull(MIDNIGHT_UTC)).toBe('15 Jun 2026')
  })

  it('formatDateFull handles a new-year boundary without slipping a year', () => {
    expect(formatDateFull(dateOnly(2026, 0, 1))).toBe('01 Jan 2026')
  })
})

describe('toDateOnly', () => {
  it('strips the time from an instant', () => {
    expect(toDateOnly(Date.UTC(2026, 5, 15, 18, 30, 5))).toBe(dateOnly(2026, 5, 15))
  })

  it('is idempotent', () => {
    const d = dateOnly(2026, 5, 15)
    expect(toDateOnly(toDateOnly(d))).toBe(d)
  })

  it('accepts a Date as well as a timestamp', () => {
    expect(toDateOnly(new Date(Date.UTC(2026, 5, 15, 23, 59)))).toBe(dateOnly(2026, 5, 15))
  })
})

describe('relativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15, 12, 0)))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names today and yesterday', () => {
    expect(relativeDate(dateOnly(2026, 5, 15))).toBe('Today')
    expect(relativeDate(dateOnly(2026, 5, 14))).toBe('Yesterday')
  })

  it('uses a weekday name within the past week', () => {
    // 10 Jun 2026 is a Wednesday
    expect(relativeDate(dateOnly(2026, 5, 10))).toBe('Wednesday')
  })

  it('falls back to a short date beyond a week', () => {
    expect(relativeDate(dateOnly(2026, 5, 1))).toBe('01 Jun')
  })

  it('treats the boundary day as a weekday, not a short date', () => {
    expect(relativeDate(dateOnly(2026, 5, 9))).toBe('Tuesday')
    expect(relativeDate(dateOnly(2026, 5, 8))).toBe('08 Jun')
  })
})

describe('today is the user’s calendar day', () => {
  // The suite runs in America/New_York, so late-evening local time is already
  // tomorrow in UTC. That gap is where the two readings of "today" differ.
  const LATE_EVENING_LOCAL = Date.UTC(2026, 5, 16, 2, 0) // 15 Jun, 22:00 in New York

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(LATE_EVENING_LOCAL))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the day on the wall calendar, not the UTC day', () => {
    expect(today()).toBe(dateOnly(2026, 5, 15))
    expect(today()).not.toBe(dateOnly(2026, 5, 16))
  })

  it('is still a midnight-UTC timestamp, so it round-trips like any stored date', () => {
    expect(toDateOnly(today())).toBe(today())
    expect(formatDateStr(today())).toBe('2026-06-15')
  })

  it('agrees with what a new transaction is dated', () => {
    // The form seeds its date field from formatDateStr(today()); a transaction
    // entered now must therefore read as "Today", not as a weekday name.
    const entered = dateOnly(2026, 5, 15)
    expect(relativeDate(entered)).toBe('Today')
  })

  it('puts the true UTC day in the future, not in the past', () => {
    expect(relativeDate(dateOnly(2026, 5, 16))).not.toBe('Today')
  })
})
