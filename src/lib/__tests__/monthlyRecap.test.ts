import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Budget, SavingsGoal, Transaction } from '@/db/schema'
import { computeMonthlyRecap } from '../monthlyRecap'

let transactions: Transaction[] = []
let budgets: Budget[] = []
let goals: SavingsGoal[] = []

const mockDb = vi.hoisted(() => ({
  transactions: { where: vi.fn() },
  budgets: { where: vi.fn() },
  goals: { where: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'expense',
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: '',
    tags: [],
    date: Date.UTC(2026, 5, 15),
    attachmentIds: [],
    recurrenceId: null,
    accountId: null,
    paidBy: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  transactions = []
  budgets = []
  goals = []
  vi.clearAllMocks()
  mockDb.transactions.where.mockImplementation((pred: (t: Transaction) => boolean) =>
    Promise.resolve(transactions.filter(pred)),
  )
  mockDb.budgets.where.mockImplementation((pred: (b: Budget) => boolean) =>
    Promise.resolve(budgets.filter(pred)),
  )
  mockDb.goals.where.mockImplementation((pred: (g: SavingsGoal) => boolean) =>
    Promise.resolve(goals.filter(pred)),
  )
})

describe('computeMonthlyRecap', () => {
  it('sums income and expense for the target month, excluding other months', async () => {
    transactions.push(
      makeTxn({ type: 'income', amount: 50000, date: Date.UTC(2026, 5, 1) }),
      makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2026, 5, 15) }),
      makeTxn({ type: 'expense', amount: 999999, date: Date.UTC(2026, 4, 15) }), // May, excluded
    )
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.income).toBe(50000)
    expect(result.expense).toBe(20000)
    expect(result.netSaved).toBe(30000)
  })

  it('excludes transfers from both income and expense totals', async () => {
    transactions.push(
      makeTxn({ type: 'income', amount: 50000, date: Date.UTC(2026, 5, 1) }),
      makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2026, 5, 15) }),
      makeTxn({ type: 'transfer', amount: 999999, date: Date.UTC(2026, 5, 10) }),
    )
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.income).toBe(50000)
    expect(result.expense).toBe(20000)
  })

  it('hides the comparison when the previous month has no expense', async () => {
    transactions.push(makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2026, 5, 15) }))
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.hasPreviousMonth).toBe(false)
    expect(result.expenseDeltaPct).toBeNull()
  })

  it('computes a percentage delta vs the previous month when data exists', async () => {
    transactions.push(
      makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2026, 5, 15) }), // June
      makeTxn({ type: 'expense', amount: 10000, date: Date.UTC(2026, 4, 15) }), // May
    )
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.hasPreviousMonth).toBe(true)
    expect(result.expenseDeltaPct).toBe(100) // doubled
  })

  it('handles the January -> December-of-previous-year rollover for comparison', async () => {
    transactions.push(
      makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2026, 0, 15) }), // Jan 2026
      makeTxn({ type: 'expense', amount: 20000, date: Date.UTC(2025, 11, 15) }), // Dec 2025
    )
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 0)
    expect(result.hasPreviousMonth).toBe(true)
    expect(result.expenseDeltaPct).toBe(0)
  })

  it('only includes categories that have a budget set', async () => {
    transactions.push(
      makeTxn({ categoryId: 'cat-budgeted', amount: 5000 }),
      makeTxn({ categoryId: 'cat-unbudgeted', amount: 3000 }),
    )
    budgets.push({
      budgetId: 'b1',
      groupId: 'g1',
      categoryId: 'cat-budgeted',
      limit: 10000,
      period: 'monthly',
      updatedAt: 0,
    })
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.budgets).toHaveLength(1)
    expect(result.budgets[0]?.categoryId).toBe('cat-budgeted')
    expect(result.budgets[0]?.spent).toBe(5000)
  })

  it('returns an empty budgets array when the group has no budgets at all', async () => {
    transactions.push(makeTxn({ categoryId: 'cat-1', amount: 5000 }))
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.budgets).toHaveLength(0)
  })

  it('ranks top categories by spend, capped at 5', async () => {
    transactions.push(
      makeTxn({ categoryId: 'a', amount: 100 }),
      makeTxn({ categoryId: 'b', amount: 500 }),
      makeTxn({ categoryId: 'c', amount: 300 }),
      makeTxn({ categoryId: 'd', amount: 50 }),
      makeTxn({ categoryId: 'e', amount: 400 }),
      makeTxn({ categoryId: 'f', amount: 20 }),
    )
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.topCategories).toHaveLength(5)
    expect(result.topCategories.map((c) => c.categoryId)).toEqual(['b', 'e', 'c', 'a', 'd'])
  })

  it('computes this-month delta for a categoryId-linked (auto-tracked) goal', async () => {
    transactions.push(
      makeTxn({ type: 'income', categoryId: 'income-cat', amount: 15000 }),
      makeTxn({ type: 'expense', categoryId: 'other', amount: 1000 }),
    )
    goals.push({
      goalId: 'goal-1',
      groupId: 'g1',
      name: 'Emergency fund',
      target: 100000,
      saved: 40000,
      deadline: null,
      categoryId: 'income-cat',
      createdAt: 0,
      updatedAt: 0,
    })
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.goals[0]?.delta).toBe(15000)
    expect(result.goals[0]?.isAutoTracked).toBe(true)
  })

  it('reports zero delta for a manually-tracked (no categoryId) goal', async () => {
    goals.push({
      goalId: 'goal-2',
      groupId: 'g1',
      name: 'Goa trip',
      target: 50000,
      saved: 20000,
      deadline: null,
      categoryId: null,
      createdAt: 0,
      updatedAt: 0,
    })
    const result = await computeMonthlyRecap('g1', 'INR', 2026, 5)
    expect(result.goals[0]?.delta).toBe(0)
    expect(result.goals[0]?.isAutoTracked).toBe(false)
    expect(result.goals[0]?.saved).toBe(20000)
  })
})
