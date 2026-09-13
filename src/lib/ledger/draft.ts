import type { Category, RecurrenceFrequency, Transaction, TransactionType } from '@/db/schema'
import { suggestCategoryId } from '@/lib/categorize'
import type { PendingAttachment, TransactionDraft } from '@/lib/ledger/write'
import type { ParsedReceipt } from '@/lib/ocr'
import { formatDateStr, parseDateStr, todayLocalDateStr } from '@/lib/utils'

/**
 * Everything a transaction form holds. Deliberately not React state: it's a
 * plain value, so the rules below are testable without mounting anything.
 *
 * Presentation-only flags (which drawer is open, OCR progress, the in-flight
 * spinner) are NOT here — they belong to whatever is rendering.
 */
export interface DraftState {
  type: TransactionType
  amount: string
  note: string
  dateStr: string
  categoryId: string | null
  /** A category *name* guessed from a receipt, resolved to an id only at the end. */
  categoryHint: string | null
  accountId: string | null
  toAccountId: string | null
  paidBy: string | null
  tags: string[]
  tagInput: string
  /** Ids of already-stored attachments to retain, and new ones to write. */
  attachments: { keep: string[]; add: PendingAttachment[] }
  repeat: boolean
  frequency: RecurrenceFrequency
  /** Null until the user picks one — the anchor otherwise follows the date. */
  dayOfWeek: number | null
  endDateStr: string
  isFixed: boolean
}

export type DraftAction =
  | { kind: 'set-type'; value: TransactionType }
  | { kind: 'set-amount'; value: string }
  | { kind: 'set-note'; value: string }
  | { kind: 'set-date'; value: string }
  | { kind: 'set-category'; value: string | null }
  | { kind: 'set-account'; value: string | null }
  | { kind: 'set-to-account'; value: string | null }
  | { kind: 'set-paid-by'; value: string | null }
  | { kind: 'set-tag-input'; value: string }
  | { kind: 'commit-tag' }
  | { kind: 'remove-tag'; tag: string }
  | { kind: 'add-attachments'; value: PendingAttachment[] }
  | { kind: 'drop-attachment'; id: string }
  | { kind: 'drop-new-attachment'; index: number }
  | { kind: 'apply-parsed'; parsed: ParsedReceipt }
  | { kind: 'set-repeat'; value: boolean }
  | { kind: 'set-frequency'; value: RecurrenceFrequency }
  | { kind: 'set-day-of-week'; value: number }
  | { kind: 'set-end-date'; value: string }
  | { kind: 'set-is-fixed'; value: boolean }
  /** Replace the whole Draft — seeding an amend form from its transaction. */
  | { kind: 'seed'; value: DraftState }
  | { kind: 'reset' }

const MAX_TAGS = 10

export function emptyDraft(): DraftState {
  return {
    type: 'expense',
    amount: '',
    note: '',
    dateStr: todayLocalDateStr(),
    categoryId: null,
    categoryHint: null,
    accountId: null,
    toAccountId: null,
    paidBy: null,
    tags: [],
    tagInput: '',
    attachments: { keep: [], add: [] },
    repeat: false,
    frequency: 'monthly',
    dayOfWeek: null,
    endDateStr: '',
    isFixed: false,
  }
}

/** Seeds a Draft from a transaction being amended. */
export function draftFromTransaction(txn: Transaction): DraftState {
  return {
    ...emptyDraft(),
    type: txn.type,
    amount: (txn.amount / 100).toFixed(2),
    note: txn.note,
    dateStr: formatDateStr(txn.date),
    categoryId: txn.categoryId || null,
    accountId: txn.accountId ?? null,
    toAccountId: txn.toAccountId ?? null,
    paidBy: txn.paidBy ?? null,
    tags: txn.tags ?? [],
    attachments: { keep: txn.attachmentIds ?? [], add: [] },
  }
}

