import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Budget, Category, Group, GroupMember, SavingsGoal, Transaction } from '@/db/schema'
import { applyDelta } from '../conflict'
import type { SyncDelta } from '../vector-clock'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  transactions: { get: vi.fn(), put: vi.fn() },
  categories: { get: vi.fn(), put: vi.fn(), where: vi.fn() },
  members: { get: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  budgets: { get: vi.fn(), put: vi.fn() },
  goals: { get: vi.fn(), put: vi.fn() },
  recurrences: { get: vi.fn(), put: vi.fn() },
  accounts: { get: vi.fn(), put: vi.fn() },
  users: { put: vi.fn() },
  groups: { get: vi.fn(), update: vi.fn() },
  conflicts: { put: vi.fn() },
  syncEvents: { put: vi.fn() },
  keystoreTable: { get: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

// ── Factories ─────────────────────────────────────────────────────────────────

function makeDelta(overrides: Partial<SyncDelta> = {}): SyncDelta {
  return {
    fromUserId: 'user-b',
    vectorClock: { 'user-b': 1 },
    transactions: [],
    categories: [],
    members: [],
    users: [],
    budgets: [],
    goals: [],
    recurrences: [],
    accounts: [],
    ...overrides,
  }
}

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'user-b',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'expense',
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'coffee',
    tags: [],
    date: Date.UTC(2025, 0, 1),
    attachmentIds: [],
    recurrenceId: null,
    accountId: null,
    paidBy: 'user-b',
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: null,
    ...overrides,
  }
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    budgetId: 'bud-1',
    groupId: 'g1',
    categoryId: 'cat-1',
    limit: 500000,
    period: 'monthly',
    updatedAt: 2000,
    ...overrides,
  }
}

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    goalId: 'goal-1',
    groupId: 'g1',
    name: 'Emergency fund',
    target: 100000000,
    saved: 50000000,
    deadline: null,
    categoryId: null,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    categoryId: 'cat-1',
    groupId: 'g1',
    name: 'Dining',
    icon: 'fork-knife',
    color: '#f59e0b',
    type: 'expense',
    sortOrder: 0,
    isDefault: true,
    createdBy: 'user-b',
    createdAt: 1000,
    ...overrides,
  }
}

function makeMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: 'mem-1',
    groupId: 'g1',
    userId: 'user-b',
    role: 'member',
    status: 'active',
    joinedAt: 1000,
    leftAt: null,
    nickname: null,
    monthlyIncome: null,
    incomeCurrency: null,
    updatedAt: 2000,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupId: 'g1',
    name: 'Home',
    avatarColor: '#f59e0b',
    createdBy: 'user-a',
    currency: 'INR',
    fiscalYearStart: 4,
    visibility: 'full',
    status: 'active',
    groupSecret: 'secret',
    vectorClock: { 'user-a': 5 },
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

const GROUP_ID = 'g1'
const SYNC_ID = 'sync-1'

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: nothing in DB
  mockDb.transactions.get.mockResolvedValue(undefined)
  mockDb.transactions.put.mockResolvedValue(undefined)
  mockDb.categories.get.mockResolvedValue(undefined)
  mockDb.categories.put.mockResolvedValue(undefined)
  mockDb.categories.where.mockResolvedValue([])
  mockDb.members.get.mockResolvedValue(undefined)
  mockDb.members.put.mockResolvedValue(undefined)
  mockDb.members.update.mockResolvedValue(undefined)
  mockDb.members.where.mockResolvedValue([])
  mockDb.budgets.get.mockResolvedValue(undefined)
  mockDb.budgets.put.mockResolvedValue(undefined)
  mockDb.goals.get.mockResolvedValue(undefined)
  mockDb.goals.put.mockResolvedValue(undefined)
  mockDb.recurrences.get.mockResolvedValue(undefined)
  mockDb.recurrences.put.mockResolvedValue(undefined)
  mockDb.accounts.get.mockResolvedValue(undefined)
  mockDb.accounts.put.mockResolvedValue(undefined)
  mockDb.users.put.mockResolvedValue(undefined)
  mockDb.groups.get.mockResolvedValue(makeGroup())
  mockDb.groups.update.mockResolvedValue(undefined)
  mockDb.conflicts.put.mockResolvedValue(undefined)
  mockDb.syncEvents.put.mockResolvedValue(undefined)
  mockDb.keystoreTable.get.mockResolvedValue({ id: 1, userId: 'user-a' })
})

// ── Transaction tests ─────────────────────────────────────────────────────────

