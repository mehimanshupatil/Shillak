import { describe, expect, it } from 'vitest'
import { createDefaultAccounts, createDefaultCategories } from '../seeds'

describe('createDefaultCategories', () => {
  it('seeds 16 expense and 4 income categories, all tagged isDefault', () => {
    const categories = createDefaultCategories('g1', 'u1')
    expect(categories.filter((c) => c.type === 'expense')).toHaveLength(16)
    expect(categories.filter((c) => c.type === 'income')).toHaveLength(4)
    expect(categories.every((c) => c.isDefault)).toBe(true)
  })

  it('assigns every category a unique categoryId', () => {
    const categories = createDefaultCategories('g1', 'u1')
    const ids = new Set(categories.map((c) => c.categoryId))
    expect(ids.size).toBe(categories.length)
  })

  it('assigns contiguous sortOrder across expense then income, with no gaps or overlap', () => {
    const categories = createDefaultCategories('g1', 'u1')
    const sortOrders = categories.map((c) => c.sortOrder).sort((a, b) => a - b)
    expect(sortOrders).toEqual(Array.from({ length: categories.length }, (_, i) => i))
  })

  it('threads groupId and createdBy through every category', () => {
    const categories = createDefaultCategories('g-xyz', 'u-abc')
    expect(categories.every((c) => c.groupId === 'g-xyz')).toBe(true)
    expect(categories.every((c) => c.createdBy === 'u-abc')).toBe(true)
  })

  it('includes an "Other" expense catch-all category', () => {
    const categories = createDefaultCategories('g1', 'u1')
    expect(categories.some((c) => c.name === 'Other' && c.type === 'expense')).toBe(true)
  })
})

describe('createDefaultAccounts', () => {
  it('seeds exactly one cash, savings, credit, and upi account', () => {
    const accounts = createDefaultAccounts('g1')
    expect(accounts.map((a) => a.type).sort()).toEqual(['cash', 'credit', 'savings', 'upi'])
  })

  it('assigns every account a unique accountId', () => {
    const accounts = createDefaultAccounts('g1')
    const ids = new Set(accounts.map((a) => a.accountId))
    expect(ids.size).toBe(accounts.length)
  })

  it('all default accounts are tagged isDefault with contiguous sortOrder', () => {
    const accounts = createDefaultAccounts('g1')
    expect(accounts.every((a) => a.isDefault)).toBe(true)
    expect(accounts.map((a) => a.sortOrder).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })

  it('threads groupId through every account', () => {
    const accounts = createDefaultAccounts('g-xyz')
    expect(accounts.every((a) => a.groupId === 'g-xyz')).toBe(true)
  })
})
