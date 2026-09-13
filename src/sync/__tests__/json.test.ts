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
import { applyDelta } from '@/sync/conflict'
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
vi.mock('@/sync/conflict', () => ({ applyDelta: vi.fn() }))

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

function snapshotSources(): void {
  mockDb.members.where.mockResolvedValue([])
  mockDb.categories.where.mockResolvedValue([])
  mockDb.transactions.where.mockResolvedValue([])
  mockDb.recurrences.where.mockResolvedValue([])
  mockDb.budgets.where.mockResolvedValue([])
  mockDb.goals.where.mockResolvedValue([])
  mockDb.accounts.where.mockResolvedValue([])
}

function appliedDelta() {
  return vi.mocked(applyDelta).mock.calls[0]?.[0]
}

describe('exportGroupSnapshot', () => {
  it('throws if the group does not exist', async () => {
    mockDb.groups.get.mockResolvedValue(undefined)
    await expect(exportGroupSnapshot('missing', 'u1')).rejects.toThrow('Group not found')
  })

  it('bundles every entity type scoped to the group, and who took it', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    snapshotSources()
    mockDb.transactions.where.mockResolvedValue([makeTxn()])

    const snapshot = await exportGroupSnapshot('g1', 'u1')

    expect(snapshot.version).toBe(1)
    expect(snapshot.groupId).toBe('g1')
    expect(snapshot.exportedBy).toBe('u1')
    expect(snapshot.transactions).toHaveLength(1)
  })
})

describe('importGroupSnapshot', () => {
  beforeEach(() => {
    vi.mocked(applyDelta).mockResolvedValue({
      recordsApplied: 3,
      conflictsFound: 0,
    } as unknown as Awaited<ReturnType<typeof applyDelta>>)
  })

  it('rejects a snapshot with an unsupported version', async () => {
    await expect(
      importGroupSnapshot(makeFile({ version: 2, groupId: 'g1' }), 'u1'),
    ).rejects.toThrow('Unsupported snapshot version')
  })

  it('rejects a snapshot missing groupId', async () => {
    await expect(importGroupSnapshot(makeFile({ version: 1 }), 'u1')).rejects.toThrow(
      'Invalid snapshot: missing groupId',
    )
  })

  it('goes through the same apply path a Sync session uses', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    snapshotSources()
    const file = makeFile(await exportGroupSnapshot('g1', 'u1'))

    const { imported, groupId } = await importGroupSnapshot(file, 'u2')

    expect(groupId).toBe('g1')
    expect(imported).toBe(3)
    expect(applyDelta).toHaveBeenCalledTimes(1)
    const [, appliedGroupId, , method, initiatedBy] = vi.mocked(applyDelta).mock.calls[0] ?? []
    expect(appliedGroupId).toBe('g1')
    expect(method).toBe('json')
    expect(initiatedBy).toBe('u2')
  })

  it('creates the space first when restoring onto a device that lacks it', async () => {
    mockDb.groups.get.mockResolvedValueOnce(makeGroup())
    snapshotSources()
    const file = makeFile(await exportGroupSnapshot('g1', 'u1'))
    mockDb.groups.get.mockResolvedValue(undefined)

    await importGroupSnapshot(file, 'u2')

    expect(mockDb.groups.put).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1' }))
  })

  it('leaves an existing space alone and lets the apply merge into it', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    snapshotSources()
    const file = makeFile(await exportGroupSnapshot('g1', 'u1'))

    await importGroupSnapshot(file, 'u2')

    expect(mockDb.groups.put).not.toHaveBeenCalled()
    expect(applyDelta).toHaveBeenCalledTimes(1)
  })

  it('carries every entity array into the Delta', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    snapshotSources()
    mockDb.transactions.where.mockResolvedValue([makeTxn()])
    mockDb.members.where.mockResolvedValue([{ id: 'm1' } as GroupMember])
    mockDb.categories.where.mockResolvedValue([{ categoryId: 'cat-1' } as Category])
    mockDb.budgets.where.mockResolvedValue([{ budgetId: 'b1' } as Budget])
    mockDb.goals.where.mockResolvedValue([{ goalId: 'goal-1' } as SavingsGoal])
    mockDb.accounts.where.mockResolvedValue([{ accountId: 'acc-1' } as Account])
    const file = makeFile(await exportGroupSnapshot('g1', 'u1'))

    await importGroupSnapshot(file, 'u2')

    const delta = appliedDelta()
    expect(delta?.transactions).toHaveLength(1)
    expect(delta?.members).toHaveLength(1)
    expect(delta?.categories).toHaveLength(1)
    expect(delta?.budgets).toHaveLength(1)
    expect(delta?.goals).toHaveLength(1)
    expect(delta?.accounts).toHaveLength(1)
    // A Snapshot carries no user profiles — each device is authoritative for its own.
    expect(delta?.users).toEqual([])
  })

  it('names whoever took the Snapshot as the peer it synced with', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    snapshotSources()
    const file = makeFile(await exportGroupSnapshot('g1', 'alice'))

    await importGroupSnapshot(file, 'u2')

    expect(appliedDelta()?.fromUserId).toBe('alice')
  })

  it('tolerates an older Snapshot that does not record who took it', async () => {
    mockDb.groups.get.mockResolvedValue(makeGroup())
    const file = makeFile({ version: 1, groupId: 'g1', group: makeGroup() })

    await importGroupSnapshot(file, 'u2')

    expect(appliedDelta()?.fromUserId).toBe('')
  })
})
