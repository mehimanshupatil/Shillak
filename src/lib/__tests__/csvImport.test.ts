import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '@/db/schema'
import {
  amountToPaiseAndType,
  autoDetectColumns,
  guessDateFormat,
  isDuplicateTransaction,
  parseAmountValue,
  parseCsvText,
  parseDateWithFormat,
  resolveCategory,
} from '../csvImport'

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
    expect(parseDateWithFormat('2026-07-21', 'YYYY-MM-DD')).toBe(Date.UTC(2026, 6, 21))
  })

  it('parses DD/MM/YYYY', () => {
    expect(parseDateWithFormat('21/07/2026', 'DD/MM/YYYY')).toBe(Date.UTC(2026, 6, 21))
  })

  it('parses MM/DD/YYYY', () => {
    expect(parseDateWithFormat('07/21/2026', 'MM/DD/YYYY')).toBe(Date.UTC(2026, 6, 21))
  })

  it('parses DD MMM YYYY', () => {
    expect(parseDateWithFormat('21 Jul 2026', 'DD MMM YYYY')).toBe(Date.UTC(2026, 6, 21))
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

describe('resolveCategory', () => {
  const categories: Category[] = [
    {
      categoryId: 'exp-groceries',
      groupId: 'g1',
      name: 'Groceries',
      icon: 'ShoppingCart',
      color: '#22c55e',
      type: 'expense',
      sortOrder: 0,
      isDefault: true,
      createdBy: 'u1',
      createdAt: 0,
    },
    {
      categoryId: 'exp-other',
      groupId: 'g1',
      name: 'Other',
      icon: 'CircleDot',
      color: '#888',
      type: 'expense',
      sortOrder: 1,
      isDefault: true,
      createdBy: 'u1',
      createdAt: 0,
    },
    {
      categoryId: 'inc-salary',
      groupId: 'g1',
      name: 'Salary',
      icon: 'Briefcase',
      color: '#22c55e',
      type: 'income',
      sortOrder: 0,
      isDefault: true,
      createdBy: 'u1',
      createdAt: 0,
    },
  ]

  it('prefers an explicit category column match', () => {
    const result = resolveCategory(categories, 'expense', 'groceries', 'random note')
    expect(result).toEqual({ categoryId: 'exp-groceries', matchKind: 'explicit' })
  })

  it('falls back to keyword-guessing the note when no explicit match', () => {
    const result = resolveCategory(categories, 'expense', undefined, 'BigBasket order')
    expect(result).toEqual({ categoryId: 'exp-groceries', matchKind: 'guessed' })
  })

  it('falls back to "Other" when nothing matches', () => {
    const result = resolveCategory(categories, 'expense', undefined, 'some unrecognizable note')
    expect(result).toEqual({ categoryId: 'exp-other', matchKind: 'fallback' })
  })

  it('scopes matching to the given type — an income note never resolves to an expense category', () => {
    const result = resolveCategory(categories, 'income', undefined, 'Monthly salary')
    expect(result).toEqual({ categoryId: 'inc-salary', matchKind: 'guessed' })
  })
})

describe('isDuplicateTransaction', () => {
  const existing: Array<Pick<Transaction, 'date' | 'amount' | 'note'>> = [
    { date: Date.UTC(2026, 6, 1), amount: 45050, note: 'Weekly shop' },
  ]

  it('matches on exact date + amount + note (case-insensitive)', () => {
    const dup = isDuplicateTransaction(
      { date: Date.UTC(2026, 6, 1), amount: 45050, note: 'weekly shop' },
      existing,
    )
    expect(dup).toBe(true)
  })

  it('does not match when the amount differs', () => {
    const dup = isDuplicateTransaction(
      { date: Date.UTC(2026, 6, 1), amount: 999, note: 'Weekly shop' },
      existing,
    )
    expect(dup).toBe(false)
  })
})
