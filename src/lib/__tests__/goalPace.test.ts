import { describe, expect, it } from 'vitest'
import { goalPace } from '@/lib/goalPace'
import { dateOnly } from '@/lib/utils'

const DAY = 86_400_000
const CREATED = dateOnly(2026, 0, 1)
const DEADLINE = dateOnly(2026, 11, 31)

function goal(overrides: Partial<Parameters<typeof goalPace>[0]> = {}) {
  return { target: 100_000, deadline: DEADLINE, createdAt: CREATED, ...overrides }
}

describe('goalPace', () => {
  it('is done once the target is reached, deadline or not', () => {
    expect(goalPace(goal(), 100_000, CREATED)).toEqual({ status: 'done', monthlyNeeded: null })
    expect(goalPace(goal({ deadline: null }), 120_000, CREATED)).toEqual({
      status: 'done',
      monthlyNeeded: null,
    })
  })

  it('has no pace at all for an unfinished goal with no deadline', () => {
    expect(goalPace(goal({ deadline: null }), 10_000, CREATED)).toBeNull()
  })

  it('is not overdue on the deadline day itself', () => {
    expect(goalPace(goal(), 50_000, DEADLINE)?.status).not.toBe('overdue')
  })

  it('is overdue the day after the deadline', () => {
    expect(goalPace(goal(), 50_000, DEADLINE + DAY)).toEqual({
      status: 'overdue',
      monthlyNeeded: null,
    })
  })

  it('is on track when the amount keeps up with the time', () => {
    const halfway = CREATED + (DEADLINE - CREATED) / 2
    expect(goalPace(goal(), 50_000, halfway)?.status).toBe('on-track')
  })

  it('is behind when the amount lags time by more than the tolerance', () => {
    const sixtyPercent = CREATED + (DEADLINE - CREATED) * 0.6
    expect(goalPace(goal(), 40_000, sixtyPercent)?.status).toBe('behind')
  })

  it('allows a five-point tolerance before calling it behind', () => {
    const halfway = CREATED + (DEADLINE - CREATED) / 2
    expect(goalPace(goal(), 45_000, halfway)?.status).toBe('on-track')
    expect(goalPace(goal(), 44_000, halfway)?.status).toBe('behind')
  })

  it('reports what is still needed each month, rounded up', () => {
    // Half a year left, 50,000 short → a shade over 8,200 a month.
    const halfway = CREATED + (DEADLINE - CREATED) / 2
    const pace = goalPace(goal(), 50_000, halfway)
    expect(pace?.monthlyNeeded).toBeGreaterThan(8_000)
    expect(pace?.monthlyNeeded).toBeLessThan(8_500)
    expect(Number.isInteger(pace?.monthlyNeeded)).toBe(true)
  })

  it('does not divide by zero for a goal created on its own deadline', () => {
    // No elapsed time to measure against, so time progress is treated as zero
    // and any amount counts as keeping up. Pinning existing behaviour.
    const sameDay = goal({ createdAt: DEADLINE })
    expect(goalPace(sameDay, 0, DEADLINE)).toEqual({ status: 'on-track', monthlyNeeded: null })
  })

  it('does not read the clock', () => {
    const a = goalPace(goal(), 50_000, CREATED + DAY)
    const b = goalPace(goal(), 50_000, CREATED + DAY)
    expect(a).toEqual(b)
  })
})
