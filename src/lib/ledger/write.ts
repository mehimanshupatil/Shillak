import { db } from '@/db/db'
import type {
  DateOnly,
  Recurrence,
  RecurrenceFrequency,
  RecurrenceTemplate,
  Transaction,
  TransactionType,
} from '@/db/schema'
import { checkStorageQuota, isAttachmentTooLarge } from '@/lib/attachments'
import { generateId, nextOccurrence, toPaise } from '@/lib/utils'
import { incrementVectorClock } from '@/sync/vector-clock'

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Closed set of ways a Draft can be refused. Closed so callers switch
 * exhaustively and each message has one home.
 *
 * Invariant violations are NOT in here — they throw. A locked app, a missing
 * group, or a clock bump for someone else's user id are bugs, not user input.
 */
export type LedgerFailure =
  | 'invalid-amount'
  | 'missing-category'
  | 'missing-account'
  | 'transfer-same-account'
  | 'attachment-too-large'
  | 'quota-exceeded'
  | 'invalid-date'
  | 'transaction-not-found'
  | 'type-change-not-allowed'

export type LedgerResult<T> = { ok: true; value: T } | { ok: false; failure: LedgerFailure }

function fail(failure: LedgerFailure): { ok: false; failure: LedgerFailure } {
  return { ok: false, failure }
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export interface PendingAttachment {
  mimeType: string
  data: string // base64
  sizeBytes: number
}

/** The attachments a Draft wants the transaction to end up with. */
export interface AttachmentPlan {
  /** Ids of already-stored attachments to retain. Always empty when committing. */
  keep: string[]
  add: PendingAttachment[]
}

export interface RepeatSpec {
  frequency: RecurrenceFrequency
  /** Weekly anchor. Omit and it's derived from the Draft's own date. */
  dayOfWeek?: number
  endDate: DateOnly | null
  isFixed: boolean
}

interface DraftBase {
  /** Raw user input in rupees — this module parses it and converts to paise. */
  amount: string
  note: string
  tags: string[]
  /** The calendar day, or null when the field could not be read. */
  date: DateOnly | null
  attachments: AttachmentPlan
}

export interface SpendDraft extends DraftBase {
  type: 'expense' | 'income'
  categoryId: string | null
  accountId: string | null
  paidBy: string | null
  repeat: RepeatSpec | null
}

export interface TransferDraft extends DraftBase {
  type: 'transfer'
  fromAccountId: string | null
  toAccountId: string | null
}

/**
 * A validated statement of intent to change the Ledger. Discriminated on `type`
 * so a transfer cannot carry a category and a spend cannot carry a destination
 * account — the illegal combinations aren't representable rather than merely
 * discouraged.
 */
export type TransactionDraft = SpendDraft | TransferDraft

// ─── Validation ───────────────────────────────────────────────────────────────

/** Rupee input → integer paise. Null when it isn't a positive number. */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const rupees = Number.parseFloat(trimmed)
  if (Number.isNaN(rupees) || rupees <= 0) return null
  return toPaise(rupees)
}

/** Returns the validated money and day, or the first reason the Draft is refused. */
function validateDraft(draft: TransactionDraft): LedgerResult<{ amount: number; date: DateOnly }> {
  // A DateOnly can only be built by the constructors in lib/utils, so if one
  // exists at all it is already a midnight-UTC calendar day — the type carries
  // what a runtime check used to. Null means the field couldn't be read.
  if (draft.date === null) return fail('invalid-date')

  const amount = parseAmount(draft.amount)
  if (amount === null) return fail('invalid-amount')

  if (draft.type === 'transfer') {
    if (!draft.fromAccountId || !draft.toAccountId) return fail('missing-account')
    if (draft.fromAccountId === draft.toAccountId) return fail('transfer-same-account')
  } else if (!draft.categoryId) {
    return fail('missing-category')
  }

  for (const att of draft.attachments.add) {
    if (isAttachmentTooLarge(att.sizeBytes)) return fail('attachment-too-large')
  }

  return { ok: true, value: { amount, date: draft.date } }
}

/**
 * Storage headroom. Callers warn at 80% before the user ever submits; this is
 * the hard stop, so the rule has a single authority.
 */
async function checkQuota(plan: AttachmentPlan): Promise<LedgerFailure | null> {
  if (!plan.add.length) return null
  const { blocked } = await checkStorageQuota()
  return blocked ? 'quota-exceeded' : null
}

// ─── Shaping ──────────────────────────────────────────────────────────────────

interface ShapedFields {
  categoryId: string
  accountId: string | null
  toAccountId: string | null
  paidBy: string | null
}

