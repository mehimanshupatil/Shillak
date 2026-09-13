import { describe, expect, it } from 'vitest'
import type { Category } from '@/db/schema'
import {
  findCategoryByName,
  inferCategoryName,
  resolveCategory,
  suggestCategoryId,
} from '../categorize'

describe('inferCategoryName', () => {
  it('matches an outgoing SIP/mutual fund purchase to Investment', () => {
    expect(inferCategoryName('SIP payment to Zerodha')).toBe('Investment')
  })

  it('matches a mutual fund redemption to Investment Returns, not Investment', () => {
    expect(inferCategoryName('Mutual fund redemption credited')).toBe('Investment Returns')
  })

  it('does not confuse a dividend payout with an outgoing investment', () => {
    expect(inferCategoryName('Dividend received from HDFC')).toBe('Investment Returns')
  })

  it('returns null for unrecognized text', () => {
    expect(inferCategoryName('Some random unrelated text')).toBeNull()
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

describe('findCategoryByName', () => {
  const categories: Category[] = [
    { categoryId: 'c1', name: 'Groceries', type: 'expense' } as Category,
    { categoryId: 'c2', name: 'Salary', type: 'income' } as Category,
  ]

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(findCategoryByName(categories, 'expense', '  gRoCeRiEs ')?.categoryId).toBe('c1')
  })

  it('does not match across types', () => {
    expect(findCategoryByName(categories, 'income', 'Groceries')).toBeUndefined()
  })

  it('returns undefined for an empty name', () => {
    expect(findCategoryByName(categories, 'expense', '   ')).toBeUndefined()
  })
})

describe('suggestCategoryId', () => {
  const categories: Category[] = [
    { categoryId: 'c1', name: 'Groceries', type: 'expense' } as Category,
    { categoryId: 'c2', name: 'Dining', type: 'expense' } as Category,
    { categoryId: 'c3', name: 'Other', type: 'expense' } as Category,
  ]

  it('prefers an explicit hint over anything guessed from the note', () => {
    expect(suggestCategoryId(categories, 'expense', 'Groceries', 'Swiggy order')).toBe('c1')
  })

  it('falls back to guessing from the note when the hint misses', () => {
    expect(suggestCategoryId(categories, 'expense', 'Nonexistent', 'Swiggy order')).toBe('c2')
  })

  it('guesses from the note when there is no hint at all', () => {
    expect(suggestCategoryId(categories, 'expense', null, 'Swiggy order')).toBe('c2')
  })

  it('returns null rather than falling back — nothing is preselected on a miss', () => {
    expect(suggestCategoryId(categories, 'expense', null, 'unrecognisable')).toBeNull()
  })

  it('returns null when no categories are loaded yet', () => {
    expect(suggestCategoryId([], 'expense', 'Groceries', 'Swiggy order')).toBeNull()
  })
})
