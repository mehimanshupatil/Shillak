import { describe, expect, it } from 'vitest'
import { parseReceiptText } from '../ocr'

describe('parseReceiptText — amount extraction', () => {
  it('picks GRAND TOTAL over a bare item price', () => {
    const { amount } = parseReceiptText('Item 1 100\nItem 2 50\nGRAND TOTAL ₹150.00')
    expect(amount).toBe(150)
  })

  it('prefers the labeled total over subtotal/tax noise lines', () => {
    const { amount } = parseReceiptText('Subtotal ₹140\nGST ₹10\nGRAND TOTAL ₹150')
    expect(amount).toBe(150)
  })

  it('parses a UPI "Paid\\n<amount>" screenshot with no currency symbol', () => {
    const { amount } = parseReceiptText('Paid\n250.00\nto John Doe')
    expect(amount).toBe(250)
  })

  it('falls back to a bare number followed by a spend keyword', () => {
    const { amount } = parseReceiptText('You spent 99 rupees at the store')
    expect(amount).toBe(99)
  })

  it('returns null when no amount can be found', () => {
    const { amount } = parseReceiptText('Thank you for visiting our store')
    expect(amount).toBeNull()
  })
})

describe('parseReceiptText — merchant extraction', () => {
  it('extracts the BHIM "Banking Name\\n<NAME>" pattern and title-cases it', () => {
    const { note } = parseReceiptText('Banking Name\nCHANDRAKANT D NAIK\nAmount ₹500')
    expect(note).toBe('Chandrakant D Naik')
  })

  it('extracts "paid to <name>" and stops at the next keyword', () => {
    const { note } = parseReceiptText('You paid to Swiggy on 05 May 2026 via UPI')
    expect(note).toBe('Swiggy')
  })

  it('strips the UPI VPA handle from a merchant name', () => {
    const { note } = parseReceiptText('paid to ramesh@okhdfcbank for lunch')
    expect(note).toBe('ramesh')
  })

  it('returns empty string when no merchant pattern matches', () => {
    const { note } = parseReceiptText('Have a nice day')
    expect(note).toBe('')
  })
})

describe('parseReceiptText — date extraction', () => {
  it('parses DD/MM/YYYY', () => {
    const { date } = parseReceiptText('Paid on 05/03/2026')
    expect(date).toBe(Date.UTC(2026, 2, 5))
  })

  it('parses ISO YYYY-MM-DD', () => {
    const { date } = parseReceiptText('2026-03-05')
    expect(date).toBe(Date.UTC(2026, 2, 5))
  })

  it('parses an ordinal date with 2-digit year — "5th May 26"', () => {
    const { date } = parseReceiptText('5th May 26')
    expect(date).toBe(Date.UTC(2026, 4, 5))
  })

  it('parses "Month D, YYYY" — "May 5, 2025"', () => {
    const { date } = parseReceiptText('May 5, 2025')
    expect(date).toBe(Date.UTC(2025, 4, 5))
  })

  it('rejects a date more than a year in the future as OCR noise', () => {
    const farFuture = new Date(Date.now() + 400 * 86400_000)
    const dd = String(farFuture.getUTCDate()).padStart(2, '0')
    const mm = String(farFuture.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = farFuture.getUTCFullYear()
    const { date } = parseReceiptText(`${dd}/${mm}/${yyyy}`)
    expect(date).toBeNull()
  })

  it('returns null when no date pattern matches', () => {
    const { date } = parseReceiptText('no date here')
    expect(date).toBeNull()
  })
})

describe('parseReceiptText — category hint', () => {
  it('maps a known food-delivery merchant to Dining', () => {
    const { categoryHint } = parseReceiptText('Paid to Swiggy ₹450')
    expect(categoryHint).toBe('Dining')
  })

  it('maps a fuel-station merchant to Fuel', () => {
    const { categoryHint } = parseReceiptText('Paid to HPCL ₹2000')
    expect(categoryHint).toBe('Fuel')
  })

  it('maps a streaming merchant to Entertainment', () => {
    const { categoryHint } = parseReceiptText('Paid to Netflix ₹649')
    expect(categoryHint).toBe('Entertainment')
  })

  it('returns null when no keyword matches', () => {
    const { categoryHint } = parseReceiptText('Paid to Some Random Shop ₹100')
    expect(categoryHint).toBeNull()
  })
})
