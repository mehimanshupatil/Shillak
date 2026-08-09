import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupMember } from '@/db/schema'
import { changeMemberRole, clearGroupData, deleteGroup, removeMember } from '@/lib/spaceLifecycle'

// ── In-memory tables ───────────────────────────────────────────────────────────

let memberRows: GroupMember[] = []
const groupRows: Array<{ groupId: string }> = []

type Row = Record<string, unknown>
interface RowTables {
  transactions: Row[]
  budgets: Row[]
  goals: Row[]
  attachments: Row[]
  recurrences: Row[]
  syncEvents: Row[]
  conflicts: Row[]
  categories: Row[]
  accounts: Row[]
  invites: Row[]
}
const rowTables: RowTables = {
  transactions: [],
  budgets: [],
  goals: [],
  attachments: [],
  recurrences: [],
  syncEvents: [],
  conflicts: [],
  categories: [],
  accounts: [],
  invites: [],
}
type RowTableKey = keyof RowTables

function makeRowTable(name: RowTableKey) {
  return {
    where: vi.fn((pred: (r: Row) => boolean) => Promise.resolve(rowTables[name].filter(pred))),
    deleteWhere: vi.fn((pred: (r: Row) => boolean) => {
      const before = rowTables[name].length
      rowTables[name] = rowTables[name].filter((r) => !pred(r))
      return Promise.resolve(before - rowTables[name].length)
    }),
  }
}

const mockDb = vi.hoisted(() => ({
  members: {
    where: vi.fn(),
    update: vi.fn(),
    deleteWhere: vi.fn(),
  },
  groups: { delete: vi.fn(), toArray: vi.fn() },
  transactions: {},
  budgets: {},
  goals: {},
  attachments: {},
  recurrences: {},
  syncEvents: {},
  conflicts: {},
  categories: {},
  accounts: {},
  invites: {},
  atomically: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function makeMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: 'm1',
    groupId: 'g1',
    userId: 'u1',
    role: 'admin',
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

beforeEach(() => {
  memberRows = []
  for (const name of Object.keys(rowTables) as RowTableKey[]) rowTables[name] = []
  groupRows.length = 0
  vi.clearAllMocks()

  mockDb.members.where.mockImplementation((pred: (m: GroupMember) => boolean) =>
    Promise.resolve(memberRows.filter(pred)),
  )
  mockDb.members.update.mockImplementation(async (id: string, patch: Partial<GroupMember>) => {
    const m = memberRows.find((r) => r.id === id)
    if (m) Object.assign(m, patch)
  })
  mockDb.members.deleteWhere.mockImplementation((pred: (m: GroupMember) => boolean) => {
    const before = memberRows.length
    memberRows = memberRows.filter((r) => !pred(r))
    return Promise.resolve(before - memberRows.length)
  })
  mockDb.groups.delete.mockImplementation((groupId: string) => {
    const idx = groupRows.findIndex((g) => g.groupId === groupId)
    if (idx >= 0) groupRows.splice(idx, 1)
    return Promise.resolve()
  })
  mockDb.groups.toArray.mockImplementation(() => Promise.resolve(groupRows))

  const mockTables = mockDb as unknown as Record<RowTableKey, ReturnType<typeof makeRowTable>>
  for (const name of Object.keys(rowTables) as RowTableKey[]) {
    mockTables[name] = makeRowTable(name)
  }
})

// ── changeMemberRole / removeMember ────────────────────────────────────────────

describe('changeMemberRole', () => {
  it('always allows promotion to admin', async () => {
    memberRows.push(makeMember({ id: 'm1', role: 'member' }))
    const result = await changeMemberRole('g1', 'm1', 'admin')
    expect(result).toEqual({ ok: true })
    expect(memberRows[0]?.role).toBe('admin')
  })

  it('refuses demoting the sole active admin', async () => {
    memberRows.push(makeMember({ id: 'm1', role: 'admin' }))
    const result = await changeMemberRole('g1', 'm1', 'member')
    expect(result).toEqual({ ok: false, reason: 'last-admin' })
    expect(memberRows[0]?.role).toBe('admin')
  })

  it('allows demoting an admin when another active admin exists', async () => {
    memberRows.push(
      makeMember({ id: 'm1', role: 'admin' }),
      makeMember({ id: 'm2', userId: 'u2', role: 'admin' }),
    )
    const result = await changeMemberRole('g1', 'm1', 'member')
    expect(result).toEqual({ ok: true })
    expect(memberRows[0]?.role).toBe('member')
  })

  it('ignores admins who have left when counting', async () => {
    memberRows.push(
      makeMember({ id: 'm1', role: 'admin' }),
      makeMember({ id: 'm2', userId: 'u2', role: 'admin', status: 'left' }),
    )
    const result = await changeMemberRole('g1', 'm1', 'member')
    expect(result).toEqual({ ok: false, reason: 'last-admin' })
  })
})

describe('removeMember', () => {
  it('refuses removing the sole active admin', async () => {
    memberRows.push(makeMember({ id: 'm1', role: 'admin' }))
    const result = await removeMember('g1', 'm1')
    expect(result).toEqual({ ok: false, reason: 'last-admin' })
    expect(memberRows[0]?.status).toBe('active')
  })

  it('allows removing a non-admin member', async () => {
    memberRows.push(
      makeMember({ id: 'm1', role: 'admin' }),
      makeMember({ id: 'm2', role: 'member' }),
    )
    const result = await removeMember('g1', 'm2')
    expect(result).toEqual({ ok: true })
    expect(memberRows[1]?.status).toBe('left')
  })
})

// ── clearGroupData / deleteGroup ────────────────────────────────────────────────

describe('clearGroupData', () => {
  it('empties only the target group rows across the 7 data tables, scoped by groupId', async () => {
    rowTables.transactions.push({ txnId: 't1', groupId: 'g1' }, { txnId: 't2', groupId: 'g2' })
    rowTables.budgets.push({ budgetId: 'b1', groupId: 'g1' })
    rowTables.categories.push({ categoryId: 'c1', groupId: 'g1' })
    memberRows.push(makeMember({ id: 'm1' }))

    await clearGroupData('g1')

    expect(rowTables.transactions).toEqual([{ txnId: 't2', groupId: 'g2' }])
    expect(rowTables.budgets).toEqual([])
    // categories/members survive a "clear data" — only deleteGroup removes them
    expect(rowTables.categories).toHaveLength(1)
    expect(memberRows).toHaveLength(1)
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
  })
})

describe('deleteGroup', () => {
  it('empties every table for the group and deletes the group row', async () => {
    rowTables.transactions.push({ txnId: 't1', groupId: 'g1' })
    rowTables.categories.push(
      { categoryId: 'c1', groupId: 'g1' },
      { categoryId: 'c2', groupId: 'g2' },
    )
    rowTables.accounts.push({ accountId: 'a1', groupId: 'g1' })
    rowTables.invites.push({ inviteId: 'i1', groupId: 'g1' })
    memberRows.push(
      makeMember({ id: 'm1', groupId: 'g1' }),
      makeMember({ id: 'm2', groupId: 'g2' }),
    )
    groupRows.push({ groupId: 'g1' }, { groupId: 'g2' })

    await deleteGroup('g1')

    expect(rowTables.transactions).toEqual([])
    expect(rowTables.categories).toEqual([{ categoryId: 'c2', groupId: 'g2' }])
    expect(rowTables.accounts).toEqual([])
    expect(rowTables.invites).toEqual([])
    expect(memberRows).toEqual([expect.objectContaining({ groupId: 'g2' })])
    expect(groupRows).toEqual([{ groupId: 'g2' }])
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
  })
})
