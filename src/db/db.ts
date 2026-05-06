import Dexie from 'dexie'
import { decryptRecord, encryptRecord } from '@/crypto/encrypt'
import { getKey } from '@/stores/key.store'
import type {
  Account,
  Attachment,
  Budget,
  Category,
  ConflictLog,
  Group,
  GroupInvite,
  GroupMember,
  KeystoreRecord,
  Recurrence,
  SavingsGoal,
  SyncEvent,
  Transaction,
  User,
} from './schema'

// ─── AppLockedError ───────────────────────────────────────────────────────────
export class AppLockedError extends Error {
  constructor() {
    super('App is locked — PIN required')
  }
}

// ─── Encrypted record wrapper ─────────────────────────────────────────────────
interface EncryptedRow {
  _id: string
  _data: string // base64 AES-GCM ciphertext of the actual record
}

// ─── EncryptedTable ───────────────────────────────────────────────────────────
// Wraps a Dexie.Table<EncryptedRow> and transparently encrypts/decrypts.
// keyField: the primary key field name on the plaintext record (e.g. 'txnId')
// biome-ignore lint/suspicious/noExplicitAny: generic table wrapper requires any for flexible record types
export class EncryptedTable<T extends Record<string, any>> {
  constructor(
    private table: Dexie.Table<EncryptedRow, string>,
    private keyField: keyof T & string,
  ) {}

  private async enc(record: T): Promise<EncryptedRow> {
    const key = getKey()
    if (!key) throw new AppLockedError()
    const _id = record[this.keyField] as string
    const _data = await encryptRecord(record, key)
    return { _id, _data }
  }

  private async dec(row: EncryptedRow): Promise<T> {
    const key = getKey()
    if (!key) throw new AppLockedError()
    return decryptRecord<T>(row._data, key)
  }

  async add(record: T): Promise<string> {
    return this.table.add(await this.enc(record))
  }

  async put(record: T): Promise<string> {
    return this.table.put(await this.enc(record))
  }

  async bulkAdd(records: T[]): Promise<string> {
    const encrypted = await Promise.all(records.map((r) => this.enc(r)))
    return this.table.bulkAdd(encrypted) as Promise<string>
  }

  async bulkPut(records: T[]): Promise<string> {
    const encrypted = await Promise.all(records.map((r) => this.enc(r)))
    return this.table.bulkPut(encrypted) as Promise<string>
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id)
    if (!row) return undefined
    return this.dec(row)
  }

  async bulkGet(ids: string[]): Promise<(T | undefined)[]> {
    const rows = await this.table.bulkGet(ids)
    return Promise.all(rows.map((r) => (r ? this.dec(r) : undefined)))
  }

  async toArray(): Promise<T[]> {
    const rows = await this.table.toArray()
    return Promise.all(rows.map((r) => this.dec(r)))
  }

  async first(): Promise<T | undefined> {
    const row = await this.table.orderBy('_id').first()
    if (!row) return undefined
    return this.dec(row)
  }

  // Update by id — merges patch into decrypted record then re-encrypts
  async update(id: string, patch: Partial<T>): Promise<boolean> {
    const existing = await this.get(id)
    if (!existing) return false
    await this.put({ ...existing, ...patch })
    return true
  }

  // Soft-delete aware filter — always exclude deleted records
  async where(predicate: (record: T) => boolean): Promise<T[]> {
    const all = await this.toArray()
    return all.filter(predicate)
  }

  // Count
  async count(): Promise<number> {
    return this.table.count()
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id)
  }
}

// ─── ShillakDB ────────────────────────────────────────────────────────────────
class ShillakDB extends Dexie {
  // Unencrypted
  keystoreTable!: Dexie.Table<KeystoreRecord, number>

  // Raw encrypted row tables (internal — access via EncryptedTable wrappers below)
  private _users!: Dexie.Table<EncryptedRow, string>
  private _groups!: Dexie.Table<EncryptedRow, string>
  private _members!: Dexie.Table<EncryptedRow, string>
  private _invites!: Dexie.Table<EncryptedRow, string>
  private _categories!: Dexie.Table<EncryptedRow, string>
  private _transactions!: Dexie.Table<EncryptedRow, string>
  private _recurrences!: Dexie.Table<EncryptedRow, string>
  private _attachments!: Dexie.Table<EncryptedRow, string>
  private _budgets!: Dexie.Table<EncryptedRow, string>
  private _goals!: Dexie.Table<EncryptedRow, string>
  private _syncEvents!: Dexie.Table<EncryptedRow, string>
  private _conflicts!: Dexie.Table<EncryptedRow, string>
  private _accounts!: Dexie.Table<EncryptedRow, string>

  // Public encrypted wrappers
  users!: EncryptedTable<User>
  groups!: EncryptedTable<Group>
  members!: EncryptedTable<GroupMember>
  invites!: EncryptedTable<GroupInvite>
  categories!: EncryptedTable<Category>
  transactions!: EncryptedTable<Transaction>
  recurrences!: EncryptedTable<Recurrence>
  attachments!: EncryptedTable<Attachment>
  budgets!: EncryptedTable<Budget>
  goals!: EncryptedTable<SavingsGoal>
  syncEvents!: EncryptedTable<SyncEvent>
  conflicts!: EncryptedTable<ConflictLog>
  accounts!: EncryptedTable<Account>

  constructor() {
    super('Shillak_db')

    this.version(1).stores({
      keystoreTable: 'id',
      _users: '_id',
      _groups: '_id',
      _members: '_id',
      _invites: '_id',
      _categories: '_id',
      _transactions: '_id',
      _recurrences: '_id',
      _attachments: '_id',
      _budgets: '_id',
      _goals: '_id',
      _syncEvents: '_id',
      _conflicts: '_id',
    })

    this.version(2).stores({
      _accounts: '_id',
    })

    this.on('ready', () => {
      this.users = new EncryptedTable<User>(this._users, 'userId')
      this.groups = new EncryptedTable<Group>(this._groups, 'groupId')
      this.members = new EncryptedTable<GroupMember>(this._members, 'id')
      this.invites = new EncryptedTable<GroupInvite>(this._invites, 'inviteId')
      this.categories = new EncryptedTable<Category>(this._categories, 'categoryId')
      this.transactions = new EncryptedTable<Transaction>(this._transactions, 'txnId')
      this.recurrences = new EncryptedTable<Recurrence>(this._recurrences, 'recurrenceId')
      this.attachments = new EncryptedTable<Attachment>(this._attachments, 'attachmentId')
      this.budgets = new EncryptedTable<Budget>(this._budgets, 'budgetId')
      this.goals = new EncryptedTable<SavingsGoal>(this._goals, 'goalId')
      this.syncEvents = new EncryptedTable<SyncEvent>(this._syncEvents, 'syncId')
      this.conflicts = new EncryptedTable<ConflictLog>(this._conflicts, 'conflictId')
      this.accounts = new EncryptedTable<Account>(this._accounts, 'accountId')
    })
  }
}

export const db = new ShillakDB()
