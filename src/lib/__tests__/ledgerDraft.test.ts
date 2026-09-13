import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '@/db/schema'
import type { DraftAction, DraftState } from '@/lib/ledger/draft'
import {
  draftFromTransaction,
  draftReducer,
  effectiveCategoryId,
  emptyDraft,
  toTransactionDraft,
} from '@/lib/ledger/draft'
import type { ParsedReceipt } from '@/lib/ocr'

const CATEGORIES: Category[] = [
  { categoryId: 'c1', name: 'Groceries', type: 'expense' } as Category,
  { categoryId: 'c2', name: 'Dining', type: 'expense' } as Category,
  { categoryId: 'c3', name: 'Salary', type: 'income' } as Category,
]

function run(start: DraftState, ...actions: DraftAction[]): DraftState {
  return actions.reduce(draftReducer, start)
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'c1',
    type: 'expense',
    amount: 12345,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'Rent',
    tags: ['home'],
    date: Date.UTC(2026, 5, 15),
    attachmentIds: ['att-1', 'att-2'],
    recurrenceId: null,
    accountId: 'acc-1',
    toAccountId: null,
    paidBy: 'u2',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

describe('draftReducer', () => {
  it('drops the chosen category when the type changes', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-category', value: 'c1' },
      {
        kind: 'set-type',
        value: 'income',
      },
    )
    expect(s.categoryId).toBeNull()
    expect(s.type).toBe('income')
  })

  it('clears a destination account that would equal the new source', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-to-account', value: 'acc-2' },
      { kind: 'set-account', value: 'acc-2' },
    )
    expect(s.toAccountId).toBeNull()
  })

  it('leaves an unrelated destination account alone', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-to-account', value: 'acc-2' },
      { kind: 'set-account', value: 'acc-1' },
    )
    expect(s.toAccountId).toBe('acc-2')
  })

  describe('tags', () => {
    function addTag(state: DraftState, raw: string): DraftState {
      return run(state, { kind: 'set-tag-input', value: raw }, { kind: 'commit-tag' })
    }

    it('normalises to lowercase and strips punctuation', () => {
      expect(addTag(emptyDraft(), '  Food & Drink!  ').tags).toEqual(['fooddrink'])
    })

    it('clears the input whether or not the tag was accepted', () => {
      expect(addTag(emptyDraft(), 'food').tagInput).toBe('')
      expect(addTag(addTag(emptyDraft(), 'food'), 'food').tagInput).toBe('')
    })

    it('refuses duplicates', () => {
      expect(addTag(addTag(emptyDraft(), 'food'), 'FOOD').tags).toEqual(['food'])
    })

    it('refuses an empty tag', () => {
      expect(addTag(emptyDraft(), '  !!  ').tags).toEqual([])
    })

    it('caps the list at ten', () => {
      let s = emptyDraft()
      for (let i = 0; i < 12; i++) s = addTag(s, `tag${i}`)
      expect(s.tags).toHaveLength(10)
    })

    it('removes a tag by name', () => {
      const s = run(addTag(emptyDraft(), 'food'), { kind: 'remove-tag', tag: 'food' })
      expect(s.tags).toEqual([])
    })
  })

  describe('attachments', () => {
    it('appends new attachments without touching the kept ones', () => {
      const start = draftFromTransaction(txn())
      const s = run(start, {
        kind: 'add-attachments',
        value: [{ mimeType: 'image/png', data: 'A', sizeBytes: 1 }],
      })
      expect(s.attachments.keep).toEqual(['att-1', 'att-2'])
      expect(s.attachments.add).toHaveLength(1)
    })

    it('dropping a stored attachment removes it from keep', () => {
      const s = run(draftFromTransaction(txn()), { kind: 'drop-attachment', id: 'att-1' })
      expect(s.attachments.keep).toEqual(['att-2'])
    })

    it('dropping a new attachment removes it by position', () => {
      const s = run(
        emptyDraft(),
        {
          kind: 'add-attachments',
          value: [
            { mimeType: 'image/png', data: 'A', sizeBytes: 1 },
            { mimeType: 'image/png', data: 'B', sizeBytes: 1 },
          ],
        },
        { kind: 'drop-new-attachment', index: 0 },
      )
      expect(s.attachments.add.map((a) => a.data)).toEqual(['B'])
    })
  })

  describe('apply-parsed', () => {
    function parsed(overrides: Partial<ParsedReceipt> = {}): ParsedReceipt {
      return {
        amount: 250,
        note: 'Swiggy',
        date: Date.UTC(2026, 2, 3),
        categoryHint: 'Dining',
        ...overrides,
      }
    }

    it('takes all four fields, not just the amount and note', () => {
      const s = run(emptyDraft(), { kind: 'apply-parsed', parsed: parsed() })
      expect(s.amount).toBe('250')
      expect(s.note).toBe('Swiggy')
      expect(s.dateStr).toBe('2026-03-03')
      expect(s.categoryHint).toBe('Dining')
    })

    it('keeps what it already had when a field came back empty', () => {
      const start = run(
        emptyDraft(),
        { kind: 'set-amount', value: '99' },
        { kind: 'set-note', value: 'Mine' },
        { kind: 'set-date', value: '2026-01-01' },
      )
      const s = run(start, {
        kind: 'apply-parsed',
        parsed: parsed({ amount: null, note: '', date: null }),
      })
      expect(s.amount).toBe('99')
      expect(s.note).toBe('Mine')
      expect(s.dateStr).toBe('2026-01-01')
    })
  })

  it('reset clears every slot, not just the ones a form remembered', () => {
    const dirty = run(
      emptyDraft(),
      { kind: 'set-amount', value: '50' },
      { kind: 'set-note', value: 'x' },
      { kind: 'set-category', value: 'c1' },
      { kind: 'set-tag-input', value: 'food' },
      { kind: 'commit-tag' },
      { kind: 'add-attachments', value: [{ mimeType: 'image/png', data: 'A', sizeBytes: 1 }] },
      { kind: 'set-repeat', value: true },
      {
        kind: 'apply-parsed',
        parsed: { amount: 1, note: 'n', date: null, categoryHint: 'Dining' },
      },
    )
    expect(run(dirty, { kind: 'reset' })).toEqual(emptyDraft())
  })
})

