import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '@/db/schema'
import type { LedgerRowSpec } from '@/lib/ledger/write'
import {
  amountToPaiseAndType,
  autoDetectColumns,
  buildPreviewRows,
  commitCsvImport,
  guessDateFormat,
  isDuplicateTransaction,
  parseAmountValue,
  parseCsvText,
  parseDateWithFormat,
} from '../csvImport'

const mockDb = vi.hoisted(() => ({ transactions: { where: vi.fn() } }))
vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/lib/ledger/write', () => ({ commitMany: vi.fn() }))

import { commitMany } from '@/lib/ledger/write'
import { dateOnly } from '@/lib/utils'

describe('parseCsvText', () => {
  it('splits headers and rows, skipping blank lines', () => {
    const { rows } = parseCsvText('date,amount,note\n2026-01-01,100,Coffee\n\n2026-01-02,50,Tea\n')
    expect(rows).toEqual([
      ['date', 'amount', 'note'],
      ['2026-01-01', '100', 'Coffee'],
      ['2026-01-02', '50', 'Tea'],
    ])
  })
})

describe('autoDetectColumns', () => {
  it('matches common bank-statement header names', () => {
    const mapping = autoDetectColumns(['Txn Date', 'Narration', 'Debit', 'Credit', 'Category'])
    expect(mapping).toEqual({ date: 0, note: 1, amount: null, debit: 2, credit: 3, category: 4 })
  })

  it('returns null for columns it cannot confidently match', () => {
    const mapping = autoDetectColumns(['Col A', 'Col B'])
    expect(mapping).toEqual({
      date: null,
      note: null,
      amount: null,
      debit: null,
      credit: null,
      category: null,
    })
  })
})

describe('parseDateWithFormat', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parseDateWithFormat('2026-07-21', 'YYYY-MM-DD')).toBe(dateOnly(2026, 6, 21))
  })

  it('parses DD/MM/YYYY', () => {
    expect(parseDateWithFormat('21/07/2026', 'DD/MM/YYYY')).toBe(dateOnly(2026, 6, 21))
  })

  it('parses MM/DD/YYYY', () => {
    expect(parseDateWithFormat('07/21/2026', 'MM/DD/YYYY')).toBe(dateOnly(2026, 6, 21))
  })

  it('parses DD MMM YYYY', () => {
    expect(parseDateWithFormat('21 Jul 2026', 'DD MMM YYYY')).toBe(dateOnly(2026, 6, 21))
  })

  it('rejects an out-of-range day/month instead of silently rolling over', () => {
    expect(parseDateWithFormat('31/02/2026', 'DD/MM/YYYY')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseDateWithFormat('', 'YYYY-MM-DD')).toBeNull()
  })
})

describe('guessDateFormat', () => {
  it('picks DD/MM/YYYY when samples are only valid in that format', () => {
    // day=21 can't be a month, so this is unambiguous.
    expect(guessDateFormat(['21/07/2026', '15/07/2026'])).toBe('DD/MM/YYYY')
  })

  it('picks MM/DD/YYYY when samples are only valid in that format', () => {
    expect(guessDateFormat(['07/21/2026', '07/15/2026'])).toBe('MM/DD/YYYY')
  })
})

describe('parseAmountValue', () => {
  it('parses a plain number', () => {
    expect(parseAmountValue('1250.50')).toBe(1250.5)
  })

  it('strips currency symbols and thousands separators', () => {
    expect(parseAmountValue('₹1,250.50')).toBe(1250.5)
  })

  it('treats parenthesized values as negative', () => {
    expect(parseAmountValue('(500.00)')).toBe(-500)
  })

  it('handles an explicit minus sign', () => {
    expect(parseAmountValue('-99.99')).toBe(-99.99)
  })

  it('returns null for unparseable input', () => {
    expect(parseAmountValue('N/A')).toBeNull()
  })
})

