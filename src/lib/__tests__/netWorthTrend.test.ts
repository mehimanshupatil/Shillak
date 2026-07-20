import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Transaction } from '@/db/schema'
import { computeNetWorthTrend } from '../netWorthTrend'
import { today } from '../utils'

let accounts: Account[] = []
let transactions: Transaction[] = []

const mockDb = vi.hoisted(() => ({
  accounts: { where: vi.fn() },
  transactions: { where: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    accountId: 'acc-1',
    groupId: 'g1',
    name: 'Savings',
    type: 'savings',
    color: '#000',
    icon: 'Bank',
    sortOrder: 0,
    isDefault: true,
    openingBalance: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'income',
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: '',
    tags: [],
    date: today(),
    attachmentIds: [],
    recurrenceId: null,
    accountId: 'acc-1',
    paidBy: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  accounts = []
  transactions = []
  vi.clearAllMocks()
  mockDb.accounts.where.mockImplementation((pred: (a: Account) => boolean) =>
    Promise.resolve(accounts.filter(pred)),
  )
  mockDb.transactions.where.mockImplementation((pred: (t: Transaction) => boolean) =>
    Promise.resolve(transactions.filter(pred)),
  )
})

describe('computeNetWorthTrend', () => {
  it('returns 12 points ending at the current month, reflecting openingBalance with no transactions', async () => {
    accounts.push(makeAccount({ openingBalance: 500000, createdAt: 0 }))
    const result = await computeNetWorthTrend('g1', 'INR')
    expect(result.points).toHaveLength(12)
    expect(result.points[11]?.netWorth).toBe(500000)
    expect(result.points[0]?.netWorth).toBe(500000)
  })

  it('accumulates income and expense into the running balance', async () => {
    accounts.push(makeAccount({ openingBalance: 0, createdAt: 0 }))
    transactions.push(
      makeTxn({ type: 'income', amount: 100000, date: today() }),
      makeTxn({ type: 'expense', amount: 30000, date: today() }),
    )
    const result = await computeNetWorthTrend('g1', 'INR')
    expect(result.points[11]?.netWorth).toBe(70000)
  })

  it('subtracts a credit account balance as a liability', async () => {
    accounts.push(
      makeAccount({ accountId: 'savings', type: 'savings', openingBalance: 500000, createdAt: 0 }),
      makeAccount({ accountId: 'cc', type: 'credit', openingBalance: 100000, createdAt: 0 }),
    )
    const result = await computeNetWorthTrend('g1', 'INR')
    expect(result.points[11]?.netWorth).toBe(400000)
  })

  it('moves balance between accounts on a transfer without double-counting', async () => {
    accounts.push(
      makeAccount({ accountId: 'a', openingBalance: 100000, createdAt: 0 }),
      makeAccount({ accountId: 'b', openingBalance: 0, createdAt: 0 }),
    )
    transactions.push(
      makeTxn({ type: 'transfer', amount: 50000, accountId: 'a', toAccountId: 'b', date: today() }),
    )
    const result = await computeNetWorthTrend('g1', 'INR')
    // total household net worth unchanged by an internal transfer
    expect(result.points[11]?.netWorth).toBe(100000)
  })

  it('omits an account from months before its createdAt', async () => {
    const DAY = 86_400_000
    const recentlyCreated = today() - 5 * DAY // created 5 days ago — should be missing from most of the 12mo window
    accounts.push(
      makeAccount({ accountId: 'old', openingBalance: 100000, createdAt: 0 }),
      makeAccount({ accountId: 'new', openingBalance: 50000, createdAt: recentlyCreated }),
    )
    const result = await computeNetWorthTrend('g1', 'INR')
    // 11 months ago: only 'old' account existed
    expect(result.points[0]?.netWorth).toBe(100000)
    // current month: both exist
    expect(result.points[11]?.netWorth).toBe(150000)
  })

  it('excludes soft-deleted transactions', async () => {
    accounts.push(makeAccount({ openingBalance: 0, createdAt: 0 }))
    transactions.push(
      makeTxn({ type: 'income', amount: 100000, date: today(), deletedAt: Date.now() }),
    )
    const result = await computeNetWorthTrend('g1', 'INR')
    expect(result.points[11]?.netWorth).toBe(0)
  })
})