/** Tags are lowercase, punctuation-free, unique, and capped. */
function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.kind) {
    case 'set-type':
      // Categories belong to one type, so a type switch drops the chosen one.
      return { ...state, type: action.value, categoryId: null }
    case 'set-amount':
      return { ...state, amount: action.value }
    case 'set-note':
      return { ...state, note: action.value }
    case 'set-date':
      return { ...state, dateStr: action.value }
    case 'set-category':
      return { ...state, categoryId: action.value }
    case 'set-account':
      // Keeping a destination equal to the new source would be an invalid transfer.
      return {
        ...state,
        accountId: action.value,
        toAccountId: state.toAccountId === action.value ? null : state.toAccountId,
      }
    case 'set-to-account':
      return { ...state, toAccountId: action.value }
    case 'set-paid-by':
      return { ...state, paidBy: action.value }
    case 'set-tag-input':
      return { ...state, tagInput: action.value }
    case 'commit-tag': {
      const tag = normalizeTag(state.tagInput)
      const accepted = tag && !state.tags.includes(tag) && state.tags.length < MAX_TAGS
      return { ...state, tags: accepted ? [...state.tags, tag] : state.tags, tagInput: '' }
    }
    case 'remove-tag':
      return { ...state, tags: state.tags.filter((t) => t !== action.tag) }
    case 'add-attachments':
      return {
        ...state,
        attachments: { ...state.attachments, add: [...state.attachments.add, ...action.value] },
      }
    case 'drop-attachment':
      return {
        ...state,
        attachments: {
          ...state.attachments,
          keep: state.attachments.keep.filter((id) => id !== action.id),
        },
      }
    case 'drop-new-attachment':
      return {
        ...state,
        attachments: {
          ...state.attachments,
          add: state.attachments.add.filter((_, i) => i !== action.index),
        },
      }
    case 'apply-parsed': {
      const { parsed } = action
      return {
        ...state,
        amount: parsed.amount != null ? String(parsed.amount) : state.amount,
        note: parsed.note || state.note,
        dateStr: parsed.date !== null ? formatDateStr(parsed.date) : state.dateStr,
        categoryHint: parsed.categoryHint,
      }
    }
    case 'set-repeat':
      return { ...state, repeat: action.value }
    case 'set-frequency':
      return { ...state, frequency: action.value }
    case 'set-day-of-week':
      return { ...state, dayOfWeek: action.value }
    case 'set-end-date':
      return { ...state, endDateStr: action.value }
    case 'set-is-fixed':
      return { ...state, isFixed: action.value }
    case 'seed':
      return action.value
    case 'reset':
      return emptyDraft()
  }
}

// ─── Reading the Draft ────────────────────────────────────────────────────────

/** Invalid input becomes NaN, which the write seam refuses by name. */
function parseDateOrNaN(dateStr: string): number {
  try {
    return parseDateStr(dateStr)
  } catch {
    return Number.NaN
  }
}

/**
 * The category the form is acting on: an explicit pick, else whatever a receipt
 * suggested. Null when nothing has been chosen and nothing was guessed.
 */
export function effectiveCategoryId(state: DraftState, categories: Category[]): string | null {
  if (state.type === 'transfer') return null
  if (state.categoryId) return state.categoryId
  return suggestCategoryId(categories, state.type, state.categoryHint, state.note)
}

/** Turns form state into the Draft the write seam accepts. */
export function toTransactionDraft(state: DraftState, categories: Category[]): TransactionDraft {
  const base = {
    amount: state.amount,
    note: state.note,
    tags: state.tags,
    date: parseDateOrNaN(state.dateStr),
    attachments: state.attachments,
  }

  if (state.type === 'transfer') {
    return {
      ...base,
      type: 'transfer',
      fromAccountId: state.accountId,
      toAccountId: state.toAccountId,
    }
  }

  return {
    ...base,
    type: state.type,
    categoryId: effectiveCategoryId(state, categories),
    accountId: state.accountId,
    paidBy: state.paidBy,
    repeat: state.repeat
      ? {
          frequency: state.frequency,
          ...(state.dayOfWeek !== null && { dayOfWeek: state.dayOfWeek }),
          endDate: state.endDateStr ? parseDateOrNaN(state.endDateStr) : null,
          isFixed: state.isFixed,
        }
      : null,
  }
}
