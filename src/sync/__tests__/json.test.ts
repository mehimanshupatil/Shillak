import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Account,
  Budget,
  Category,
  Group,
  GroupMember,
  SavingsGoal,
  Transaction,
} from '@/db/schema'
import { exportGroupSnapshot, importGroupSnapshot } from '../json'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  groups: { get: vi.fn(), put: vi.fn() },
  members: { where: vi.fn(), put: vi.fn() },
  categories: { where: vi.fn(), put: vi.fn() },
  transactions: { where: vi.fn(), put: vi.fn() },
  recurrences: { where: vi.fn(), put: vi.fn() },
  budgets: { where: vi.fn(), put: vi.fn() },
  goals: { where: vi.fn(), put: vi.fn() },
  accounts: { where: vi.fn(), put: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupId: 'g1',
    name: 'Home',
    avatarColor: '#000',
    createdBy: 'u1',
    currency: 'INR',
    fiscalYearStart: 4,
    visibility: 'full',
    status: 'active',
    groupSecret: 'secret',
    vectorClock: { u1: 1 },
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
    type: 'expense',
    amount: 12345,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'Coffee',
    tags: ['cafe'],
    date: Date.UTC(2025, 0, 1),
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

function makeFile(snapshot: unknown): File {
  return new File([JSON.stringify(snapshot)], 'snapshot.shillak', { type: 'application/json' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportGroupSnapshot', () => {
  it('throws if the group does not exist', async () => {
    mockDb.groups.get.mockResolvedValue(undefined)
    await expect(exportGroupSnapshot('missing')).rejects.toThrow('Group not found')
  })

  it('bundles every entity type scoped to the group', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.members.where.mockResolvedValue([])
    mockDb.categories.where.mockResolvedValue([])
    mockDb.transactions.where.mockResolvedValue([makeTxn()])
    mockDb.recurrences.where.mockResolvedValue([])
    mockDb.budgets.where.mockResolvedValue([])
    mockDb.goals.where.mockResolvedValue([])
    mockDb.accounts.where.mockResolvedValue([])

    const snapshot = await exportGroupSnapshot('g1')

    expect(snapshot.version).toBe(1)
    expect(snapshot.groupId).toBe('g1')
    expect(snapshot.transactions).toHaveLength(1)
  })
})

describe('importGroupSnapshot', () => {
  it('rejects a snapshot with an unsupported version', async () => {
    const file = makeFile({ version: 2, groupId: 'g1' })
    await expect(importGroupSnapshot(file)).rejects.toThrow('Unsupported snapshot version')
  })

  it('rejects a snapshot missing groupId', async () => {
    const file = makeFile({ version: 1 })
    await expect(importGroupSnapshot(file)).rejects.toThrow('Invalid snapshot: missing groupId')
  })

  it('round-trips an exported snapshot back into matching put calls', async () => {
    mockDb.groups.get.mockResolvedValueOnce(makeGroup()).mockResolvedValueOnce(undefined)
    mockDb.members.where.mockResolvedValue([{ id: 'm1' } as GroupMember])
    mockDb.categories.where.mockResolvedValue([{ categoryId: 'cat-1' } as Category])
    mockDb.transactions.where.mockResolvedValue([makeTxn()])
    mockDb.recurrences.where.mockResolvedValue([])
    mockDb.budgets.where.mockResolvedValue([{ budgetId: 'b1' } as Budget])
    mockDb.goals.where.mockResolvedValue([{ goalId: 'goal-1' } as SavingsGoal])
    mockDb.accounts.where.mockResolvedValue([{ accountId: 'acc-1' } as Account])

    const snapshot = await exportGroupSnapshot('g1')
    const file = makeFile(snapshot)

    const { imported, groupId } = await importGroupSnapshot(file)

    expect(groupId).toBe('g1')
    // group + member + category + txn + budget + goal + account = 7
    expect(imported).toBe(7)
    expect(mockDb.groups.put).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1' }))
    expect(mockDb.transactions.put).toHaveBeenCalledWith(
      expect.objectContaining({ txnId: 'txn-1', amount: 12345 }),
    )
  })

  it('does not overwrite an existing group on import (merge, not replace)', async () => {
    mockDb.groups.get.mockResolvedValueOnce(makeGroup()).mockResolvedValueOnce(makeGroup())
    mockDb.members.where.mockResolvedValue([])
    mockDb.categories.where.mockResolvedValue([])
    mockDb.transactions.where.mockResolvedValue([])
    mockDb.recurrences.where.mockResolvedValue([])
    mockDb.budgets.where.mockResolvedValue([])
    mockDb.goals.where.mockResolvedValue([])
    mockDb.accounts.where.mockResolvedValue([])

    const snapshot = await exportGroupSnapshot('g1')
    const file = makeFile(snapshot)

    const { imported } = await importGroupSnapshot(file)

    expect(mockDb.groups.put).not.toHaveBeenCalled()
    expect(imported).toBe(0)
  })
})
