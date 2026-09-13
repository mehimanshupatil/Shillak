import { describe, expect, it } from 'vitest'
import type { Account, Category, GroupMember, Transaction, TransactionType } from '@/db/schema'
import type { Ledger } from '@/lib/ledger/read'
import {
  accountBalances,
  boundFromInput,
  earnedInCategory,
  ledgerFrom,
  monthlySpendByCategory,
  monthlyTotals,
  monthRange,
  recentRows,
  rowsMatching,
  spendByCategory,
  spendInCategory,
  statedIncomeBaseline,
  totals,
} from '@/lib/ledger/read'
import { dateOnly } from '@/lib/utils'

const JUN = (day: number) => dateOnly(2026, 5, day)
const MAY = (day: number) => dateOnly(2026, 4, day)

let nextId = 0

function txn(overrides: Partial<Transaction> = {}): Transaction {
  nextId += 1
  return {
    txnId: `txn-${nextId}`,
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'expense' as TransactionType,
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: '',
    tags: [],
    date: JUN(15),
    attachmentIds: [],
    recurrenceId: null,
    accountId: 'acc-1',
    toAccountId: null,
    paidBy: 'u1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

function ledgerOf(transactions: Transaction[], currency = 'INR'): Ledger {
  return { transactions, currency }
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    accountId: 'acc-1',
    groupId: 'g1',
    name: 'Main',
    type: 'savings',
    color: '#fff',
    icon: 'bank',
    sortOrder: 0,
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Account
}

// ─── Totals ───────────────────────────────────────────────────────────────────

describe('ledgerFrom', () => {
  it('drops voided transactions — the one place that decides what is still in the Ledger', () => {
    const ledger = ledgerFrom([txn({ amount: 100 }), txn({ amount: 900, deletedAt: 123 })], 'INR')
    expect(ledger.transactions).toHaveLength(1)
    expect(totals(ledger).expense).toBe(100)
  })

  it('carries the Base currency through', () => {
    expect(ledgerFrom([], 'USD').currency).toBe('USD')
  })
})

describe('totals', () => {
  it('sums income and expense and reports the difference', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', amount: 50000 }),
      txn({ type: 'expense', amount: 20000 }),
      txn({ type: 'expense', amount: 5000 }),
    ])
    expect(totals(ledger)).toEqual({ income: 50000, expense: 25000, net: 25000 })
  })

  it('excludes transfers from both sides', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', amount: 50000 }),
      txn({ type: 'transfer', amount: 30000, toAccountId: 'acc-2' }),
    ])
    expect(totals(ledger)).toEqual({ income: 50000, expense: 0, net: 50000 })
  })

  it('converts foreign-currency amounts to the Base currency', () => {
    const ledger = ledgerOf([
      txn({ type: 'expense', amount: 999, currency: 'USD', fxRate: 830000, originalAmount: 100 }),
    ])
    // 100 paise-equivalent × 83.0000 → 8300, not the stored 999
    expect(totals(ledger).expense).toBe(8300)
  })

  it('honours an inclusive range at both ends', () => {
    const ledger = ledgerOf([
      txn({ date: JUN(1), amount: 100 }),
      txn({ date: JUN(15), amount: 200 }),
      txn({ date: JUN(30), amount: 400 }),
    ])
    expect(totals(ledger, { from: JUN(1), to: JUN(30) }).expense).toBe(700)
    expect(totals(ledger, { from: JUN(2), to: JUN(29) }).expense).toBe(200)
  })

  it('treats an open end as unbounded', () => {
    const ledger = ledgerOf([
      txn({ date: MAY(1), amount: 100 }),
      txn({ date: JUN(1), amount: 200 }),
    ])
    expect(totals(ledger, { from: JUN(1) }).expense).toBe(200)
    expect(totals(ledger, { to: MAY(31) }).expense).toBe(100)
  })

  it('reports a negative net when spending outruns earning', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', amount: 1000 }),
      txn({ type: 'expense', amount: 2500 }),
    ])
    expect(totals(ledger).net).toBe(-1500)
  })
})