describe('amountToPaiseAndType', () => {
  it('treats negative rupees as an expense', () => {
    expect(amountToPaiseAndType(-450.5)).toEqual({ amountPaise: 45050, type: 'expense' })
  })

  it('treats positive rupees as income', () => {
    expect(amountToPaiseAndType(850)).toEqual({ amountPaise: 85000, type: 'income' })
  })
})

describe('isDuplicateTransaction', () => {
  const existing: Array<Pick<Transaction, 'date' | 'amount' | 'note'>> = [
    { date: dateOnly(2026, 6, 1), amount: 45050, note: 'Weekly shop' },
  ]

  it('matches on exact date + amount + note (case-insensitive)', () => {
    const dup = isDuplicateTransaction(
      { date: dateOnly(2026, 6, 1), amount: 45050, note: 'weekly shop' },
      existing,
    )
    expect(dup).toBe(true)
  })

  it('does not match when the amount differs', () => {
    const dup = isDuplicateTransaction(
      { date: dateOnly(2026, 6, 1), amount: 999, note: 'Weekly shop' },
      existing,
    )
    expect(dup).toBe(false)
  })
})

describe('commitCsvImport', () => {
  function row(overrides: Partial<Parameters<typeof commitCsvImport>[3][number]> = {}) {
    return {
      date: dateOnly(2026, 0, 1),
      amount: 10000,
      type: 'expense' as const,
      categoryId: 'cat-1',
      note: 'Coffee',
      accountId: 'acc-1',
      ...overrides,
    }
  }

  function specsPassed(): LedgerRowSpec[] {
    return vi.mocked(commitMany).mock.calls[0]?.[0].rows ?? []
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.transactions.where.mockResolvedValue([])
    vi.mocked(commitMany).mockImplementation(async ({ rows }) => rows.map(() => ({}) as never))
  })

  it('writes every row when nothing matches', async () => {
    const result = await commitCsvImport('g1', 'u1', 'INR', [row(), row({ note: 'Tea' })])
    expect(result).toEqual({ imported: 2, skipped: 0 })
  })

  it('skips a row that matches an existing transaction on date, amount and note', async () => {
    mockDb.transactions.where.mockResolvedValue([
      { date: dateOnly(2026, 0, 1), amount: 10000, note: ' coffee ' } as Transaction,
    ])
    const result = await commitCsvImport('g1', 'u1', 'INR', [row()])
    expect(result).toEqual({ imported: 0, skipped: 1 })
    expect(specsPassed()).toEqual([])
  })

  it('dedupes rows against earlier rows in the same import', async () => {
    const result = await commitCsvImport('g1', 'u1', 'INR', [row(), row(), row({ note: 'Tea' })])
    expect(result).toEqual({ imported: 2, skipped: 1 })
  })

  it('hands the batch to commitMany as one call', async () => {
    await commitCsvImport('g1', 'u1', 'INR', [row(), row({ note: 'Tea' })])
    expect(commitMany).toHaveBeenCalledTimes(1)
    expect(vi.mocked(commitMany).mock.calls[0]?.[0]).toMatchObject({
      groupId: 'g1',
      userId: 'u1',
    })
  })

  it('shapes each row as an imported spend owned and paid by the importer', async () => {
    await commitCsvImport('g1', 'u1', 'INR', [row()])
    expect(specsPassed()[0]).toEqual({
      groupId: 'g1',
      ownerId: 'u1',
      categoryId: 'cat-1',
      type: 'expense',
      amount: 10000,
      currency: 'INR',
      fxRate: null,
      originalAmount: null,
      note: 'Coffee',
      tags: [],
      date: dateOnly(2026, 0, 1),
      attachmentIds: [],
      recurrenceId: null,
      accountId: 'acc-1',
      toAccountId: null,
      paidBy: 'u1',
    })
  })

  it('ignores soft-deleted transactions when looking for duplicates', async () => {
    await commitCsvImport('g1', 'u1', 'INR', [row()])
    const predicate = mockDb.transactions.where.mock.calls[0]?.[0] as (t: Transaction) => boolean
    expect(predicate({ groupId: 'g1', deletedAt: 1 } as Transaction)).toBe(false)
    expect(predicate({ groupId: 'g1', deletedAt: null } as Transaction)).toBe(true)
  })
})

