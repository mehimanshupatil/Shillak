import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Recurrence, Transaction } from '@/db/schema'
import type { LedgerRowSpec, SpendDraft, TransactionDraft, TransferDraft } from '@/lib/ledger/write'
import {
  amendTransaction,
  buildLedgerRow,
  commitMany,
  commitTransaction,
  voidTransaction,
} from '@/lib/ledger/write'
import { nextOccurrence } from '@/lib/utils'

let transactions: Transaction[] = []
let attachments: Attachment[] = []
let recurrences: Recurrence[] = []
let stored: Attachment[] = []
let deletedAttachmentIds: string[] = []

const mockDb = vi.hoisted(() => ({
  attachments: { put: vi.fn(), delete: vi.fn(), where: vi.fn() },
  recurrences: { put: vi.fn() },
  transactions: { put: vi.fn(), get: vi.fn() },
  atomically: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/sync/vector-clock', () => ({ incrementVectorClock: vi.fn() }))
vi.mock('@/lib/attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attachments')>()
  return { ...actual, checkStorageQuota: vi.fn(async () => ({ blocked: false, warn: false })) }
})

import { checkStorageQuota } from '@/lib/attachments'
import { incrementVectorClock } from '@/sync/vector-clock'

const DATE = Date.UTC(2026, 5, 15) // Mon 15 Jun 2026

function spendDraft(overrides: Partial<SpendDraft> = {}): SpendDraft {
  return {
    type: 'expense',
    amount: '100',
    note: 'Groceries',
    tags: ['food'],
    date: DATE,
    attachments: { keep: [], add: [] },
    categoryId: 'cat-1',
    accountId: 'acc-1',
    paidBy: null,
    repeat: null,
    ...overrides,
  }
}

function transferDraft(overrides: Partial<TransferDraft> = {}): TransferDraft {
  return {
    type: 'transfer',
    amount: '250',
    note: 'Move to savings',
    tags: [],
    date: DATE,
    attachments: { keep: [], add: [] },
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    ...overrides,
  }
}

function commit(draft: TransactionDraft) {
  return commitTransaction({ groupId: 'g1', userId: 'u1', currency: 'INR', draft })
}

function existingTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'u2',
    authorSeq: 3,
    categoryId: 'cat-1',
    type: 'expense',
    amount: 50000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'Old note',
    tags: [],
    date: Date.UTC(2026, 4, 1),
    attachmentIds: [],
    recurrenceId: null,
    accountId: 'acc-1',
    toAccountId: null,
    paidBy: 'u2',
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...overrides,
  }
}

function storedAttachment(attachmentId: string): Attachment {
  return {
    attachmentId,
    groupId: 'g1',
    txnId: 'txn-1',
    mimeType: 'image/png',
    data: 'AAAA',
    sizeBytes: 10,
    createdAt: 0,
  }
}

