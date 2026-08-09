import { describe, expect, it } from 'vitest'
import type { Budget, Category, Recurrence, Transaction } from '@/db/schema'
import { computeDashboardMetrics } from '@/lib/dashboardMetrics'

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

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    categoryId: 'cat-1',
    groupId: 'g1',
    name: 'Groceries',
    icon: 'ShoppingCart',
    color: '#f59e0b',
    type: 'expense',
    sortOrder: 0,
    isDefault: false,
    createdBy: 'u1',
    createdAt: 0,
    ...overrides,
  }
}

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
    nextDue: Date.UTC(2026, 6, 1),
    lastGeneratedAt: null,
    endDate: null,
    active: true,
    createdAt: 0,
    ...overrides,
  }
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    budgetId: 'b1',
    groupId: 'g1',
    categoryId: 'cat-1',
    limit: 100000,
    period: 'monthly',
    updatedAt: 0,
    ...overrides,
  }
}

describe('computeDashboardMetrics', () => {
  it('sums expense/income totals and per-category spend, excluding transfers', () => {
    const txns = [
      makeTxn({ txnId: 't1', type: 'expense', amount: 10000, categoryId: 'cat-1' }),
      makeTxn({ txnId: 't2', type: 'expense', amount: 5000, categoryId: 'cat-2' }),
      makeTxn({ txnId: 't3', type: 'income', amount: 200000 }),
      makeTxn({ txnId: 't4', type: 'transfer', amount: 99999 }),
    ]
    const result = computeDashboardMetrics(txns, [], [], [], 'INR')

    expect(result.totalExpense).toBe(15000)
    expect(result.totalIncome).toBe(200000)
    expect(result.categorySpend).toEqual({ 'cat-1': 10000, 'cat-2': 5000 })
  })

  it('converts to base currency via fxRate/originalAmount when currencies differ', () => {
    const txns = [
      makeTxn({
        type: 'expense',
        amount: 10000,
        currency: 'USD',
        fxRate: 8300, // basis points: 1 USD = 83.00 INR
        originalAmount: 10000,
      }),
    ]
    const result = computeDashboardMetrics(txns, [], [], [], 'INR')
    expect(result.totalExpense).toBe(Math.round((10000 * 8300) / 10000))
  })

  it('buckets categories beyond the top 5 into "Other" with a breakdown, sorted by amount', () => {
    const categories = Array.from({ length: 7 }, (_, i) =>
      makeCategory({ categoryId: `cat-${i}`, name: `Cat ${i}` }),
    )
    // Amounts descending: cat-0 highest ... cat-6 lowest
    const txns = categories.map((c, i) =>
      makeTxn({ txnId: `t${i}`, categoryId: c.categoryId, amount: (7 - i) * 1000 }),
    )
    const result = computeDashboardMetrics(txns, [], [], categories, 'INR')

    expect(result.donutSlices).toHaveLength(6)
    const other = result.donutSlices[5]
    expect(other?.name).toBe('Other')
    expect(other?.color).toBe('#64748b')
    // cat-5 (2000) + cat-6 (1000) are ranked 6th/7th
    expect(other?.amount).toBe(3000)
    expect(other?.breakdown).toEqual([
      { name: 'Cat 5', amount: 2000 },
      { name: 'Cat 6', amount: 1000 },
    ])
  })

  it('does not add an "Other" bucket when 5 or fewer categories have spend', () => {
    const categories = [
      makeCategory({ categoryId: 'cat-1' }),
      makeCategory({ categoryId: 'cat-2' }),
    ]
    const txns = [
      makeTxn({ categoryId: 'cat-1', amount: 1000 }),
      makeTxn({ txnId: 't2', categoryId: 'cat-2', amount: 2000 }),
    ]
    const result = computeDashboardMetrics(txns, [], [], categories, 'INR')
    expect(result.donutSlices).toHaveLength(2)
    expect(result.donutSlices.some((s) => s.name === 'Other')).toBe(false)
  })

  it('falls back to "Unknown" for a transaction whose category no longer exists', () => {
    const txns = [makeTxn({ categoryId: 'deleted-cat', amount: 1000 })]
    const result = computeDashboardMetrics(txns, [], [], [], 'INR')
    expect(result.donutSlices).toEqual([{ name: 'Unknown', color: '#888', amount: 1000 }])
  })

  it('computes fixedExpense/fixedItems using the actual transaction amount when generated this month', () => {
    const recurrences = [makeRecurrence({ recurrenceId: 'rec-1', isFixed: true })]
    const txns = [
      makeTxn({
        txnId: 't1',
        recurrenceId: 'rec-1',
        type: 'expense',
        amount: 55000, // differs from template's 50000
      }),
    ]
    const result = computeDashboardMetrics(txns, recurrences, [], [], 'INR')

    expect(result.fixedExpense).toBe(55000)
    expect(result.fixedItems).toEqual([
      {
        recurrenceId: 'rec-1',
        categoryId: 'cat-1',
        amount: 55000,
        note: 'Rent',
        frequency: 'monthly',
      },
    ])
  })

  it('falls back to the template amount when the recurrence has not generated a transaction yet', () => {
    const recurrences = [makeRecurrence({ recurrenceId: 'rec-1', isFixed: true })]
    const result = computeDashboardMetrics([], recurrences, [], [], 'INR')

    expect(result.fixedExpense).toBe(0)
    expect(result.fixedItems).toEqual([
      {
        recurrenceId: 'rec-1',
        categoryId: 'cat-1',
        amount: 50000, // template.amount
        note: 'Rent',
        frequency: 'monthly',
      },
    ])
  })

  it('ignores recurrences that are not isFixed or not expense-type', () => {
    const recurrences = [
      makeRecurrence({ recurrenceId: 'rec-1', isFixed: false }),
      makeRecurrence({
        recurrenceId: 'rec-2',
        isFixed: true,
        template: { ...makeRecurrence().template, type: 'income' },
      }),
    ]
    const result = computeDashboardMetrics([], recurrences, [], [], 'INR')
    expect(result.fixedExpense).toBe(0)
    expect(result.fixedItems).toEqual([])
  })

  it('sums only monthly-period budgets', () => {
    const budgets = [
      makeBudget({ budgetId: 'b1', period: 'monthly', limit: 50000 }),
      makeBudget({ budgetId: 'b2', period: 'monthly', limit: 30000 }),
      makeBudget({ budgetId: 'b3', period: 'yearly', limit: 1000000 }),
    ]
    const result = computeDashboardMetrics([], [], budgets, [], 'INR')
    expect(result.totalBudget).toBe(80000)
  })
})
