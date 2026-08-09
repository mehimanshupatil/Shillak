import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Recurrence, Transaction } from '@/db/schema'
import type { CreateQuickTransactionInput } from '@/lib/transactionIntake'
import { createQuickTransaction } from '@/lib/transactionIntake'

let transactions: Transaction[] = []
let attachments: Attachment[] = []
let recurrences: Recurrence[] = []

const mockDb = vi.hoisted(() => ({
  attachments: { put: vi.fn() },
  recurrences: { put: vi.fn() },
  transactions: { put: vi.fn() },
  atomically: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/sync/vector-clock', () => ({ incrementVectorClock: vi.fn() }))

import { incrementVectorClock } from '@/sync/vector-clock'

function baseInput(
  overrides: Partial<CreateQuickTransactionInput> = {},
): CreateQuickTransactionInput {
  return {
    groupId: 'g1',
    userId: 'u1',
    type: 'expense',
    amount: 10000,
    currency: 'INR',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    toAccountId: null,
    paidBy: 'u1',
    note: 'Groceries',
    tags: ['food'],
    date: Date.UTC(2026, 5, 15),
    pendingAttachments: [],
    recurrence: null,
    ...overrides,
  }
}

beforeEach(() => {
  transactions = []
  attachments = []
  recurrences = []
  vi.clearAllMocks()

  mockDb.attachments.put.mockImplementation(async (a: Attachment) => {
    attachments.push(a)
  })
  mockDb.recurrences.put.mockImplementation(async (r: Recurrence) => {
    recurrences.push(r)
  })
  mockDb.transactions.put.mockImplementation(async (t: Transaction) => {
    transactions.push(t)
  })
  vi.mocked(incrementVectorClock).mockResolvedValue(7)
})

describe('createQuickTransaction', () => {
  it('writes an expense transaction with authorSeq from incrementVectorClock', async () => {
    const result = await createQuickTransaction(baseInput())

    expect(transactions).toHaveLength(1)
    expect(result.transaction).toEqual(transactions[0])
    expect(result.transaction.authorSeq).toBe(7)
    expect(incrementVectorClock).toHaveBeenCalledWith('g1', 'u1')
  })

  it('writes an income transaction', async () => {
    const result = await createQuickTransaction(baseInput({ type: 'income', categoryId: 'cat-2' }))
    expect(result.transaction.type).toBe('income')
    expect(result.transaction.categoryId).toBe('cat-2')
  })

  it('writes a transfer transaction with empty categoryId, toAccountId set, paidBy null', async () => {
    const result = await createQuickTransaction(
      baseInput({
        type: 'transfer',
        categoryId: '',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        paidBy: null,
      }),
    )
    expect(result.transaction).toMatchObject({
      type: 'transfer',
      categoryId: '',
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      paidBy: null,
    })
  })

  it('persists pending attachments and links their ids to the transaction', async () => {
    const result = await createQuickTransaction(
      baseInput({
        pendingAttachments: [
          { mimeType: 'image/png', data: 'abc', sizeBytes: 100 },
          { mimeType: 'image/jpeg', data: 'def', sizeBytes: 200 },
        ],
      }),
    )

    expect(attachments).toHaveLength(2)
    expect(attachments.every((a) => a.txnId === result.transaction.txnId)).toBe(true)
    expect(attachments.every((a) => a.groupId === 'g1')).toBe(true)
    expect(result.transaction.attachmentIds).toEqual(attachments.map((a) => a.attachmentId))
  })

  it('writes no attachments when none are pending', async () => {
    const result = await createQuickTransaction(baseInput())
    expect(attachments).toHaveLength(0)
    expect(result.transaction.attachmentIds).toEqual([])
  })

  it('creates no recurrence and sets recurrenceId null when recurrence input is null', async () => {
    const result = await createQuickTransaction(baseInput())
    expect(result.recurrenceId).toBeNull()
    expect(result.transaction.recurrenceId).toBeNull()
    expect(recurrences).toHaveLength(0)
    expect(mockDb.recurrences.put).not.toHaveBeenCalled()
  })

  it('creates a recurrence and links recurrenceId to the transaction', async () => {
    const result = await createQuickTransaction(
      baseInput({
        type: 'expense',
        recurrence: { frequency: 'monthly', dayOfWeek: 0, endDate: null, isFixed: true },
      }),
    )

    expect(recurrences).toHaveLength(1)
    expect(result.recurrenceId).toBe(recurrences[0]?.recurrenceId)
    expect(result.transaction.recurrenceId).toBe(recurrences[0]?.recurrenceId)
    expect(recurrences[0]?.template.type).toBe('expense')
    expect(recurrences[0]?.isFixed).toBe(true)
    expect(recurrences[0]?.frequency).toBe('monthly')
  })

  it('propagates a thrown error and never writes the transaction or recurrence', async () => {
    mockDb.attachments.put.mockImplementationOnce(() => {
      throw new Error('write failed')
    })

    await expect(
      createQuickTransaction(
        baseInput({
          pendingAttachments: [{ mimeType: 'image/png', data: 'x', sizeBytes: 1 }],
          recurrence: { frequency: 'weekly', dayOfWeek: 1, endDate: null, isFixed: false },
        }),
      ),
    ).rejects.toThrow('write failed')

    expect(transactions).toHaveLength(0)
    expect(recurrences).toHaveLength(0)
    expect(mockDb.transactions.put).not.toHaveBeenCalled()
  })

  it('wraps the whole sequence in db.atomically', async () => {
    await createQuickTransaction(baseInput())
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
  })
})