beforeEach(() => {
  transactions = []
  attachments = []
  recurrences = []
  stored = []
  deletedAttachmentIds = []
  vi.clearAllMocks()

  mockDb.attachments.put.mockImplementation(async (a: Attachment) => {
    attachments.push(a)
  })
  mockDb.attachments.delete.mockImplementation(async (id: string) => {
    deletedAttachmentIds.push(id)
  })
  mockDb.attachments.where.mockImplementation(async (p: (a: Attachment) => boolean) =>
    stored.filter(p),
  )
  mockDb.recurrences.put.mockImplementation(async (r: Recurrence) => {
    recurrences.push(r)
  })
  mockDb.transactions.put.mockImplementation(async (t: Transaction) => {
    transactions.push(t)
  })
  mockDb.transactions.get.mockResolvedValue(undefined)
  mockDb.atomically.mockImplementation((fn: () => Promise<unknown>) => fn())
  vi.mocked(incrementVectorClock).mockResolvedValue(7)
  vi.mocked(checkStorageQuota).mockResolvedValue({ blocked: false, warn: false })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validation', () => {
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['not a number', 'abc'],
    ['zero', '0'],
    ['negative', '-5'],
  ])('refuses an amount that is %s', async (_label, amount) => {
    const result = await commit(spendDraft({ amount }))
    expect(result).toEqual({ ok: false, failure: 'invalid-amount' })
  })

  it('accepts a decimal amount and converts it to paise', async () => {
    const result = await commit(spendDraft({ amount: ' 12.34 ' }))
    expect(result.ok && result.value.transaction.amount).toBe(1234)
  })

  it('refuses a spend with no category', async () => {
    const result = await commit(spendDraft({ categoryId: null }))
    expect(result).toEqual({ ok: false, failure: 'missing-category' })
  })

  it('refuses a transfer with a missing account on either side', async () => {
    expect(await commit(transferDraft({ fromAccountId: null }))).toEqual({
      ok: false,
      failure: 'missing-account',
    })
    expect(await commit(transferDraft({ toAccountId: null }))).toEqual({
      ok: false,
      failure: 'missing-account',
    })
  })

  it('refuses a transfer between the same account', async () => {
    const result = await commit(transferDraft({ fromAccountId: 'a', toAccountId: 'a' }))
    expect(result).toEqual({ ok: false, failure: 'transfer-same-account' })
  })

  it('refuses a date that is not midnight UTC', async () => {
    const result = await commit(spendDraft({ date: DATE + 1 }))
    expect(result).toEqual({ ok: false, failure: 'date-not-utc-midnight' })
  })

  it('refuses an attachment over the size limit', async () => {
    const draft = spendDraft({
      attachments: {
        keep: [],
        add: [{ mimeType: 'image/png', data: 'x', sizeBytes: 6 * 1024 * 1024 }],
      },
    })
    expect(await commit(draft)).toEqual({ ok: false, failure: 'attachment-too-large' })
  })

  it('refuses attachments when storage is over the hard limit', async () => {
    vi.mocked(checkStorageQuota).mockResolvedValue({ blocked: true, warn: true })
    const draft = spendDraft({
      attachments: { keep: [], add: [{ mimeType: 'image/png', data: 'x', sizeBytes: 10 }] },
    })
    expect(await commit(draft)).toEqual({ ok: false, failure: 'quota-exceeded' })
  })

  it('does not consult storage quota when there is nothing to add', async () => {
    await commit(spendDraft())
    expect(checkStorageQuota).not.toHaveBeenCalled()
  })

  it('writes nothing and never opens an atomic block when a draft is refused', async () => {
    await commit(spendDraft({ amount: 'nope' }))
    expect(mockDb.atomically).not.toHaveBeenCalled()
    expect(transactions).toHaveLength(0)
    expect(incrementVectorClock).not.toHaveBeenCalled()
  })
})

// ─── Commit ───────────────────────────────────────────────────────────────────