// ─── Categories ───────────────────────────────────────────────────────────────

describe('spendByCategory', () => {
  it('groups expense by category, largest first', () => {
    const ledger = ledgerOf([
      txn({ categoryId: 'a', amount: 100 }),
      txn({ categoryId: 'b', amount: 900 }),
      txn({ categoryId: 'a', amount: 300 }),
    ])
    expect(spendByCategory(ledger)).toEqual([
      { categoryId: 'b', amount: 900 },
      { categoryId: 'a', amount: 400 },
    ])
  })

  it('ignores income and transfers', () => {
    const ledger = ledgerOf([
      txn({ categoryId: 'a', type: 'income', amount: 900 }),
      txn({ categoryId: '', type: 'transfer', amount: 900, toAccountId: 'acc-2' }),
      txn({ categoryId: 'a', amount: 100 }),
    ])
    expect(spendByCategory(ledger)).toEqual([{ categoryId: 'a', amount: 100 }])
  })

  it('is empty when nothing was spent', () => {
    expect(spendByCategory(ledgerOf([]))).toEqual([])
  })
})

describe('spendInCategory', () => {
  it('totals one category over a period', () => {
    const ledger = ledgerOf([
      txn({ categoryId: 'a', date: JUN(1), amount: 100 }),
      txn({ categoryId: 'a', date: MAY(1), amount: 500 }),
      txn({ categoryId: 'b', date: JUN(1), amount: 900 }),
    ])
    expect(spendInCategory(ledger, 'a', monthRange(JUN(15)))).toBe(100)
  })

  it('is zero for a category with no spending', () => {
    expect(spendInCategory(ledgerOf([txn({ categoryId: 'a' })]), 'b')).toBe(0)
  })

  it('ignores income filed under the same category id', () => {
    const ledger = ledgerOf([txn({ categoryId: 'a', type: 'income', amount: 900 })])
    expect(spendInCategory(ledger, 'a')).toBe(0)
  })
})

// ─── Months ───────────────────────────────────────────────────────────────────

describe('monthlyTotals', () => {
  it('returns the trailing months oldest first, ending with today’s', () => {
    const buckets = monthlyTotals(ledgerOf([]), { today: JUN(15), months: 3 })
    expect(buckets.map((b) => [b.year, b.month])).toEqual([
      [2026, 3],
      [2026, 4],
      [2026, 5],
    ])
  })

  it('crosses a year boundary backwards', () => {
    const buckets = monthlyTotals(ledgerOf([]), { today: dateOnly(2026, 1, 10), months: 4 })
    expect(buckets.map((b) => [b.year, b.month])).toEqual([
      [2025, 10],
      [2025, 11],
      [2026, 0],
      [2026, 1],
    ])
  })

  it('files each transaction into its own UTC month', () => {
    const ledger = ledgerOf([
      txn({ date: MAY(31), amount: 100 }),
      txn({ date: JUN(1), amount: 200 }),
      txn({ type: 'income', date: JUN(30), amount: 900 }),
    ])
    const buckets = monthlyTotals(ledger, { today: JUN(15), months: 2 })
    expect(buckets[0]).toMatchObject({ month: 4, expense: 100, income: 0 })
    expect(buckets[1]).toMatchObject({ month: 5, expense: 200, income: 900, net: 700 })
  })

  it('drops transactions outside the window rather than folding them into an edge', () => {
    const ledger = ledgerOf([txn({ date: dateOnly(2025, 0, 1), amount: 100 })])
    const buckets = monthlyTotals(ledger, { today: JUN(15), months: 2 })
    expect(buckets.every((b) => b.expense === 0)).toBe(true)
  })

  it('excludes transfers', () => {
    const ledger = ledgerOf([
      txn({ type: 'transfer', date: JUN(2), amount: 500, toAccountId: 'acc-2' }),
    ])
    expect(monthlyTotals(ledger, { today: JUN(15), months: 1 })[0]).toMatchObject({
      income: 0,
      expense: 0,
    })
  })

  it('does not read the clock — the same call twice gives the same answer', () => {
    const a = monthlyTotals(ledgerOf([]), { today: JUN(15), months: 2 })
    const b = monthlyTotals(ledgerOf([]), { today: JUN(15), months: 2 })
    expect(a).toEqual(b)
  })
})

