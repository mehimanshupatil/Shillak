import { describe, expect, it, vi } from 'vitest'
import type { Account, Budget, Category, Group, GroupMember, Transaction, User } from '@/db/schema'
import { computeDelta, computeSince, incrementVectorClock, mergeClock } from '../vector-clock'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  groups: { get: vi.fn(), update: vi.fn() },
  transactions: { where: vi.fn() },
  categories: { where: vi.fn() },
  members: { where: vi.fn() },
  budgets: { where: vi.fn() },
  goals: { where: vi.fn() },
  recurrences: { where: vi.fn() },
  accounts: { where: vi.fn() },
  users: { bulkGet: vi.fn() },
}))

const mockAppStore = vi.hoisted(() => ({ currentUserId: 'u1' }))

vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/stores/app.store', () => ({
  default: { getState: () => mockAppStore },
}))

// ── Factories ─────────────────────────────────────────────────────────────────

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
    vectorClock: { u1: 2 },
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
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: '',
    tags: [],
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

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    categoryId: 'cat-1',
    groupId: 'g1',
    name: 'Dining',
    icon: 'utensils',
    color: '#f00',
    type: 'expense',
    sortOrder: 0,
    isDefault: false,
    createdBy: 'u1',
    createdAt: 0,
    ...overrides,
  }
}

function makeMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: 'm1',
    groupId: 'g1',
    userId: 'u1',
    role: 'member',
    status: 'active',
    joinedAt: 0,
    leftAt: null,
    nickname: null,
    monthlyIncome: null,
    incomeCurrency: null,
    updatedAt: 0,
    ...overrides,
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'u1',
    displayName: 'A',
    avatarColor: '#000',
    identityBackupHint: '',
    createdAt: 0,
    ...overrides,
  }
}

function stubDelta(
  opts: {
    budgets?: Budget[]
    goals?: unknown[]
    recurrences?: unknown[]
    accounts?: Account[]
  } = {},
) {
  mockDb.budgets.where.mockResolvedValue(opts.budgets ?? [])
  mockDb.goals.where.mockResolvedValue(opts.goals ?? [])
  mockDb.recurrences.where.mockResolvedValue(opts.recurrences ?? [])
  mockDb.accounts.where.mockResolvedValue(opts.accounts ?? [])
}

describe('mergeClock', () => {
  it('takes the max of each shared entry', () => {
    expect(mergeClock({ a: 3, b: 1 }, { a: 2, b: 5 })).toEqual({ a: 3, b: 5 })
  })

  it('adds entries only present in remote', () => {
    expect(mergeClock({ a: 1 }, { a: 1, b: 4 })).toEqual({ a: 1, b: 4 })
  })

  it('keeps entries only present in local', () => {
    expect(mergeClock({ a: 1, b: 4 }, { a: 1 })).toEqual({ a: 1, b: 4 })
  })

  it('does not mutate the input clocks', () => {
    const local = { a: 1 }
    const remote = { a: 2 }
    mergeClock(local, remote)
    expect(local).toEqual({ a: 1 })
    expect(remote).toEqual({ a: 2 })
  })
})

// ─── computeDelta ────────────────────────────────────────────────────────────

