import { db } from '@/db/db'
import type { RecurrenceFrequency, Transaction, TransactionType } from '@/db/schema'
import { buildRecurrenceTemplate } from '@/lib/recurrenceTemplate'
import { generateId } from '@/lib/utils'
import { incrementVectorClock } from '@/sync/vector-clock'

export interface PendingAttachmentInput {
  mimeType: string
  data: string
  sizeBytes: number
}

export interface QuickTransactionRecurrenceInput {
  frequency: RecurrenceFrequency
  dayOfWeek: number
  endDate: number | null
  isFixed: boolean
}

export interface CreateQuickTransactionInput {
  groupId: string
  userId: string
  type: TransactionType
  amount: number // paise — caller has already called toPaise()
  currency: string
  categoryId: string // '' for transfers
  accountId: string | null
  toAccountId: string | null
  paidBy: string | null
  note: string
  tags: string[]
  date: number
  pendingAttachments: PendingAttachmentInput[]
  recurrence: QuickTransactionRecurrenceInput | null
}

export interface CreateQuickTransactionResult {
  transaction: Transaction
  recurrenceId: string | null
}

/**
 * Writes a quick-add transaction: vector-clock bump, attachments, an optional
 * recurrence, and the transaction row — atomically, per ADR-0001. Callers
 * decide per-type field shaping (categoryId/toAccountId/paidBy for transfers
 * vs expense/income) before calling; this module just orchestrates the write.
 */
export async function createQuickTransaction(
  input: CreateQuickTransactionInput,
): Promise<CreateQuickTransactionResult> {
  return db.atomically(async () => {
    const authorSeq = await incrementVectorClock(input.groupId, input.userId)
    const txnId = generateId()

    const attachmentIds: string[] = []
    for (const att of input.pendingAttachments) {
      const attachmentId = generateId()
      await db.attachments.put({
        attachmentId,
        groupId: input.groupId,
        txnId,
        mimeType: att.mimeType,
        data: att.data,
        sizeBytes: att.sizeBytes,
        createdAt: Date.now(),
      })
      attachmentIds.push(attachmentId)
    }

    let recurrenceId: string | null = null
    if (input.recurrence) {
      recurrenceId = generateId()
      await db.recurrences.put(
        buildRecurrenceTemplate({
          recurrenceId,
          groupId: input.groupId,
          ownerId: input.userId,
          frequency: input.recurrence.frequency,
          dayOfWeek: input.recurrence.dayOfWeek,
          txnDate: input.date,
          endDate: input.recurrence.endDate,
          isFixed: input.recurrence.isFixed,
          template: {
            groupId: input.groupId,
            ownerId: input.userId,
            categoryId: input.categoryId,
            type: input.type,
            amount: input.amount,
            currency: input.currency,
            fxRate: null,
            originalAmount: null,
            note: input.note,
            tags: input.tags,
            attachmentIds: [],
            accountId: input.accountId,
            paidBy: input.paidBy,
          },
        }),
      )
    }

    const transaction: Transaction = {
      txnId,
      groupId: input.groupId,
      ownerId: input.userId,
      authorSeq,
      categoryId: input.categoryId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      fxRate: null,
      originalAmount: null,
      note: input.note,
      tags: input.tags,
      date: input.date,
      attachmentIds,
      recurrenceId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      paidBy: input.paidBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    }
    await db.transactions.put(transaction)

    return { transaction, recurrenceId }
  })
}