describe('monthRange', () => {
  it('spans the first to the last day of the containing month', () => {
    expect(monthRange(JUN(15))).toEqual({ from: JUN(1), to: JUN(30) })
  })

  it('handles February in a leap year', () => {
    expect(monthRange(dateOnly(2024, 1, 10))).toEqual({
      from: dateOnly(2024, 1, 1),
      to: dateOnly(2024, 1, 29),
    })
  })

  it('handles December without spilling into the next year', () => {
    expect(monthRange(dateOnly(2026, 11, 5))).toEqual({
      from: dateOnly(2026, 11, 1),
      to: dateOnly(2026, 11, 31),
    })
  })
})

// ─── Balances ─────────────────────────────────────────────────────────────────

describe('accountBalances', () => {
  it('starts from the opening balance', () => {
    const acc = account({ openingBalance: 5000 })
    expect(accountBalances(ledgerOf([]), [acc])['acc-1']).toBe(5000)
  })

  it('adds income and subtracts expense', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', amount: 3000 }),
      txn({ type: 'expense', amount: 1000 }),
    ])
    expect(accountBalances(ledger, [account()])['acc-1']).toBe(2000)
  })

  it('moves money between both sides of a transfer', () => {
    const ledger = ledgerOf([
      txn({ type: 'transfer', amount: 2000, accountId: 'acc-1', toAccountId: 'acc-2' }),
    ])
    const balances = accountBalances(ledger, [
      account(),
      account({ accountId: 'acc-2', name: 'Savings' }),
    ])
    expect(balances['acc-1']).toBe(-2000)
    expect(balances['acc-2']).toBe(2000)
  })

  it('flips the sign for a credit account, which tracks what is owed', () => {
    const credit = account({ accountId: 'card', type: 'credit' })
    const charge = ledgerOf([txn({ type: 'expense', amount: 1500, accountId: 'card' })])
    expect(accountBalances(charge, [credit]).card).toBe(1500)

    const payment = ledgerOf([
      txn({ type: 'transfer', amount: 1500, accountId: 'acc-1', toAccountId: 'card' }),
    ])
    expect(accountBalances(payment, [credit]).card).toBe(-1500)
  })

  it('leaves an account untouched by transactions that do not name it', () => {
    const ledger = ledgerOf([txn({ accountId: 'other', amount: 999 })])
    expect(accountBalances(ledger, [account({ openingBalance: 100 })])['acc-1']).toBe(100)
  })

  it('converts foreign amounts before applying them', () => {
    const ledger = ledgerOf([
      txn({ type: 'expense', amount: 1, currency: 'USD', fxRate: 830000, originalAmount: 100 }),
    ])
    expect(accountBalances(ledger, [account()])['acc-1']).toBe(-8300)
  })
})

// ─── Rows ─────────────────────────────────────────────────────────────────────

