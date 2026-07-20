import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recurrence, Transaction } from '@/db/schema'
import { processRecurrences } from '../recurrences'

// ── Mocks ─────────────────────────────────────────────────────────────────────

let recurrences: Recurrence[] = []
let transactions: Transaction[] = []

const mockDb = vi.hoisted(() => ({
  recurrences: { where: vi.fn(), update: vi.fn() },
  transactions: { where: vi.fn(), put: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/sync/vector-clock', () => ({ incrementVectorClock: vi.fn() }))

import { incrementVectorClock } from '@/sync/vector-clock'

// ── Factories ─────────────────────────────────────────────────────────────────

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
    nextDue: Date.UTC(2020, 0, 1),
    lastGeneratedAt: null,
    endDate: null,
    active: true,
    createdAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  recurrences = []
  transactions = []
  vi.clearAllMocks()
  mockDb.recurrences.where.mockImplementation((pred: (r: Recurrence) => boolean) =>
    Promise.resolve(recurrences.filter(pred)),
  )
  mockDb.recurrences.update.mockImplementation(async (id: string, patch: Partial<Recurrence>) => {
    const rec = recurrences.find((r) => r.recurrenceId === id)
    if (rec) Object.assign(rec, patch)
  })
  mockDb.transactions.where.mockImplementation((pred: (t: Transaction) => boolean) =>
    Promise.resolve(transactions.filter(pred)),
  )
  mockDb.transactions.put.mockImplementation(async (t: Transaction) => {
    transactions.push(t)
  })
  vi.mocked(incrementVectorClock).mockImplementation(async () => transactions.length + 1)
})

describe('processRecurrences', () => {
  it('generates a transaction for a single due recurrence and advances nextDue', async () => {
    // endDate cuts off right after the first period so only one txn generates
    recurrences.push(
      makeRecurrence({ nextDue: Date.UTC(2020, 0, 1), endDate: Date.UTC(2020, 0, 2) }),
    )

    await processRecurrences('g1', 'u1')

    expect(transactions).toHaveLength(1)
    expect(transactions[0]?.date).toBe(Date.UTC(2020, 0, 1))
    expect(transactions[0]?.recurrenceId).toBe('rec-1')
    expect(recurrences[0]?.nextDue).toBe(Date.UTC(2020, 1, 1))
  })

  it('catches up multiple missed periods in one pass', async () => {
    recurrences.push(
      makeRecurrence({ nextDue: Date.UTC(2020, 0, 1), frequency: 'monthly', interval: 1 }),
    )

    await processRecurrences('g1', 'u1')

    // Jan 1 -> Feb 1 -> Mar 1 -> ... until nextDue exceeds "now" (real current date)
    expect(transactions.length).toBeGreaterThan(1)
    const dates = transactions.map((t) => t.date)
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
  })

  it('does not duplicate a transaction that already exists for recurrenceId+date', async () => {
    const dueDate = Date.UTC(2020, 0, 1)
    recurrences.push(makeRecurrence({ nextDue: dueDate, endDate: Date.UTC(2020, 0, 2) }))
    transactions.push({
      txnId: 'existing',
      groupId: 'g1',
      ownerId: 'u1',
      authorSeq: 1,
      categoryId: 'cat-1',
      type: 'expense',
      amount: 50000,
      currency: 'INR',
      fxRate: null,
      originalAmount: null,
      note: 'Rent',
      tags: [],
      date: dueDate,
      attachmentIds: [],
      recurrenceId: 'rec-1',
      accountId: null,
      paidBy: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })

    await processRecurrences('g1', 'u1')

    expect(transactions.filter((t) => t.date === dueDate)).toHaveLength(1)
    expect(incrementVectorClock).not.toHaveBeenCalled()
  })

  it('stops generating once advancing past endDate', async () => {
    recurrences.push(
      makeRecurrence({
        nextDue: Date.UTC(2020, 0, 1),
        endDate: Date.UTC(2020, 1, 15),
        frequency: 'monthly',
        interval: 1,
      }),
    )

    await processRecurrences('g1', 'u1')

    // Jan 1 generated, advance to Feb 1 (<= endDate) generated, advance to Mar 1 (> endDate) stop
    expect(transactions).toHaveLength(2)
    expect(transactions.map((t) => t.date)).toEqual([Date.UTC(2020, 0, 1), Date.UTC(2020, 1, 1)])
  })
})