describe('draftFromTransaction', () => {
  it('seeds from the row, including the attachments to keep', () => {
    const s = draftFromTransaction(txn())
    expect(s).toMatchObject({
      type: 'expense',
      amount: '123.45',
      note: 'Rent',
      dateStr: '2026-06-15',
      categoryId: 'c1',
      accountId: 'acc-1',
      paidBy: 'u2',
      tags: ['home'],
    })
    expect(s.attachments).toEqual({ keep: ['att-1', 'att-2'], add: [] })
  })

  it('turns a transfer’s empty category into no category', () => {
    expect(draftFromTransaction(txn({ type: 'transfer', categoryId: '' })).categoryId).toBeNull()
  })
})

describe('effectiveCategoryId', () => {
  it('prefers an explicit pick over a receipt’s guess', () => {
    const s = run(
      emptyDraft(),
      {
        kind: 'apply-parsed',
        parsed: { amount: null, note: '', date: null, categoryHint: 'Dining' },
      },
      { kind: 'set-category', value: 'c1' },
    )
    expect(effectiveCategoryId(s, CATEGORIES)).toBe('c1')
  })

  it('falls back to the receipt’s guess', () => {
    const s = run(emptyDraft(), {
      kind: 'apply-parsed',
      parsed: { amount: null, note: '', date: null, categoryHint: 'Dining' },
    })
    expect(effectiveCategoryId(s, CATEGORIES)).toBe('c2')
  })

  it('is null for a transfer', () => {
    const s = run(emptyDraft(), { kind: 'set-type', value: 'transfer' })
    expect(effectiveCategoryId(s, CATEGORIES)).toBeNull()
  })

  it('is null when nothing is picked and nothing is guessable', () => {
    expect(effectiveCategoryId(emptyDraft(), CATEGORIES)).toBeNull()
  })
})

describe('toTransactionDraft', () => {
  it('produces a spend Draft with the resolved category', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-amount', value: '10' },
      { kind: 'set-category', value: 'c1' },
      { kind: 'set-date', value: '2026-06-15' },
    )
    expect(toTransactionDraft(s, CATEGORIES)).toMatchObject({
      type: 'expense',
      amount: '10',
      categoryId: 'c1',
      date: Date.UTC(2026, 5, 15),
      repeat: null,
    })
  })

  it('produces a transfer Draft carrying both accounts and no category', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-type', value: 'transfer' },
      { kind: 'set-account', value: 'acc-1' },
      { kind: 'set-to-account', value: 'acc-2' },
    )
    const draft = toTransactionDraft(s, CATEGORIES)
    expect(draft).toMatchObject({ type: 'transfer', fromAccountId: 'acc-1', toAccountId: 'acc-2' })
    expect('categoryId' in draft).toBe(false)
  })

  it('omits dayOfWeek until the user picks one, leaving the anchor to the date', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-repeat', value: true },
      {
        kind: 'set-frequency',
        value: 'weekly',
      },
    )
    const draft = toTransactionDraft(s, CATEGORIES)
    expect(draft.type !== 'transfer' && draft.repeat && 'dayOfWeek' in draft.repeat).toBe(false)
  })

  it('passes a chosen dayOfWeek through', () => {
    const s = run(
      emptyDraft(),
      { kind: 'set-repeat', value: true },
      { kind: 'set-frequency', value: 'weekly' },
      { kind: 'set-day-of-week', value: 3 },
    )
    const draft = toTransactionDraft(s, CATEGORIES)
    expect(draft.type !== 'transfer' && draft.repeat?.dayOfWeek).toBe(3)
  })

  it('turns an unparseable date into NaN, which the write seam refuses by name', () => {
    const s = run(emptyDraft(), { kind: 'set-date', value: '' })
    expect(Number.isNaN(toTransactionDraft(s, CATEGORIES).date)).toBe(true)
  })

  it('leaves the end date null when none is set', () => {
    const s = run(emptyDraft(), { kind: 'set-repeat', value: true })
    const draft = toTransactionDraft(s, CATEGORIES)
    expect(draft.type !== 'transfer' && draft.repeat?.endDate).toBeNull()
  })
})