describe('rowsMatching', () => {
  const CATEGORIES: Category[] = [
    { categoryId: 'cat-1', name: 'Groceries' } as Category,
    { categoryId: 'cat-2', name: 'Dining' } as Category,
  ]

  it('returns newest first', () => {
    const ledger = ledgerOf([txn({ date: JUN(1) }), txn({ date: JUN(20) }), txn({ date: JUN(10) })])
    expect(rowsMatching(ledger).map((t) => t.date)).toEqual([JUN(20), JUN(10), JUN(1)])
  })

  it('matches the search against the note', () => {
    const ledger = ledgerOf([txn({ note: 'Coffee beans' }), txn({ note: 'Petrol' })])
    expect(rowsMatching(ledger, { search: 'coffee' })).toHaveLength(1)
  })

  it('matches the search against the category name too', () => {
    const ledger = ledgerOf([txn({ categoryId: 'cat-2', note: '' })])
    expect(rowsMatching(ledger, { search: 'dining' }, CATEGORIES)).toHaveLength(1)
  })

  it('finds nothing by category name when no categories are supplied', () => {
    const ledger = ledgerOf([txn({ categoryId: 'cat-2', note: '' })])
    expect(rowsMatching(ledger, { search: 'dining' })).toHaveLength(0)
  })

  it('filters by type, category, owner and tag', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', categoryId: 'cat-2', ownerId: 'u2', tags: ['bonus'] }),
      txn({ type: 'expense', categoryId: 'cat-1', ownerId: 'u1', tags: ['food'] }),
    ])
    expect(rowsMatching(ledger, { type: 'income' })).toHaveLength(1)
    expect(rowsMatching(ledger, { categoryId: 'cat-1' })).toHaveLength(1)
    expect(rowsMatching(ledger, { ownerId: 'u2' })).toHaveLength(1)
    expect(rowsMatching(ledger, { tag: 'FOOD' })).toHaveLength(1)
  })

  it('applies a date range', () => {
    const ledger = ledgerOf([txn({ date: MAY(1) }), txn({ date: JUN(15) })])
    expect(rowsMatching(ledger, { range: { from: JUN(1) } })).toHaveLength(1)
  })

  it('hides other Members’ rows in a totals-only Space', () => {
    const ledger = ledgerOf([txn({ ownerId: 'u1' }), txn({ ownerId: 'u2' })])
    expect(rowsMatching(ledger, { onlyOwnedBy: 'u1' })).toHaveLength(1)
    expect(rowsMatching(ledger)).toHaveLength(2)
  })

  it('combines filters rather than picking one', () => {
    const ledger = ledgerOf([
      txn({ type: 'expense', ownerId: 'u1', note: 'Coffee' }),
      txn({ type: 'expense', ownerId: 'u2', note: 'Coffee' }),
      txn({ type: 'income', ownerId: 'u1', note: 'Coffee' }),
    ])
    expect(rowsMatching(ledger, { type: 'expense', ownerId: 'u1', search: 'coffee' })).toHaveLength(
      1,
    )
  })
})

describe('recentRows', () => {
  it('takes the newest n', () => {
    const ledger = ledgerOf([txn({ date: JUN(1) }), txn({ date: JUN(20) }), txn({ date: JUN(10) })])
    expect(recentRows(ledger, 2).map((t) => t.date)).toEqual([JUN(20), JUN(10)])
  })

  it('returns everything when asked for more than exists', () => {
    expect(recentRows(ledgerOf([txn()]), 5)).toHaveLength(1)
  })
})

// ─── Bounds ───────────────────────────────────────────────────────────────────

describe('boundFromInput', () => {
  it('reads a date-only string as midnight UTC', () => {
    expect(boundFromInput('2026-06-15')).toBe(JUN(15))
  })

  it('treats blank input as no bound', () => {
    expect(boundFromInput('')).toBeUndefined()
    expect(boundFromInput('   ')).toBeUndefined()
  })

  it('treats unparseable input as no bound, not as epoch zero', () => {
    expect(boundFromInput('not-a-date')).toBeUndefined()
    expect(boundFromInput('2026-06')).toBeUndefined()
  })
})

// ─── Category income and sparklines ───────────────────────────────────────────