describe('transactions', () => {
  it('new → applied', async () => {
    const incoming = makeTxn()
    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.transactions.put).toHaveBeenCalledWith(incoming)
    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(result.recordsApplied).toBe(1)
    expect(result.conflictsFound).toBe(0)
  })

  it('remote newer updatedAt → LWW apply', async () => {
    const existing = makeTxn({ updatedAt: 1000 })
    const incoming = makeTxn({ updatedAt: 2000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.transactions.put).toHaveBeenCalledWith(incoming)
    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(result.recordsApplied).toBe(1)
  })

  it('remote older updatedAt → skipped', async () => {
    const existing = makeTxn({ updatedAt: 3000 })
    const incoming = makeTxn({ updatedAt: 2000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.transactions.put).not.toHaveBeenCalled()
    expect(result.recordsApplied).toBe(0)
  })

  it('local deleted + remote alive, remote newer → LWW apply (propagated resolution)', async () => {
    const existing = makeTxn({ deletedAt: 5000, updatedAt: 5000 })
    const incoming = makeTxn({ deletedAt: null, updatedAt: 9000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.transactions.put).toHaveBeenCalledWith(incoming)
    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(result.recordsApplied).toBe(1)
    expect(result.conflictsFound).toBe(0)
  })

  it('local deleted + remote alive, local newer → ConflictLog', async () => {
    const existing = makeTxn({ deletedAt: 9000, updatedAt: 9000 })
    const incoming = makeTxn({ deletedAt: null, updatedAt: 5000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).toHaveBeenCalledOnce()
    // biome-ignore lint/style/noNonNullAssertion: test assertion already verified call count
    const conflict = mockDb.conflicts.put.mock.calls[0]![0]
    expect(conflict.entityType).toBe('transaction')
    expect(conflict.entityId).toBe('txn-1')
    expect(conflict.resolution).toBe('pending')
    expect(result.conflictsFound).toBe(1)
    expect(mockDb.transactions.put).not.toHaveBeenCalled()
  })

  it('local alive + remote deleted, remote newer → LWW apply', async () => {
    const existing = makeTxn({ deletedAt: null, updatedAt: 3000 })
    const incoming = makeTxn({ deletedAt: 5000, updatedAt: 5000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.transactions.put).toHaveBeenCalledWith(incoming)
    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(result.conflictsFound).toBe(0)
  })

  it('local alive + remote deleted, local newer → ConflictLog', async () => {
    const existing = makeTxn({ deletedAt: null, updatedAt: 9000 })
    const incoming = makeTxn({ deletedAt: 5000, updatedAt: 5000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).toHaveBeenCalledOnce()
    expect(result.conflictsFound).toBe(1)
    expect(mockDb.transactions.put).not.toHaveBeenCalled()
  })

  it('both deleted → LWW (no conflict)', async () => {
    const existing = makeTxn({ deletedAt: 3000, updatedAt: 3000 })
    const incoming = makeTxn({ deletedAt: 5000, updatedAt: 5000 })
    mockDb.transactions.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ transactions: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(mockDb.transactions.put).toHaveBeenCalledWith(incoming)
    expect(result.conflictsFound).toBe(0)
  })
})

// ── Budget tests ──────────────────────────────────────────────────────────────

describe('budgets', () => {
  it('new → applied', async () => {
    const incoming = makeBudget()
    const result = await applyDelta(
      makeDelta({ budgets: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.budgets.put).toHaveBeenCalledWith(incoming)
    expect(result.recordsApplied).toBe(1)
    expect(result.conflictsFound).toBe(0)
  })

  it('both modified (remote newer) → ConflictLog, not applied', async () => {
    const existing = makeBudget({ limit: 300000, updatedAt: 1000 })
    const incoming = makeBudget({ limit: 700000, updatedAt: 5000 })
    mockDb.budgets.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ budgets: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).toHaveBeenCalledOnce()
    // biome-ignore lint/style/noNonNullAssertion: test assertion already verified call count
    const conflict = mockDb.conflicts.put.mock.calls[0]![0]
    expect(conflict.entityType).toBe('budget')
    expect(conflict.localValue).toEqual(existing)
    expect(conflict.remoteValue).toEqual(incoming)
    expect(mockDb.budgets.put).not.toHaveBeenCalled()
    expect(result.conflictsFound).toBe(1)
  })

  it('remote older → skipped, no conflict', async () => {
    const existing = makeBudget({ updatedAt: 9000 })
    const incoming = makeBudget({ updatedAt: 1000 })
    mockDb.budgets.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ budgets: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).not.toHaveBeenCalled()
    expect(mockDb.budgets.put).not.toHaveBeenCalled()
    expect(result.conflictsFound).toBe(0)
  })
})

// ── Goal tests ────────────────────────────────────────────────────────────────

describe('goals', () => {
  it('new → applied', async () => {
    const incoming = makeGoal()
    const result = await applyDelta(
      makeDelta({ goals: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.goals.put).toHaveBeenCalledWith(incoming)
    expect(result.recordsApplied).toBe(1)
  })

  it('both modified (remote newer) → ConflictLog', async () => {
    const existing = makeGoal({ saved: 10000000, updatedAt: 1000 })
    const incoming = makeGoal({ saved: 20000000, updatedAt: 5000 })
    mockDb.goals.get.mockResolvedValue(existing)

    const result = await applyDelta(
      makeDelta({ goals: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.conflicts.put).toHaveBeenCalledOnce()
    // biome-ignore lint/style/noNonNullAssertion: test assertion already verified call count
    const conflict = mockDb.conflicts.put.mock.calls[0]![0]
    expect(conflict.entityType).toBe('goal')
    expect(result.conflictsFound).toBe(1)
    expect(mockDb.goals.put).not.toHaveBeenCalled()
  })
})

// ── Category tests ────────────────────────────────────────────────────────────

describe('categories', () => {
  it('new → applied', async () => {
    const incoming = makeCategory({ categoryId: 'cat-new' })
    const result = await applyDelta(
      makeDelta({ categories: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.categories.put).toHaveBeenCalledWith(incoming)
    expect(result.recordsApplied).toBe(1)
  })

  it('duplicate name+type (both seeded defaults) → skipped', async () => {
    // Local has "Dining|expense" under a different categoryId
    const existingByNameType = makeCategory({ categoryId: 'cat-local' })
    mockDb.categories.where.mockResolvedValue([existingByNameType])
    const incoming = makeCategory({ categoryId: 'cat-remote' })

    await applyDelta(makeDelta({ categories: [incoming] }), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.categories.put).not.toHaveBeenCalled()
  })

  it('existing with older createdAt → LWW apply', async () => {
    const existing = makeCategory({ createdAt: 500 })
    const incoming = makeCategory({ createdAt: 1000 })
    mockDb.categories.get.mockResolvedValue(existing)
    mockDb.categories.where.mockResolvedValue([existing])

    await applyDelta(makeDelta({ categories: [incoming] }), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.categories.put).toHaveBeenCalledWith(incoming)
  })

  it('existing with same createdAt → applied (>=)', async () => {
    const existing = makeCategory({ createdAt: 1000 })
    const incoming = makeCategory({ createdAt: 1000 })
    mockDb.categories.get.mockResolvedValue(existing)
    mockDb.categories.where.mockResolvedValue([existing])

    await applyDelta(makeDelta({ categories: [incoming] }), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.categories.put).toHaveBeenCalledWith(incoming)
  })
})

// ── Member tests ──────────────────────────────────────────────────────────────

describe('members', () => {
  it('new member → applied', async () => {
    const incoming = makeMember()
    const result = await applyDelta(
      makeDelta({ members: [incoming] }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(mockDb.members.put).toHaveBeenCalledWith(incoming)
    expect(result.recordsApplied).toBe(1)
  })

  it('remote newer updatedAt → applied', async () => {
    const existing = makeMember({ updatedAt: 1000 })
    const incoming = makeMember({ updatedAt: 5000 })
    mockDb.members.get.mockResolvedValue(existing)

    await applyDelta(makeDelta({ members: [incoming] }), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.members.put).toHaveBeenCalledWith(incoming)
  })

  it('remote older updatedAt → skipped', async () => {
    const existing = makeMember({ updatedAt: 9000 })
    const incoming = makeMember({ updatedAt: 1000 })
    mockDb.members.get.mockResolvedValue(existing)

    await applyDelta(makeDelta({ members: [incoming] }), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.members.put).not.toHaveBeenCalled()
  })
})

// ── Admin invariant tests ─────────────────────────────────────────────────────

describe('admin invariant', () => {
  it('0 admins → promote oldest member', async () => {
    const older = makeMember({ id: 'mem-a', userId: 'user-a', role: 'member', joinedAt: 500 })
    const newer = makeMember({ id: 'mem-b', userId: 'user-b', role: 'member', joinedAt: 2000 })
    mockDb.members.where.mockResolvedValue([newer, older]) // unsorted on purpose

    await applyDelta(makeDelta(), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.members.update).toHaveBeenCalledWith(
      'mem-a',
      expect.objectContaining({ role: 'admin' }),
    )
  })

  it('2+ admins → keep newest updatedAt, demote rest', async () => {
    const admin1 = makeMember({ id: 'mem-a', userId: 'user-a', role: 'admin', updatedAt: 1000 })
    const admin2 = makeMember({ id: 'mem-b', userId: 'user-b', role: 'admin', updatedAt: 9000 })
    mockDb.members.where.mockResolvedValue([admin1, admin2])

    await applyDelta(makeDelta(), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    // admin1 has older updatedAt → demoted
    expect(mockDb.members.update).toHaveBeenCalledWith(
      'mem-a',
      expect.objectContaining({ role: 'member' }),
    )
    // admin2 kept — no update call for mem-b
    const updateCalls = mockDb.members.update.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(updateCalls).not.toContain('mem-b')
  })

  it('exactly 1 admin → no change', async () => {
    const admin = makeMember({ id: 'mem-a', role: 'admin' })
    const member = makeMember({ id: 'mem-b', role: 'member' })
    mockDb.members.where.mockResolvedValue([admin, member])

    await applyDelta(makeDelta(), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.members.update).not.toHaveBeenCalled()
  })
})

// ── Vector clock tests ────────────────────────────────────────────────────────

describe('vector clock', () => {
  it('merges remote clock into local', async () => {
    const group = makeGroup({ vectorClock: { 'user-a': 5, 'user-b': 2 }, updatedAt: 1000 })
    mockDb.groups.get.mockResolvedValue(group)
    const delta = makeDelta({ vectorClock: { 'user-a': 3, 'user-b': 7, 'user-c': 1 } })

    await applyDelta(delta, GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    // biome-ignore lint/style/noNonNullAssertion: called as part of delta application
    const updateCall = mockDb.groups.update.mock.calls[0]!
    const merged = updateCall[1].vectorClock
    expect(merged['user-a']).toBe(5) // local wins (5 > 3)
    expect(merged['user-b']).toBe(7) // remote wins (7 > 2)
    expect(merged['user-c']).toBe(1) // new entry
  })

  it('accepts remote group settings when remote is newer', async () => {
    const group = makeGroup({ name: 'Home', updatedAt: 1000 })
    mockDb.groups.get.mockResolvedValue(group)
    const remoteGroup = makeGroup({ name: 'Our Home', updatedAt: 5000 })
    const delta = makeDelta({ group: remoteGroup })

    await applyDelta(delta, GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    // biome-ignore lint/style/noNonNullAssertion: called as part of delta application
    const updateCall = mockDb.groups.update.mock.calls[0]!
    expect(updateCall[1].name).toBe('Our Home')
  })

  it('keeps local group settings when local is newer', async () => {
    const group = makeGroup({ name: 'Home', updatedAt: 9000 })
    mockDb.groups.get.mockResolvedValue(group)
    const remoteGroup = makeGroup({ name: 'Their Name', updatedAt: 1000 })
    const delta = makeDelta({ group: remoteGroup })

    await applyDelta(delta, GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    // biome-ignore lint/style/noNonNullAssertion: called as part of delta application
    const updateCall = mockDb.groups.update.mock.calls[0]!
    expect(updateCall[1].name).toBeUndefined() // no name in the update
  })
})

// ── Result accounting tests ───────────────────────────────────────────────────

describe('result accounting', () => {
  it('counts applied and conflicts correctly across entity types', async () => {
    // 1 new txn (applied) + 1 budget conflict + 1 goal conflict = 1 applied, 2 conflicts
    const newTxn = makeTxn({ txnId: 'txn-new' })
    const existingBudget = makeBudget({ updatedAt: 1000 })
    const conflictBudget = makeBudget({ limit: 999999, updatedAt: 5000 })
    const existingGoal = makeGoal({ updatedAt: 1000 })
    const conflictGoal = makeGoal({ saved: 99999999, updatedAt: 5000 })

    mockDb.budgets.get.mockResolvedValue(existingBudget)
    mockDb.goals.get.mockResolvedValue(existingGoal)

    const result = await applyDelta(
      makeDelta({
        transactions: [newTxn],
        budgets: [conflictBudget],
        goals: [conflictGoal],
      }),
      GROUP_ID,
      SYNC_ID,
      'webrtc',
      'user-a',
    )

    expect(result.recordsApplied).toBe(1)
    expect(result.conflictsFound).toBe(2)
    expect(result.syncEvent.status).toBe('partial')
  })

  it('status ok when no conflicts', async () => {
    const result = await applyDelta(makeDelta(), GROUP_ID, SYNC_ID, 'webrtc', 'user-a')
    expect(result.syncEvent.status).toBe('ok')
  })

  it('own user profile not overwritten', async () => {
    // keystoreTable returns user-a as local user
    const ownProfile = {
      userId: 'user-a',
      displayName: 'Me',
      avatarColor: '#f00',
      identityBackupHint: '',
      createdAt: 1,
    }
    const delta = makeDelta({ users: [ownProfile] })

    await applyDelta(delta, GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.users.put).not.toHaveBeenCalled()
  })

  it('other user profile applied', async () => {
    const otherProfile = {
      userId: 'user-b',
      displayName: 'Partner',
      avatarColor: '#00f',
      identityBackupHint: '',
      createdAt: 1,
    }
    const delta = makeDelta({ users: [otherProfile] })

    await applyDelta(delta, GROUP_ID, SYNC_ID, 'webrtc', 'user-a')

    expect(mockDb.users.put).toHaveBeenCalledWith(otherProfile)
  })
})
