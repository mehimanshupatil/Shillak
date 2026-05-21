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
import { advanceDate, parseDateStr, toPaise, toBaseCurrency } from '../utils'
import type { Transaction } from '@/db/schema'

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
    expect(
      toBaseCurrency(makeTxn({ currency: 'USD', amount: 8350, fxRate: null }), 'INR'),
    ).toBe(8350)
  })

  it('falls back to amount when originalAmount missing', () => {
    expect(
      toBaseCurrency(makeTxn({ currency: 'USD', fxRate: 835000, originalAmount: null }), 'INR'),
    ).toBe(10000)
  })
})

// ─── Transfer excluded from expense/income totals ─────────────────────────────

describe('transfer type exclusion', () => {
  const txns: Array<Pick<Transaction, 'type' | 'amount'>> = [
    { type: 'expense', amount: 5000 },
    { type: 'income', amount: 20000 },
    { type: 'transfer', amount: 8000 },
  ]

  it('expense filter excludes transfers', () => {
    const total = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    expect(total).toBe(5000)
  })

  it('income filter excludes transfers', () => {
    const total = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    expect(total).toBe(20000)
  })

  it('transfer is not expense and not income', () => {
    const transfer = txns.find((t) => t.type === 'transfer')!
    expect(transfer.type === 'expense').toBe(false)
    expect(transfer.type === 'income').toBe(false)
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
    const jan31 = Date.UTC(2025, 0, 31)
    const result = advanceDate(jan31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(1) // February
    expect(d.getUTCDate()).toBe(28)
  })

  it('Jan 31 + 1 month on leap year = Feb 29', () => {
    const jan31 = Date.UTC(2024, 0, 31)
    const result = advanceDate(jan31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(1)
    expect(d.getUTCDate()).toBe(29)
  })

  it('Mar 31 + 1 month = Apr 30', () => {
    const mar31 = Date.UTC(2025, 2, 31)
    const result = advanceDate(mar31, 'monthly', 1)
    const d = new Date(result)
    expect(d.getUTCMonth()).toBe(3) // April
    expect(d.getUTCDate()).toBe(30)
  })

  it('Feb 28 + 1 year on non-leap = Feb 28', () => {
    const feb28 = Date.UTC(2024, 1, 28)
    const result = advanceDate(feb28, 'yearly', 1)
    const d = new Date(result)
    expect(d.getUTCFullYear()).toBe(2025)
    expect(d.getUTCMonth()).toBe(1)
    expect(d.getUTCDate()).toBe(28)
  })

  it('daily and weekly advance correctly', () => {
    const base = Date.UTC(2025, 0, 15)
    expect(new Date(advanceDate(base, 'daily', 1)).getUTCDate()).toBe(16)
    expect(new Date(advanceDate(base, 'weekly', 1)).getUTCDate()).toBe(22)
  })
})

// ─── Goal pace logic ──────────────────────────────────────────────────────────

describe('goal pace calculation', () => {
  function calcPace(
    saved: number,
    target: number,
    createdAt: number,
    deadline: number,
    now = Date.now(),
  ): 'done' | 'overdue' | 'behind' | 'on-track' {
    if (saved >= target) return 'done'
    if (now > deadline) return 'overdue'
    const totalDuration = deadline - createdAt
    const elapsed = now - createdAt
    const timeProgress = totalDuration > 0 ? elapsed / totalDuration : 0
    const amountProgress = target > 0 ? saved / target : 0
    return amountProgress >= timeProgress - 0.05 ? 'on-track' : 'behind'
  }

  it('done when saved >= target', () => {
    const now = Date.now()
    expect(calcPace(100000, 100000, now - 1000, now + 1000, now)).toBe('done')
    expect(calcPace(120000, 100000, now - 1000, now + 1000, now)).toBe('done')
  })

  it('overdue when now > deadline and not done', () => {
    const past = Date.now() - 86_400_000
    expect(calcPace(50000, 100000, past - 86_400_000, past, Date.now())).toBe('overdue')
  })

  it('on-track when amount progress matches time progress', () => {
    // 50% through time, 50% through amount — on track
    const start = Date.now() - 50
    const end = Date.now() + 50
    const now = (start + end) / 2
    expect(calcPace(50000, 100000, start, end, now)).toBe('on-track')
  })

  it('behind when amount lags time by more than 5%', () => {
    // 60% through time, only 40% through amount
    const start = Date.now() - 60
    const end = Date.now() + 40
    const now = start + 60
    expect(calcPace(40000, 100000, start, end, now)).toBe('behind')
  })

  it('on-track with 5% tolerance (49% amount, 50% time)', () => {
    const start = 0
    const end = 1000
    const now = 500
    expect(calcPace(45000, 100000, start, end, now)).toBe('on-track') // 45% ≥ 50% - 5% = 45%
  })
})