describe('earnedInCategory', () => {
  it('totals income in one category', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', categoryId: 'a', amount: 500 }),
      txn({ type: 'income', categoryId: 'b', amount: 900 }),
    ])
    expect(earnedInCategory(ledger, 'a')).toBe(500)
  })

  it('ignores expense filed under the same category', () => {
    const ledger = ledgerOf([txn({ type: 'expense', categoryId: 'a', amount: 500 })])
    expect(earnedInCategory(ledger, 'a')).toBe(0)
  })

  it('counts only what arrived on or after an open-ended start', () => {
    const ledger = ledgerOf([
      txn({ type: 'income', categoryId: 'a', date: MAY(1), amount: 100 }),
      txn({ type: 'income', categoryId: 'a', date: JUN(1), amount: 200 }),
    ])
    expect(earnedInCategory(ledger, 'a', { from: JUN(1) })).toBe(200)
  })
})

describe('monthlySpendByCategory', () => {
  it('returns one oldest-first row per category that had spending', () => {
    const ledger = ledgerOf([
      txn({ categoryId: 'a', date: MAY(2), amount: 100 }),
      txn({ categoryId: 'a', date: JUN(2), amount: 300 }),
      txn({ categoryId: 'b', date: JUN(3), amount: 700 }),
    ])
    expect(monthlySpendByCategory(ledger, { today: JUN(15), months: 2 })).toEqual({
      a: [100, 300],
      b: [0, 700],
    })
  })

  it('leaves out categories with no spending in the window', () => {
    const ledger = ledgerOf([txn({ categoryId: 'a', date: dateOnly(2020, 0, 1), amount: 100 })])
    expect(monthlySpendByCategory(ledger, { today: JUN(15), months: 3 })).toEqual({})
  })

  it('ignores income and transfers', () => {
    const ledger = ledgerOf([
      txn({ categoryId: 'a', type: 'income', date: JUN(2), amount: 900 }),
      txn({ categoryId: 'a', type: 'transfer', date: JUN(2), amount: 900, toAccountId: 'x' }),
    ])
    expect(monthlySpendByCategory(ledger, { today: JUN(15), months: 2 })).toEqual({})
  })

  it('rows are as long as the window asked for', () => {
    const ledger = ledgerOf([txn({ categoryId: 'a', date: JUN(2), amount: 100 })])
    expect(monthlySpendByCategory(ledger, { today: JUN(15), months: 6 }).a).toHaveLength(6)
  })
})

// ─── Stated income ────────────────────────────────────────────────────────────

describe('statedIncomeBaseline', () => {
  function member(overrides: Partial<GroupMember> = {}): GroupMember {
    return {
      id: 'm1',
      groupId: 'g1',
      userId: 'u1',
      role: 'member',
      status: 'active',
      joinedAt: 0,
      leftAt: null,
      nickname: null,
      monthlyIncome: 50000,
      incomeCurrency: 'INR',
      updatedAt: 0,
      ...overrides,
    } as GroupMember
  }

  it('sums incomes already in the Base currency', () => {
    const result = statedIncomeBaseline(
      [member(), member({ id: 'm2', monthlyIncome: 30000 })],
      'INR',
    )
    expect(result).toEqual({ amount: 80000, excludedMembers: 0 })
  })

  it('treats an unset income currency as the Base currency', () => {
    expect(statedIncomeBaseline([member({ incomeCurrency: null })], 'INR').amount).toBe(50000)
  })

  it('leaves out an income stated in another currency instead of adding it raw', () => {
    const result = statedIncomeBaseline(
      [member(), member({ id: 'm2', monthlyIncome: 300000, incomeCurrency: 'USD' })],
      'INR',
    )
    expect(result).toEqual({ amount: 50000, excludedMembers: 1 })
  })

  it('skips members who have stated no income at all', () => {
    const result = statedIncomeBaseline([member({ monthlyIncome: null })], 'INR')
    expect(result).toEqual({ amount: 0, excludedMembers: 0 })
  })

  it('is zero for a household that has stated nothing', () => {
    expect(statedIncomeBaseline([], 'INR')).toEqual({ amount: 0, excludedMembers: 0 })
  })
})