describe('computeDelta', () => {
  it('throws if the group does not exist', async () => {
    mockDb.groups.get.mockResolvedValue(undefined)
    await expect(computeDelta('missing', {}, 'u1')).rejects.toThrow('Group not found')
  })

  it('includes transactions the peer has never seen (authorSeq beyond their known clock)', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.transactions.where.mockResolvedValue([
      makeTxn({ txnId: 'new', authorSeq: 2 }),
      makeTxn({ txnId: 'known', authorSeq: 1 }),
    ])
    stubDelta()
    mockDb.categories.where.mockResolvedValue([])
    mockDb.members.where.mockResolvedValue([])
    mockDb.users.bulkGet.mockResolvedValue([])

    const delta = await computeDelta('g1', { u1: 1 }, 'u1')
    expect(delta.transactions.map((t) => t.txnId)).toEqual(['new'])
  })

  it('falls back to updatedAt > since to catch edits by a non-owner', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.transactions.where.mockResolvedValue([
      // peer already knows authorSeq 2, but this copy was edited after `since`
      makeTxn({ txnId: 'edited', authorSeq: 2, updatedAt: 1500 }),
      // peer already knows it, and it's untouched since `since` — must be excluded
      makeTxn({ txnId: 'stale', authorSeq: 2, updatedAt: 500 }),
    ])
    stubDelta()
    mockDb.categories.where.mockResolvedValue([])
    mockDb.members.where.mockResolvedValue([])
    mockDb.users.bulkGet.mockResolvedValue([])

    const delta = await computeDelta('g1', { u1: 2 }, 'u1', 1000)
    expect(delta.transactions.map((t) => t.txnId)).toEqual(['edited'])
  })

  it('filters categories by createdAt (categories have no updatedAt field)', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.transactions.where.mockResolvedValue([])
    stubDelta()
    mockDb.categories.where.mockResolvedValue([
      makeCategory({ categoryId: 'old', createdAt: 500 }),
      makeCategory({ categoryId: 'fresh', createdAt: 1500 }),
    ])
    mockDb.members.where.mockResolvedValue([])
    mockDb.users.bulkGet.mockResolvedValue([])

    const delta = await computeDelta('g1', {}, 'u1', 1000)
    expect(delta.categories.map((c) => c.categoryId)).toEqual(['fresh'])
  })

  it('sends everything when since is absent (first sync)', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.transactions.where.mockResolvedValue([])
    stubDelta({ budgets: [{ budgetId: 'b1', updatedAt: 1 } as Budget] })
    mockDb.categories.where.mockResolvedValue([makeCategory({ createdAt: 1 })])
    mockDb.members.where.mockResolvedValue([])
    mockDb.users.bulkGet.mockResolvedValue([])

    const delta = await computeDelta('g1', {}, 'u1')
    expect(delta.categories).toHaveLength(1)
    expect(delta.budgets).toHaveLength(1)
  })

  it('only sends users belonging to a current member, filtered by createdAt', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    mockDb.transactions.where.mockResolvedValue([])
    stubDelta()
    mockDb.categories.where.mockResolvedValue([])
    mockDb.members.where.mockResolvedValue([makeMember({ userId: 'u1' })])
    mockDb.users.bulkGet.mockResolvedValue([makeUser({ userId: 'u1', createdAt: 1500 })])

    const delta = await computeDelta('g1', {}, 'u1', 1000)
    expect(delta.users.map((u) => u.userId)).toEqual(['u1'])
  })
})

// ─── incrementVectorClock ─────────────────────────────────────────────────────

describe('incrementVectorClock', () => {
  it('throws when asked to increment a user other than the current one', async () => {
    mockAppStore.currentUserId = 'u1'
    await expect(incrementVectorClock('g1', 'someone-else')).rejects.toThrow(
      'incrementVectorClock: userId someone-else !== currentUserId u1',
    )
    expect(mockDb.groups.update).not.toHaveBeenCalled()
  })

  it('increments only the current user entry, leaving others untouched', async () => {
    mockAppStore.currentUserId = 'u1'
    mockDb.groups.get.mockResolvedValue(makeGroup({ vectorClock: { u1: 3, u2: 7 } }))

    const newSeq = await incrementVectorClock('g1', 'u1')

    expect(newSeq).toBe(4)
    expect(mockDb.groups.update).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ vectorClock: { u1: 4, u2: 7 } }),
    )
  })

  it('starts a first-time entry at 1', async () => {
    mockAppStore.currentUserId = 'u1'
    mockDb.groups.get.mockResolvedValue(makeGroup({ vectorClock: {} }))

    const newSeq = await incrementVectorClock('g1', 'u1')

    expect(newSeq).toBe(1)
  })

  it('throws when the group does not exist', async () => {
    mockAppStore.currentUserId = 'u1'
    mockDb.groups.get.mockResolvedValue(undefined)
    await expect(incrementVectorClock('g1', 'u1')).rejects.toThrow('Group not found')
  })
})

// ─── computeSince ─────────────────────────────────────────────────────────────

describe('computeSince', () => {
  it('returns the max timestamp across all non-transaction entities', async () => {
    mockDb.categories.where.mockResolvedValue([makeCategory({ createdAt: 500 })])
    mockDb.members.where.mockResolvedValue([makeMember({ updatedAt: 1500 })])
    mockDb.budgets.where.mockResolvedValue([])
    mockDb.goals.where.mockResolvedValue([])
    mockDb.recurrences.where.mockResolvedValue([])

    expect(await computeSince('g1')).toBe(1500)
  })

  it('returns 0 when the group has no entities at all', async () => {
    mockDb.categories.where.mockResolvedValue([])
    mockDb.members.where.mockResolvedValue([])
    mockDb.budgets.where.mockResolvedValue([])
    mockDb.goals.where.mockResolvedValue([])
    mockDb.recurrences.where.mockResolvedValue([])

    expect(await computeSince('g1')).toBe(0)
  })
})
