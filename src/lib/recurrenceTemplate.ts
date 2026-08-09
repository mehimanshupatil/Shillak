import type { Recurrence, RecurrenceFrequency, RecurrenceTemplate } from '@/db/schema'
import { nextOccurrence, today } from '@/lib/utils'

interface BuildInput {
  recurrenceId: string
  groupId: string
  ownerId: string
  frequency: RecurrenceFrequency
  dayOfWeek: number
  txnDate: number
  endDate: number | null
  isFixed: boolean
  template: RecurrenceTemplate
}

/** Builds a new Recurrence anchored to the originating transaction's date. */
export function buildRecurrenceTemplate({
  recurrenceId,
  groupId,
  ownerId,
  frequency,
  dayOfWeek,
  txnDate,
  endDate,
  isFixed,
  template,
}: BuildInput): Recurrence {
  return {
    recurrenceId,
    groupId,
    ownerId,
    template,
    frequency,
    interval: 1,
    dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
    nextDue: nextOccurrence(txnDate, frequency, dayOfWeek),
    lastGeneratedAt: txnDate,
    endDate,
    active: true,
    isFixed,
    createdAt: Date.now(),
  }
}

export interface RecurrenceEditPatch {
  frequency: RecurrenceFrequency
  dayOfWeek: number
  endDate: number | null
  isFixed: boolean
  amount: number
  note: string
}

type RecurrenceEditResult = Pick<
  Recurrence,
  'frequency' | 'interval' | 'dayOfWeek' | 'nextDue' | 'endDate' | 'isFixed' | 'template'
>

/**
 * Applies an edit to an existing Recurrence. Monthly/quarterly keep their anchor
 * day-of-month untouched when the schedule doesn't change — only a frequency switch
 * or a new weekly dayOfWeek realigns `nextDue`, from today. Otherwise a frequency
 * switch would leave `nextDue` stale under the old cadence until that far-future
 * date naturally arrives.
 */
export function applyRecurrenceEdit(
  existing: Recurrence,
  patch: RecurrenceEditPatch,
): RecurrenceEditResult {
  const scheduleChanged =
    patch.frequency !== existing.frequency ||
    (patch.frequency === 'weekly' && patch.dayOfWeek !== existing.dayOfWeek)

  return {
    frequency: patch.frequency,
    interval: 1,
    dayOfWeek: patch.frequency === 'weekly' ? patch.dayOfWeek : undefined,
    nextDue: scheduleChanged
      ? nextOccurrence(today(), patch.frequency, patch.dayOfWeek)
      : existing.nextDue,
    endDate: patch.endDate,
    isFixed: existing.template.type === 'expense' ? patch.isFixed : false,
    template: { ...existing.template, amount: patch.amount, note: patch.note },
  }
}