describe('commitTransaction', () => {
  it('writes an expense with authorSeq from the guarded clock bump', async () => {
    const result = await commit(spendDraft())

    expect(transactions).toHaveLength(1)
    expect(result.ok && result.value.transaction).toEqual(transactions[0])
    expect(result.ok && result.value.transaction.authorSeq).toBe(7)
    expect(incrementVectorClock).toHaveBeenCalledWith('g1', 'u1')
  })

  it('trims the note and stores the amount as integer paise', async () => {
    await commit(spendDraft({ note: '  Chai  ', amount: '45.5' }))
    expect(transactions[0]?.note).toBe('Chai')
    expect(transactions[0]?.amount).toBe(4550)
  })

  it('writes an income transaction', async () => {
    await commit(spendDraft({ type: 'income', categoryId: 'cat-income' }))
    expect(transactions[0]?.type).toBe('income')
    expect(transactions[0]?.categoryId).toBe('cat-income')
  })

  it('defaults paidBy to the acting user for a spend', async () => {
    await commit(spendDraft({ paidBy: null }))
    expect(transactions[0]?.paidBy).toBe('u1')
  })

  it('keeps an explicit paidBy', async () => {
    await commit(spendDraft({ paidBy: 'u2' }))
    expect(transactions[0]?.paidBy).toBe('u2')
  })

  it('shapes a transfer: no category, both accounts set, nobody paid', async () => {
    await commit(transferDraft())
    expect(transactions[0]).toMatchObject({
      type: 'transfer',
      categoryId: '',
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      paidBy: null,
    })
  })

  it('persists pending attachments and links their ids', async () => {
    const draft = spendDraft({
      attachments: {
        keep: [],
        add: [
          { mimeType: 'image/png', data: 'AAA', sizeBytes: 3 },
          { mimeType: 'image/jpeg', data: 'BBB', sizeBytes: 4 },
        ],
      },
    })
    await commit(draft)

    expect(attachments).toHaveLength(2)
    expect(transactions[0]?.attachmentIds).toEqual(attachments.map((a) => a.attachmentId))
    expect(attachments.every((a) => a.txnId === transactions[0]?.txnId)).toBe(true)
  })

  it('writes no attachments when none are pending', async () => {
    await commit(spendDraft())
    expect(attachments).toHaveLength(0)
    expect(transactions[0]?.attachmentIds).toEqual([])
  })

  it('creates no recurrence when the draft does not ask for one', async () => {
    const result = await commit(spendDraft())
    expect(recurrences).toHaveLength(0)
    expect(result.ok && result.value.recurrenceId).toBeNull()
    expect(transactions[0]?.recurrenceId).toBeNull()
  })

  it('creates a recurrence and links it to the transaction', async () => {
    const result = await commit(
      spendDraft({
        repeat: { frequency: 'monthly', endDate: null, isFixed: true },
      }),
    )

    expect(recurrences).toHaveLength(1)
    expect(result.ok && result.value.recurrenceId).toBe(recurrences[0]?.recurrenceId)
    expect(transactions[0]?.recurrenceId).toBe(recurrences[0]?.recurrenceId)
    expect(recurrences[0]?.template.amount).toBe(10000)
    expect(recurrences[0]?.isFixed).toBe(true)
  })

  it('wraps the whole sequence in one atomic block', async () => {
    await commit(
      spendDraft({
        repeat: { frequency: 'monthly', endDate: null, isFixed: false },
        attachments: { keep: [], add: [{ mimeType: 'image/png', data: 'A', sizeBytes: 1 }] },
      }),
    )
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
  })

  it('lets an invariant violation throw rather than returning a failure', async () => {
    vi.mocked(incrementVectorClock).mockRejectedValue(new Error('Group not found'))
    await expect(commit(spendDraft())).rejects.toThrow('Group not found')
    expect(transactions).toHaveLength(0)
  })
})

// ─── Recurrence anchoring ─────────────────────────────────────────────────────

