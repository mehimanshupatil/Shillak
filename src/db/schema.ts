// ─── Keystore (unencrypted bootstrap) ────────────────────────────────────────
export interface KeystoreRecord {
  id: 1
  salt: string // base64 PBKDF2 salt
  pinCheck: string // base64 AES-GCM ciphertext of "SHILLAK_V1"
  pinChangeInProgress: boolean
  userId?: string // local device owner — set at profile creation, never overwritten by sync
  // Biometric unlock (WebAuthn PRF) — all optional, absent = not enrolled
  biometricCredentialId?: string | null // base64 WebAuthn rawId
  biometricIv?: string | null // base64 AES-GCM IV for encrypted PIN
  biometricEncryptedPin?: string | null // base64 AES-GCM ciphertext of PIN
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  userId: string
  displayName: string
  avatarColor: string
  avatarIcon?: string // emoji character, e.g. "😊"
  identityBackupHint: string
  createdAt: number
}

// ─── Group ────────────────────────────────────────────────────────────────────
type GroupStatus = 'active' | 'archived'

export interface Group {
  groupId: string
  name: string
  avatarColor: string
  avatarIcon?: string // emoji character, e.g. "🏠"
  createdBy: string
  currency: string
  fiscalYearStart: number // 1–12
  visibility: 'full' | 'totals_only'
  status: GroupStatus
  groupSecret: string // base64 random 32 bytes
  vectorClock: Record<string, number>
  createdAt: number
  updatedAt: number
}

// ─── GroupMember ──────────────────────────────────────────────────────────────
export interface GroupMember {
  id: string
  groupId: string
  userId: string
  role: 'admin' | 'member'
  status: 'active' | 'left'
  joinedAt: number
  leftAt: number | null
  nickname: string | null
  monthlyIncome: number | null // paise
  incomeCurrency: string | null
  updatedAt: number
}

// ─── GroupInvite ──────────────────────────────────────────────────────────────
export interface GroupInvite {
  inviteId: string
  groupId: string
  createdBy: string
  method: 'qr' | 'webrtc' | 'json'
  reusable: boolean
  payload: Record<string, unknown>
  signature: string
  expiresAt: number
  usedBy: string[]
  createdAt: number
}

// ─── Category ─────────────────────────────────────────────────────────────────
export type TransactionType = 'expense' | 'income'

export interface Category {
  categoryId: string
  groupId: string
  name: string
  icon: string
  color: string
  type: TransactionType
  sortOrder: number
  isDefault: boolean
  createdBy: string
  createdAt: number
}

// ─── Account ──────────────────────────────────────────────────────────────────
export type AccountType = 'savings' | 'current' | 'credit' | 'cash' | 'upi'

export interface Account {
  accountId: string
  groupId: string
  name: string // "HDFC Savings", "ICICI Credit Card", "Cash"
  type: AccountType
  color: string
  icon: string // lucide icon name
  sortOrder: number
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

// ─── Transaction ──────────────────────────────────────────────────────────────
export interface Transaction {
  txnId: string
  groupId: string
  ownerId: string
  authorSeq: number
  categoryId: string
  type: TransactionType
  amount: number // integer paise
  currency: string
  fxRate: number | null // integer basis points (10000 = 1:1)
  originalAmount: number | null // integer paise in original currency
  note: string
  tags: string[]
  date: number // midnight UTC unix ms
  attachmentIds: string[]
  recurrenceId: string | null
  accountId: string | null // which account was debited/credited
  paidBy: string | null // userId — who actually spent (null = unspecified/household)
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

// ─── Recurrence ───────────────────────────────────────────────────────────────
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

type RecurrenceTemplate = Omit<
  Transaction,
  'txnId' | 'date' | 'recurrenceId' | 'authorSeq' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export interface Recurrence {
  recurrenceId: string
  groupId: string
  ownerId: string
  template: RecurrenceTemplate
  frequency: RecurrenceFrequency
  interval: number
  nextDue: number
  lastGeneratedAt: number | null
  endDate: number | null
  active: boolean
  isFixed?: boolean // true = committed outflow (EMI, SIP, rent) — separates from discretionary spend
  createdAt: number
}

// ─── Attachment ───────────────────────────────────────────────────────────────
export interface Attachment {
  attachmentId: string
  groupId: string
  txnId: string
  mimeType: string
  data: string // base64 raw bytes (encrypted at record level)
  sizeBytes: number
  createdAt: number
}

// ─── Budget ───────────────────────────────────────────────────────────────────
export interface Budget {
  budgetId: string
  groupId: string
  categoryId: string
  limit: number // paise
  period: 'monthly' | 'yearly'
  updatedAt: number
}

// ─── SavingsGoal ──────────────────────────────────────────────────────────────
export interface SavingsGoal {
  goalId: string
  groupId: string
  name: string
  target: number // paise
  saved: number // paise — used only when categoryId is null (manual tracking)
  deadline: number | null
  categoryId: string | null // income category to auto-derive progress from
  createdAt: number // lower bound for auto-tracked income sum
  updatedAt: number
}

// ─── SyncEvent ────────────────────────────────────────────────────────────────
export interface SyncEvent {
  syncId: string
  groupId: string
  initiatedBy: string
  method: 'webrtc' | 'qr' | 'json'
  syncedWith: string
  recordsSent: number
  recordsReceived: number
  conflictsFound: number
  status: 'ok' | 'partial' | 'failed'
  syncedAt: number
}

// ─── ConflictLog ──────────────────────────────────────────────────────────────
export interface ConflictLog {
  conflictId: string
  groupId: string
  syncId: string
  entityType: 'transaction' | 'budget' | 'goal'
  entityId: string
  localValue: Record<string, unknown>
  remoteValue: Record<string, unknown>
  resolvedBy: string | null
  resolution: 'local' | 'remote' | 'pending'
  createdAt: number
  resolvedAt: number | null
}
