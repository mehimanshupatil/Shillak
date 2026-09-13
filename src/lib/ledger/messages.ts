import type { LedgerFailure } from '@/lib/ledger/write'

/**
 * One home for what each refusal says to the user. Kept beside the taxonomy so
 * adding a failure forces adding its message, rather than each sheet inventing
 * its own wording.
 */
const MESSAGES: Record<LedgerFailure, string> = {
  'invalid-amount': 'Enter a valid amount',
  'missing-category': 'Select a category',
  'missing-account': 'Select both accounts',
  'transfer-same-account': 'Source and destination must differ',
  'attachment-too-large': 'Attachment too large (max 5 MB each)',
  'quota-exceeded': 'Storage above 90% — attachment uploads blocked.',
  'date-not-utc-midnight': 'Pick a valid date',
  'transaction-not-found': 'That transaction no longer exists',
  'type-change-not-allowed': "A transaction's type can't be changed",
}

export function ledgerFailureMessage(failure: LedgerFailure): string {
  return MESSAGES[failure]
}