/** Per-type field shaping. Lives here so no caller has to remember it. */
function shape(draft: TransactionDraft, userId: string): ShapedFields {
  if (draft.type === 'transfer') {
    return {
      categoryId: '',
      accountId: draft.fromAccountId,
      toAccountId: draft.toAccountId,
      paidBy: null,
    }
  }
  return {
    categoryId: draft.categoryId ?? '',
    accountId: draft.accountId,
    toAccountId: null,
    paidBy: draft.paidBy ?? userId,
  }
}

// ─── Recurrence ───────────────────────────────────────────────────────────────

/**
 * Builds the Recurrence a Draft asked for, anchored to the transaction's own
 * date. Weekly is the one frequency with an explicit anchor; when the Draft
 * doesn't name one it comes from the transaction date, never from "today" —
 * picking a date two weeks out and repeating weekly anchors on that date.
 */
function buildRecurrence(args: {
  recurrenceId: string
  groupId: string
  ownerId: string
  type: TransactionType
  txnDate: DateOnly
  repeat: RepeatSpec
  template: RecurrenceTemplate
}): Recurrence {
  const { recurrenceId, groupId, ownerId, type, txnDate, repeat, template } = args
  const dayOfWeek = repeat.dayOfWeek ?? new Date(txnDate).getUTCDay()

  return {
    recurrenceId,
    groupId,
    ownerId,
    template,
    frequency: repeat.frequency,
    interval: 1,
    dayOfWeek: repeat.frequency === 'weekly' ? dayOfWeek : undefined,
    nextDue: nextOccurrence(txnDate, repeat.frequency, dayOfWeek),
    lastGeneratedAt: txnDate,
    endDate: repeat.endDate,
    active: true,
    // Fixed outflow is an expense-only distinction — income is never fixed.
    isFixed: type === 'expense' ? repeat.isFixed : false,
    createdAt: Date.now(),
  }
}

// ─── The row ──────────────────────────────────────────────────────────────────

/**
 * Everything about a transaction that isn't identity or bookkeeping. Callers
 * that already hold validated values — a stored Recurrence template, an
 * import — describe a row this way rather than spelling out the record.
 */
export type LedgerRowSpec = Omit<
  Transaction,
  'txnId' | 'authorSeq' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

/**
 * The single spelling of a new transaction record. Adding a field to
 * `Transaction` means editing this function, not five call sites.
 */
export function buildLedgerRow(txnId: string, spec: LedgerRowSpec, authorSeq: number): Transaction {
  const now = Date.now()
  return { txnId, ...spec, authorSeq, createdAt: now, updatedAt: now, deletedAt: null }
}

// ─── Attachments ──────────────────────────────────────────────────────────────

async function storeAttachments(
  groupId: string,
  txnId: string,
  pending: PendingAttachment[],
): Promise<string[]> {
  const ids: string[] = []
  for (const att of pending) {
    const attachmentId = generateId()
    await db.attachments.put({
      attachmentId,
      groupId,
      txnId,
      mimeType: att.mimeType,
      data: att.data,
      sizeBytes: att.sizeBytes,
      createdAt: Date.now(),
    })
    ids.push(attachmentId)
  }
  return ids
}

// ─── Commit ───────────────────────────────────────────────────────────────────

export interface CommitInput {
  groupId: string
  userId: string
  currency: string
  draft: TransactionDraft
}

export interface CommitOutcome {
  transaction: Transaction
  recurrenceId: string | null
}

/**
 * Adds a new transaction to the Ledger. The clock bump, the attachments, any
 * Recurrence and the row itself all land together or not at all, per ADR-0001.
 */
export async function commitTransaction(input: CommitInput): Promise<LedgerResult<CommitOutcome>> {
  const validated = validateDraft(input.draft)
  if (!validated.ok) return validated

  const quota = await checkQuota(input.draft.attachments)
  if (quota) return fail(quota)

  const { groupId, userId, currency, draft } = input
  const { amount, date } = validated.value
  const fields = shape(draft, userId)

  const value = await db.atomically(async () => {
    const authorSeq = await incrementVectorClock(groupId, userId)
    const txnId = generateId()

    const attachmentIds = await storeAttachments(groupId, txnId, draft.attachments.add)

    const common = {
      groupId,
      ownerId: userId,
      categoryId: fields.categoryId,
      type: draft.type,
      amount,
      currency,
      fxRate: null,
      originalAmount: null,
      note: draft.note.trim(),
      tags: draft.tags,
      accountId: fields.accountId,
      toAccountId: fields.toAccountId,
      paidBy: fields.paidBy,
    }

    let recurrenceId: string | null = null
    if (draft.type !== 'transfer' && draft.repeat) {
      recurrenceId = generateId()
      await db.recurrences.put(
        buildRecurrence({
          recurrenceId,
          groupId,
          ownerId: userId,
          type: draft.type,
          txnDate: date,
          repeat: draft.repeat,
          template: { ...common, attachmentIds: [] },
        }),
      )
    }

    const transaction = buildLedgerRow(
      txnId,
      { ...common, attachmentIds, date, recurrenceId },
      authorSeq,
    )
    await db.transactions.put(transaction)

    return { transaction, recurrenceId }
  })

  return { ok: true, value }
}