describe('buildPreviewRows', () => {
  const CATEGORIES: Category[] = [
    { categoryId: 'exp', name: 'Other', type: 'expense' } as Category,
    { categoryId: 'inc', name: 'Other Income', type: 'income' } as Category,
  ]

  const MAPPING = { date: 0, amount: 1, note: 2, category: null, debit: null, credit: null }

  function build(
    rows: string[][],
    existing: Array<Pick<Transaction, 'date' | 'amount' | 'note'>> = [],
  ) {
    return buildPreviewRows(rows, MAPPING, 'signed', 'YYYY-MM-DD', CATEGORIES, existing)
  }

  it('turns mapped cells into rows a person can approve', () => {
    const { rows } = build([['2026-01-01', '-250.50', 'Coffee']])
    expect(rows[0]).toMatchObject({
      ok: true,
      date: dateOnly(2026, 0, 1),
      amountPaise: 25050,
      type: 'expense',
      note: 'Coffee',
      isDuplicate: false,
    })
  })

  it('reads a positive amount as income', () => {
    const { rows } = build([['2026-01-01', '5000', 'Salary']])
    expect(rows[0]).toMatchObject({ ok: true, type: 'income', amountPaise: 500000 })
  })

  it('marks a row that cannot be read, rather than dropping it', () => {
    const { rows } = build([['not-a-date', 'nonsense', 'x']])
    expect(rows[0]).toEqual({ ok: false, raw: 'not-a-date, nonsense, x' })
  })

  it('flags a row that matches something already in the Ledger', () => {
    const { rows } = build(
      [['2026-01-01', '-250.50', 'Coffee']],
      [{ date: dateOnly(2026, 0, 1), amount: 25050, note: 'Coffee' }],
    )
    expect(rows[0]).toMatchObject({ isDuplicate: true })
  })

  it('flags the second of two identical rows in the same file', () => {
    const { rows } = build([
      ['2026-01-01', '-250.50', 'Coffee'],
      ['2026-01-01', '-250.50', 'Coffee'],
    ])
    expect(rows[0]).toMatchObject({ isDuplicate: false })
    expect(rows[1]).toMatchObject({ isDuplicate: true })
  })

  it('agrees with the commit about whitespace — the two rules used to differ', () => {
    // The preview trims the note; the stored row may not be trimmed. The preview
    // verdict is what the user approves, so it has to match what commit will do.
    const existing = [{ date: dateOnly(2026, 0, 1), amount: 25050, note: '  Coffee  ' }]
    const { rows } = build([['2026-01-01', '-250.50', 'Coffee']], existing)
    expect(rows[0]).toMatchObject({ isDuplicate: true })
    expect(
      isDuplicateTransaction(
        { date: dateOnly(2026, 0, 1), amount: 25050, note: 'Coffee' },
        existing,
      ),
    ).toBe(true)
  })

  it('resolves a category for every readable row', () => {
    const { rows, categoryOverride } = build([
      ['2026-01-01', '-100', 'x'],
      ['2026-01-02', '100', 'y'],
    ])
    expect(rows[0]).toMatchObject({ categoryId: 'exp' })
    expect(rows[1]).toMatchObject({ categoryId: 'inc' })
    expect(categoryOverride).toEqual({ 0: 'exp', 1: 'inc' })
  })

  it('does not offer a category for a row it could not read', () => {
    const { categoryOverride } = build([['bad', 'bad', 'bad']])
    expect(categoryOverride).toEqual({})
  })
})