describe('recurrence anchoring', () => {
  it('derives nextDue one period after the transaction date, for each frequency', async () => {
    for (const frequency of ['daily', 'weekly', 'monthly', 'quarterly'] as const) {
      recurrences = []
      await commit(
        spendDraft({ repeat: { frequency, dayOfWeek: 1, endDate: null, isFixed: false } }),
      )
      expect(recurrences[0]?.nextDue).toBe(nextOccurrence(DATE, frequency, 1))
    }
  })

  it('only sets dayOfWeek when the frequency is weekly', async () => {
    await commit(
      spendDraft({ repeat: { frequency: 'weekly', dayOfWeek: 3, endDate: null, isFixed: false } }),
    )
    expect(recurrences[0]?.dayOfWeek).toBe(3)

    recurrences = []
    await commit(
      spendDraft({ repeat: { frequency: 'monthly', dayOfWeek: 3, endDate: null, isFixed: false } }),
    )
    expect(recurrences[0]?.dayOfWeek).toBeUndefined()
  })

  it('derives the weekly anchor from the transaction date when the draft names none', async () => {
    // 15 Jun 2026 is a Monday; a weekly repeat with no explicit anchor is Mondays,
    // not whatever weekday happens to be today.
    await commit(spendDraft({ repeat: { frequency: 'weekly', endDate: null, isFixed: false } }))
    expect(recurrences[0]?.dayOfWeek).toBe(1)
    expect(recurrences[0]?.nextDue).toBe(nextOccurrence(DATE, 'weekly', 1))
  })

  it('derives the weekly anchor from a future transaction date, not from today', async () => {
    const future = Date.UTC(2026, 5, 25) // Thursday, ten days out
    await commit(
      spendDraft({
        date: future,
        repeat: { frequency: 'weekly', endDate: null, isFixed: false },
      }),
    )
    expect(recurrences[0]?.dayOfWeek).toBe(4)
  })

  it('clamps a monthly anchor into short months instead of overflowing', async () => {
    await commit(
      spendDraft({
        date: Date.UTC(2020, 0, 31), // Jan 31
        repeat: { frequency: 'monthly', endDate: null, isFixed: false },
      }),
    )
    // Feb 2020 has 29 days — clamped, not spilled into March
    expect(recurrences[0]?.nextDue).toBe(Date.UTC(2020, 1, 29))
  })

  it('forces isFixed false for income, which is never a fixed outflow', async () => {
    await commit(
      spendDraft({
        type: 'income',
        categoryId: 'cat-income',
        repeat: { frequency: 'monthly', endDate: null, isFixed: true },
      }),
    )
    expect(recurrences[0]?.isFixed).toBe(false)
  })
})

// ─── Amend ────────────────────────────────────────────────────────────────────

describe('amendTransaction', () => {
  function amend(draft: TransactionDraft) {
    return amendTransaction({ userId: 'u1', txnId: 'txn-1', draft })
  }

  it('refuses when the transaction is gone', async () => {
    mockDb.transactions.get.mockResolvedValue(undefined)
    expect(await amend(spendDraft())).toEqual({ ok: false, failure: 'transaction-not-found' })
    expect(transactions).toHaveLength(0)
  })

  it('refuses to change a transaction’s type', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn({ type: 'expense' }))
    expect(await amend(transferDraft())).toEqual({
      ok: false,
      failure: 'type-change-not-allowed',
    })
    expect(transactions).toHaveLength(0)
  })

  it('updates the editable fields and leaves identity alone', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn())

    const result = await amend(
      spendDraft({ amount: '75', note: '  New note  ', tags: ['x'], date: DATE }),
    )

    expect(result.ok).toBe(true)
    expect(transactions[0]).toMatchObject({
      txnId: 'txn-1',
      ownerId: 'u2',
      type: 'expense',
      createdAt: 1000,
      amount: 7500,
      note: 'New note',
      tags: ['x'],
      date: DATE,
    })
  })

  it('bumps the clock on the transaction’s own space', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn({ groupId: 'g-other' }))
    await amend(spendDraft())
    expect(incrementVectorClock).toHaveBeenCalledWith('g-other', 'u1')
    expect(transactions[0]?.authorSeq).toBe(7)
  })

  it('deletes the attachments the draft drops and keeps the rest', async () => {
    stored = [storedAttachment('att-1'), storedAttachment('att-2')]
    mockDb.transactions.get.mockResolvedValue(existingTxn({ attachmentIds: ['att-1', 'att-2'] }))

    await amend(spendDraft({ attachments: { keep: ['att-1'], add: [] } }))

    expect(deletedAttachmentIds).toEqual(['att-2'])
    expect(transactions[0]?.attachmentIds).toEqual(['att-1'])
  })

  it('adds new attachments alongside the kept ones', async () => {
    stored = [storedAttachment('att-1')]
    mockDb.transactions.get.mockResolvedValue(existingTxn({ attachmentIds: ['att-1'] }))

    await amend(
      spendDraft({
        attachments: {
          keep: ['att-1'],
          add: [{ mimeType: 'image/png', data: 'NEW', sizeBytes: 3 }],
        },
      }),
    )

    expect(attachments).toHaveLength(1)
    expect(transactions[0]?.attachmentIds).toEqual(['att-1', attachments[0]?.attachmentId])
    expect(deletedAttachmentIds).toEqual([])
  })

  it('drops an id the row still lists but no attachment row backs', async () => {
    stored = []
    mockDb.transactions.get.mockResolvedValue(existingTxn({ attachmentIds: ['ghost'] }))

    await amend(spendDraft({ attachments: { keep: ['ghost'], add: [] } }))

    expect(transactions[0]?.attachmentIds).toEqual([])
  })

  it('reads the stored row and its attachments inside the atomic block', async () => {
    stored = [storedAttachment('att-1')]
    mockDb.transactions.get.mockResolvedValue(existingTxn({ attachmentIds: ['att-1'] }))

    const callOrder: string[] = []
    mockDb.atomically.mockImplementation(async (fn: () => Promise<unknown>) => {
      callOrder.push('open')
      const out = await fn()
      callOrder.push('close')
      return out
    })
    mockDb.transactions.get.mockImplementation(async () => {
      callOrder.push('get')
      return existingTxn({ attachmentIds: ['att-1'] })
    })

    await amend(spendDraft({ attachments: { keep: ['att-1'], add: [] } }))

    expect(callOrder).toEqual(['open', 'get', 'close'])
  })

  it('refuses an invalid draft before opening an atomic block', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn())
    expect(await amend(spendDraft({ amount: '0' }))).toEqual({
      ok: false,
      failure: 'invalid-amount',
    })
    expect(mockDb.atomically).not.toHaveBeenCalled()
  })

  it('enforces the transfer rules the edit path used to skip', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn({ type: 'transfer' }))
    expect(await amend(transferDraft({ fromAccountId: 'a', toAccountId: 'a' }))).toEqual({
      ok: false,
      failure: 'transfer-same-account',
    })
  })
})