// ─── Amend ────────────────────────────────────────────────────────────────────

export interface AmendInput {
  userId: string
  txnId: string
  draft: TransactionDraft
}

/**
 * Replaces an existing transaction's details from a Draft. Identity, owner,
 * type and original author are untouched.
 *
 * The stored row and its attachments are read *inside* the atomic block, so
 * there is no window in which a caller can hand over a half-loaded view of
 * what already exists. The clock advances on the transaction's own space, not
 * on whatever space happens to be active.
 */
export async function amendTransaction(input: AmendInput): Promise<LedgerResult<Transaction>> {
  const validated = validateDraft(input.draft)
  if (!validated.ok) return validated

  const quota = await checkQuota(input.draft.attachments)
  if (quota) return fail(quota)

  const { userId, txnId, draft } = input
  const { amount, date } = validated.value

  return db.atomically(async (): Promise<LedgerResult<Transaction>> => {
    // Both refusals below must stay ahead of every write in this block — a
    // returned failure still replays whatever was staged before it.
    const existing = await db.transactions.get(txnId)
    if (!existing) return fail('transaction-not-found')
    if (existing.type !== draft.type) return fail('type-change-not-allowed')

    const stored = await db.attachments.where((a) => a.txnId === txnId)
    const keep = new Set(draft.attachments.keep)
    for (const att of stored) {
      if (!keep.has(att.attachmentId)) await db.attachments.delete(att.attachmentId)
    }
    const keptIds = stored.filter((a) => keep.has(a.attachmentId)).map((a) => a.attachmentId)
    const addedIds = await storeAttachments(existing.groupId, txnId, draft.attachments.add)

    const authorSeq = await incrementVectorClock(existing.groupId, userId)
    const fields = shape(draft, userId)

    const transaction: Transaction = {
      ...existing,
      authorSeq,
      categoryId: fields.categoryId,
      amount,
      note: draft.note.trim(),
      tags: draft.tags,
      date,
      attachmentIds: [...keptIds, ...addedIds],
      accountId: fields.accountId,
      toAccountId: fields.toAccountId,
      paidBy: fields.paidBy,
      updatedAt: Date.now(),
    }
    await db.transactions.put(transaction)

    return { ok: true, value: transaction }
  })
}

// ─── Void ─────────────────────────────────────────────────────────────────────

export interface VoidInput {
  userId: string
  txnId: string
}

/**
 * Withdraws a transaction from the Ledger. The row stays — peers have to be
 * able to learn it was withdrawn — so this stamps `deletedAt` and advances the
 * clock on the transaction's own space, both in one atomic block.
 *
 * Idempotent: voiding something already voided changes nothing and doesn't
 * advance the clock, so a double tap can't manufacture a delta.
 */
export async function voidTransaction(input: VoidInput): Promise<LedgerResult<Transaction>> {
  const { userId, txnId } = input

  return db.atomically(async (): Promise<LedgerResult<Transaction>> => {
    // Must stay ahead of every write in this block — a returned failure still
    // replays whatever was staged before it.
    const existing = await db.transactions.get(txnId)
    if (!existing) return fail('transaction-not-found')
    if (existing.deletedAt !== null) return { ok: true, value: existing }

    const authorSeq = await incrementVectorClock(existing.groupId, userId)
    const now = Date.now()
    const transaction: Transaction = { ...existing, authorSeq, deletedAt: now, updatedAt: now }
    await db.transactions.put(transaction)

    return { ok: true, value: transaction }
  })
}

// ─── Commit many ──────────────────────────────────────────────────────────────

export interface CommitManyInput {
  groupId: string
  userId: string
  rows: LedgerRowSpec[]
}

/**
 * Adds a batch of already-validated rows in one atomic block — an import, not
 * a Draft. Each row gets its own guarded clock bump; the reads behind those
 * bumps are served from the staged writes after the first, so this is one
 * decrypt, not one per row.
 *
 * Callers own what they consider a duplicate; this writes what it's given.
 */
export async function commitMany(input: CommitManyInput): Promise<Transaction[]> {
  const { groupId, userId, rows } = input
  if (rows.length === 0) return []

  return db.atomically(async () => {
    const written: Transaction[] = []
    for (const spec of rows) {
      const authorSeq = await incrementVectorClock(groupId, userId)
      const transaction = buildLedgerRow(generateId(), spec, authorSeq)
      await db.transactions.put(transaction)
      written.push(transaction)
    }
    return written
  })
}
