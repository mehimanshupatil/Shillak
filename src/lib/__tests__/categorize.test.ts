import { describe, expect, it } from 'vitest'
import { inferCategoryName } from '../categorize'

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