// ─── Void ─────────────────────────────────────────────────────────────────────

describe('voidTransaction', () => {
  function voidTxn() {
    return voidTransaction({ userId: 'u1', txnId: 'txn-1' })
  }

  it('refuses when the transaction is gone', async () => {
    mockDb.transactions.get.mockResolvedValue(undefined)
    expect(await voidTxn()).toEqual({ ok: false, failure: 'transaction-not-found' })
    expect(transactions).toHaveLength(0)
  })

  it('stamps deletedAt and bumps the clock, leaving the row in place', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn())

    const result = await voidTxn()

    expect(result.ok).toBe(true)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]?.txnId).toBe('txn-1')
    expect(transactions[0]?.deletedAt).not.toBeNull()
    expect(transactions[0]?.authorSeq).toBe(7)
    expect(transactions[0]?.updatedAt).toBe(transactions[0]?.deletedAt)
  })

  it('bumps the clock on the transaction’s own space', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn({ groupId: 'g-other' }))
    await voidTxn()
    expect(incrementVectorClock).toHaveBeenCalledWith('g-other', 'u1')
  })

  it('keeps the attachments and the rest of the record untouched', async () => {
    mockDb.transactions.get.mockResolvedValue(
      existingTxn({ attachmentIds: ['att-1'], note: 'Rent' }),
    )
    await voidTxn()
    expect(transactions[0]?.attachmentIds).toEqual(['att-1'])
    expect(transactions[0]?.note).toBe('Rent')
    expect(deletedAttachmentIds).toEqual([])
  })

  it('is idempotent — voiding twice writes nothing and advances no clock', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn({ deletedAt: 5000 }))

    const result = await voidTxn()

    expect(result).toEqual({ ok: true, value: existingTxn({ deletedAt: 5000 }) })
    expect(transactions).toHaveLength(0)
    expect(incrementVectorClock).not.toHaveBeenCalled()
  })

  it('does the lookup and the write in one atomic block', async () => {
    mockDb.transactions.get.mockResolvedValue(existingTxn())
    await voidTxn()
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
  })
})

