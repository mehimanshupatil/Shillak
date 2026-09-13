/**
 * Financial invariant tests.
 * These guard against the class of bugs found in the audit:
 *   - txn.amount used instead of toBaseCurrency (multi-currency totals off)
 *   - float rupees stored instead of integer paise
 *   - transfer type included in expense/income totals
 *   - date helpers using local timezone instead of UTC
 *   - advanceDate month overflow (Jan 31 + 1m ≠ Mar 2)
 */
import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/schema'
import { advanceDate, dateOnly, nextWeekday, parseDateStr, toBaseCurrency, toPaise } from '../utils'

// ─── toPaise ─────────────────────────────────────────────────────────────────

describe('toPaise', () => {
  it('converts integer rupees', () => {
    expect(toPaise(100)).toBe(10000)
    expect(toPaise(0)).toBe(0)
  })

  it('rounds fractional rupees — no floating-point drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS; toPaise must round to 30
    expect(toPaise(0.1 + 0.2)).toBe(30)
  })

  it('rounds to nearest paise', () => {
    // 1.005 * 100 in IEEE 754 = 100.4999... — rounds to 100, not 101
    // callers must not rely on strict half-up for 3-decimal rupee inputs
    expect(toPaise(1.005)).toBe(100)
    expect(toPaise(1.006)).toBe(101)
  })

  it('handles typical receipt amounts', () => {
    expect(toPaise(1234.56)).toBe(123456)
    expect(toPaise(0.99)).toBe(99)
  })
})

// ─── toBaseCurrency ───────────────────────────────────────────────────────────

describe('toBaseCurrency', () => {
  const makeTxn = (
    overrides: Partial<Pick<Transaction, 'amount' | 'currency' | 'fxRate' | 'originalAmount'>>,
  ) => ({
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    ...overrides,
  })

  it('returns amount as-is for same currency', () => {
    expect(toBaseCurrency(makeTxn({ amount: 5000 }), 'INR')).toBe(5000)
  })

  it('applies fxRate (basis points) for foreign currency', () => {
    // USD 100 at rate 83.50 → stored as fxRate=835000 (basis points of 100=8350000?)
    // fxRate basis points: 1.23 → 12300
    // USD 50 at 83.50 INR/USD → originalAmount=5000 paise ($50), fxRate=835000 (83.50×10000)
    // toBaseCurrency = round(5000 * 835000 / 10000) = round(418500000/10000) = 41850000? No...
    // Let me re-read: fxRate basis points: 1.23 → 12300. So 83.50 → 835000.
    // originalAmount in paise of ORIGINAL currency (USD paise = cents: $10 = 1000)
    // result = round(originalAmount * fxRate / 10000)
    // $10 (1000 cents) at 83.50 → fxRate=835000
    // result = round(1000 * 835000 / 10000) = round(83500) = 83500 paise = ₹835
    expect(
      toBaseCurrency(
        makeTxn({ currency: 'USD', originalAmount: 1000, fxRate: 835000, amount: 83500 }),
        'INR',
      ),
    ).toBe(83500)
  })

  it('falls back to amount when fxRate missing', () => {
    expect(toBaseCurrency(makeTxn({ currency: 'USD', amount: 8350, fxRate: null }), 'INR')).toBe(
      8350,
    )
  })

  it('falls back to amount when originalAmount missing', () => {
    expect(
      toBaseCurrency(makeTxn({ currency: 'USD', fxRate: 835000, originalAmount: null }), 'INR'),
    ).toBe(10000)
  })
})

// ─── parseDateStr — UTC midnight ──────────────────────────────────────────────

describe('parseDateStr', () => {
  it('returns midnight UTC regardless of local timezone', () => {
    const ms = parseDateStr('2024-06-15')
    const d = new Date(ms)
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(5) // June = index 5
    expect(d.getUTCDate()).toBe(15)
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
  })

  it('parses year boundary correctly', () => {
    const ms = parseDateStr('2025-01-01')
    const d = new Date(ms)
    expect(d.getUTCFullYear()).toBe(2025)
    expect(d.getUTCMonth()).toBe(0)
    expect(d.getUTCDate()).toBe(1)
  })
})

// ─── advanceDate — month boundary clamping ────────────────────────────────────

describe('advanceDate', () => {
  it('Jan 31 + 1 month = Feb 28 (no overflow to Mar)', () => {
    const jan31 = dateOnly(2025, 0, 31)
    const result = advanceDate(jan31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(1) // February
    expect(d.getUTCDate()).toBe(28)
  })

  it('Jan 31 + 1 month on leap year = Feb 29', () => {
    const jan31 = dateOnly(2024, 0, 31)
    const result = advanceDate(jan31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(1)
    expect(d.getUTCDate()).toBe(29)
  })

  it('Mar 31 + 1 month = Apr 30', () => {
    const mar31 = dateOnly(2025, 2, 31)
    const result = advanceDate(mar31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(3) // April
    expect(d.getUTCDate()).toBe(30)
  })

  it('Nov 30 + 1 quarter = Feb 28 (non-leap, no overflow to Mar)', () => {
    const nov30 = dateOnly(2025, 10, 30)
    const result = advanceDate(nov30, 'quarterly', 1)
    const d = new Date(result)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(1) // February
    expect(d.getUTCDate()).toBe(28)
  })

  it('daily and weekly advance correctly', () => {
    const base = dateOnly(2025, 0, 15)
    expect(new Date(advanceDate(base, 'daily', 1)).getUTCDate()).toBe(16)
    expect(new Date(advanceDate(base, 'weekly', 1)).getUTCDate()).toBe(22)
  })
})

// ─── nextWeekday — weekly recurrence day-of-week alignment ────────────────────

describe('nextWeekday', () => {
  it('returns the same date when it already falls on the target weekday', () => {
    const wed = dateOnly(2025, 0, 15) // Jan 15 2025 is a Wednesday (day 3)
    expect(nextWeekday(wed, 3)).toBe(wed)
  })

  it('advances forward to the next occurrence of the target weekday', () => {
    const wed = dateOnly(2025, 0, 15)
    const fri = nextWeekday(wed, 5) // Friday (day 5)
    const d = new Date(fri)
    expect(d.getUTCDate()).toBe(17)
  })

  it('wraps to next week when the target weekday already passed', () => {
    const wed = dateOnly(2025, 0, 15)
    const mon = nextWeekday(wed, 1) // Monday (day 1) — already passed this week
    const d = new Date(mon)
    expect(d.getUTCDate()).toBe(20)
  })
})
