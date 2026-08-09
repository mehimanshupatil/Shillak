import { describe, expect, it } from 'vitest'
import type { Recurrence } from '@/db/schema'
import { applyRecurrenceEdit, buildRecurrenceTemplate } from '@/lib/recurrenceTemplate'
import { nextOccurrence, today } from '@/lib/utils'

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
    nextDue: Date.UTC(2020, 5, 15),
    lastGeneratedAt: null,
    endDate: null,
    active: true,
    createdAt: 0,
    ...overrides,
  }
}

describe('buildRecurrenceTemplate', () => {
  const baseInput = {
    recurrenceId: 'rec-1',
    groupId: 'g1',
    ownerId: 'u1',
    txnDate: Date.UTC(2020, 5, 15),
    endDate: null,
    isFixed: false,
    template: makeRecurrence().template,
  }

  it('derives nextDue one period after the anchor transaction date, for each frequency', () => {
    for (const frequency of ['daily', 'weekly', 'monthly', 'quarterly'] as const) {
      const rec = buildRecurrenceTemplate({ ...baseInput, frequency, dayOfWeek: 1 })
      expect(rec.nextDue).toBe(nextOccurrence(baseInput.txnDate, frequency, 1))
    }
  })

  it('only sets dayOfWeek when frequency is weekly', () => {
    const weekly = buildRecurrenceTemplate({ ...baseInput, frequency: 'weekly', dayOfWeek: 3 })
    expect(weekly.dayOfWeek).toBe(3)

    const monthly = buildRecurrenceTemplate({ ...baseInput, frequency: 'monthly', dayOfWeek: 3 })
    expect(monthly.dayOfWeek).toBeUndefined()
  })

  it('anchors monthly/quarterly to the transaction day-of-month via nextOccurrence/advanceDate', () => {
    const txnDate = Date.UTC(2020, 0, 31) // Jan 31
    const rec = buildRecurrenceTemplate({
      ...baseInput,
      txnDate,
      frequency: 'monthly',
      dayOfWeek: 0,
    })
    // Feb has 29 days in 2020 (leap year) — clamped, not overflowed into March
    expect(rec.nextDue).toBe(Date.UTC(2020, 1, 29))
  })
})

describe('applyRecurrenceEdit', () => {
  const basePatch = {
    frequency: 'monthly' as const,
    dayOfWeek: 0,
    endDate: null,
    isFixed: false,
    amount: 60000,
    note: 'Rent (updated)',
  }

  it('preserves the existing nextDue/anchor when frequency is unchanged', () => {
    const existing = makeRecurrence({ frequency: 'monthly', nextDue: Date.UTC(2020, 5, 15) })
    const result = applyRecurrenceEdit(existing, basePatch)
    expect(result.nextDue).toBe(existing.nextDue)
  })

  it('preserves nextDue for a same-dayOfWeek weekly edit', () => {
    const existing = makeRecurrence({
      frequency: 'weekly',
      dayOfWeek: 2,
      nextDue: Date.UTC(2020, 5, 16),
    })
    const result = applyRecurrenceEdit(existing, {
      ...basePatch,
      frequency: 'weekly',
      dayOfWeek: 2,
    })
    expect(result.nextDue).toBe(existing.nextDue)
  })

  it('realigns nextDue to today when the weekly dayOfWeek changes', () => {
    const existing = makeRecurrence({
      frequency: 'weekly',
      dayOfWeek: 2,
      nextDue: Date.UTC(2020, 5, 16),
    })
    const result = applyRecurrenceEdit(existing, {
      ...basePatch,
      frequency: 'weekly',
      dayOfWeek: 4,
    })
    expect(result.nextDue).toBe(nextOccurrence(today(), 'weekly', 4))
  })

  it('realigns nextDue to today when frequency is switched (the stale-nextDue bug)', () => {
    // Existing monthly recurrence anchored far in the future relative to today.
    const staleNextDue = Date.UTC(2099, 0, 1)
    const existing = makeRecurrence({ frequency: 'monthly', nextDue: staleNextDue })

    const result = applyRecurrenceEdit(existing, { ...basePatch, frequency: 'daily', dayOfWeek: 0 })

    expect(result.nextDue).not.toBe(staleNextDue)
    expect(result.nextDue).toBe(nextOccurrence(today(), 'daily', 0))
  })

  it('only sets dayOfWeek when the new frequency is weekly', () => {
    const existing = makeRecurrence({ frequency: 'weekly', dayOfWeek: 2 })
    const result = applyRecurrenceEdit(existing, { ...basePatch, frequency: 'monthly' })
    expect(result.dayOfWeek).toBeUndefined()
  })

  it('forces isFixed false for non-expense recurrences regardless of patch', () => {
    const existing = makeRecurrence({ template: { ...makeRecurrence().template, type: 'income' } })
    const result = applyRecurrenceEdit(existing, { ...basePatch, isFixed: true })
    expect(result.isFixed).toBe(false)
  })

  it('updates the template amount and note', () => {
    const existing = makeRecurrence()
    const result = applyRecurrenceEdit(existing, basePatch)
    expect(result.template.amount).toBe(60000)
    expect(result.template.note).toBe('Rent (updated)')
  })
})