// ─── The row ──────────────────────────────────────────────────────────────────

describe('buildLedgerRow', () => {
  function spec(overrides: Partial<LedgerRowSpec> = {}): LedgerRowSpec {
    return {
      groupId: 'g1',
      ownerId: 'u1',
      categoryId: 'cat-1',
      type: 'expense',
      amount: 10000,
      currency: 'INR',
      fxRate: null,
      originalAmount: null,
      note: 'Rent',
      tags: ['home'],
      date: DATE,
      attachmentIds: ['att-1'],
      recurrenceId: 'rec-1',
      accountId: 'acc-1',
      toAccountId: null,
      paidBy: 'u1',
      ...overrides,
    }
  }

  it('carries every field of the spec through untouched', () => {
    const row = buildLedgerRow('txn-9', spec(), 4)
    expect(row).toMatchObject(spec())
  })

  it('stamps identity and bookkeeping', () => {
    const row = buildLedgerRow('txn-9', spec(), 4)
    expect(row.txnId).toBe('txn-9')
    expect(row.authorSeq).toBe(4)
    expect(row.deletedAt).toBeNull()
    expect(row.createdAt).toBe(row.updatedAt)
  })

  it('cannot be overridden by the spec — identity fields are not in it', () => {
    const row = buildLedgerRow('txn-9', spec({ recurrenceId: null }), 4)
    expect(row.txnId).toBe('txn-9')
    expect(row.recurrenceId).toBeNull()
  })
})

// ─── Commit many ──────────────────────────────────────────────────────────────

describe('commitMany', () => {
  function spec(note: string): LedgerRowSpec {
    return {
      groupId: 'g1',
      ownerId: 'u1',
      categoryId: 'cat-1',
      type: 'expense',
      amount: 10000,
      currency: 'INR',
      fxRate: null,
      originalAmount: null,
      note,
      tags: [],
      date: DATE,
      attachmentIds: [],
      recurrenceId: null,
      accountId: null,
      toAccountId: null,
      paidBy: 'u1',
    }
  }

  it('writes nothing and opens no atomic block for an empty batch', async () => {
    const written = await commitMany({ groupId: 'g1', userId: 'u1', rows: [] })
    expect(written).toEqual([])
    expect(mockDb.atomically).not.toHaveBeenCalled()
    expect(incrementVectorClock).not.toHaveBeenCalled()
  })

  it('gives every row its own guarded clock bump', async () => {
    let seq = 0
    vi.mocked(incrementVectorClock).mockImplementation(async () => {
      seq += 1
      return seq
    })

    const written = await commitMany({
      groupId: 'g1',
      userId: 'u1',
      rows: [spec('a'), spec('b'), spec('c')],
    })

    expect(written.map((t) => t.authorSeq)).toEqual([1, 2, 3])
    expect(incrementVectorClock).toHaveBeenCalledTimes(3)
    expect(incrementVectorClock).toHaveBeenCalledWith('g1', 'u1')
  })

  it('writes the whole batch in one atomic block', async () => {
    await commitMany({ groupId: 'g1', userId: 'u1', rows: [spec('a'), spec('b')] })
    expect(mockDb.atomically).toHaveBeenCalledTimes(1)
    expect(transactions).toHaveLength(2)
  })

  it('gives each row a distinct id', async () => {
    const written = await commitMany({
      groupId: 'g1',
      userId: 'u1',
      rows: [spec('a'), spec('b')],
    })
    expect(new Set(written.map((t) => t.txnId)).size).toBe(2)
  })

  it('lets a guard violation throw partway through', async () => {
    vi.mocked(incrementVectorClock).mockRejectedValue(new Error('userId mismatch'))
    await expect(commitMany({ groupId: 'g1', userId: 'u1', rows: [spec('a')] })).rejects.toThrow(
      'userId mismatch',
    )
    expect(transactions).toHaveLength(0)
  })
})
