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
//
// Staging (used by ShillakDB.atomically): a real IndexedDB transaction closes
// itself once no request is pending and control returns to the event loop —
// it cannot stay open across the async Web Crypto encrypt/decrypt calls every
// operation here makes (confirmed by a PrematureCommitError when this was
// tried directly). So atomic multi-table writes work in two phases instead:
// phase 1 runs the caller's callback with every EncryptedTable in staging
// mode — encryption still happens eagerly, but the actual Dexie write is
// queued instead of executed, and reads check the queue first so the
// callback still sees its own not-yet-committed writes. Phase 2 replays the
// queued writes inside one real Dexie transaction — now every call is a
// plain, already-encrypted `table.put()`, a pure IDB-request promise with no
// further await on anything else, which stays correctly scoped.
interface StagedEntry<T> {
  record: T | null // null = staged delete
  row: EncryptedRow | null // null = staged delete
}

// biome-ignore lint/suspicious/noExplicitAny: generic table wrapper requires any for flexible record types
export class EncryptedTable<T extends Record<string, any>> {
  private staged: Map<string, StagedEntry<T>> | null = null

  constructor(
    private table: Dexie.Table<EncryptedRow, string>,
    private keyField: keyof T & string,
  ) {}

  beginStaging(): void {
    this.staged = new Map()
  }

  /** Stops staging, returning replay actions to run inside a real transaction. */
  endStaging(): Array<() => Promise<unknown>> {
    const staged = this.staged
    this.staged = null
    if (!staged) return []
    return Array.from(staged.entries()).map(([id, entry]) => {
      if (entry.row) return () => this.table.put(entry.row as EncryptedRow)
      return () => this.table.delete(id)
    })
  }

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
    const row = await this.enc(record)
    if (this.staged) {
      this.staged.set(row._id, { record, row })
      return row._id
    }
    return this.table.add(row)
  }

  async put(record: T): Promise<string> {
    const row = await this.enc(record)
    if (this.staged) {
      this.staged.set(row._id, { record, row })
      return row._id
    }
    return this.table.put(row)
  }

  async bulkAdd(records: T[]): Promise<string> {
    const rows = await Promise.all(records.map((r) => this.enc(r)))
    if (this.staged) {
      rows.forEach((row, i) => {
        this.staged?.set(row._id, { record: records[i] as T, row })
      })
      return rows[rows.length - 1]?._id as string
    }
    return this.table.bulkAdd(rows) as Promise<string>
  }

  async bulkPut(records: T[]): Promise<string> {
    const rows = await Promise.all(records.map((r) => this.enc(r)))
    if (this.staged) {
      rows.forEach((row, i) => {
        this.staged?.set(row._id, { record: records[i] as T, row })
      })
      return rows[rows.length - 1]?._id as string
    }
    return this.table.bulkPut(rows) as Promise<string>
  }

  async get(id: string): Promise<T | undefined> {
    if (this.staged?.has(id)) {
      return (this.staged.get(id) as StagedEntry<T>).record ?? undefined
    }
    const row = await this.table.get(id)
    if (!row) return undefined
    return this.dec(row)
  }

  async bulkGet(ids: string[]): Promise<(T | undefined)[]> {
    return Promise.all(ids.map((id) => this.get(id)))
  }

  async toArray(): Promise<T[]> {
    const rows = await this.table.toArray()
    const decrypted = await Promise.all(rows.map((r) => this.dec(r)))
    if (!this.staged) return decrypted
    const byId = new Map(decrypted.map((r) => [r[this.keyField] as string, r]))
    for (const [id, entry] of this.staged) {
      if (entry.record) byId.set(id, entry.record)
      else byId.delete(id)
    }
    return Array.from(byId.values())
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
    if (this.staged) return (await this.toArray()).length
    return this.table.count()
  }

  async delete(id: string): Promise<void> {
    if (this.staged) {
      this.staged.set(id, { record: null, row: null })
      return
    }
    await this.table.delete(id)
  }

  /**
   * Tests whether a specific key (not necessarily the currently active one)
   * can decrypt one existing row, without going through the global key
   * store. Only used for PIN-change crash recovery — a pinCheck match alone
   * doesn't prove a key can decrypt real data, since pinCheck is an
   * independent ciphertext. Returns null if the table is empty (inconclusive).
   */
  async canDecryptWithKey(key: CryptoKey): Promise<boolean | null> {
    const rows = await this.table.limit(1).toArray()
    const row = rows[0]
    if (!row) return null
    try {
      await decryptRecord(row._data, key)
      return true
    } catch {
      return false
    }
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

  private encryptedTables(): Array<EncryptedTable<Record<string, unknown>>> {
    return [
      this.users,
      this.groups,
      this.members,
      this.invites,
      this.categories,
      this.transactions,
      this.recurrences,
      this.attachments,
      this.budgets,
      this.goals,
      this.syncEvents,
      this.conflicts,
      this.accounts,
      // biome-ignore lint/suspicious/noExplicitAny: EncryptedTable<T> for varying T, deliberately erased here
    ] as any
  }

  /**
   * Wraps a multi-table write sequence so a thrown error partway through
   * rolls back everything, not just some of it. See the comment above
   * EncryptedTable for why this can't be a plain `db.transaction()` — every
   * encrypted read/write is async over Web Crypto, which a real IndexedDB
   * transaction cannot stay open across. Phase 1 runs `fn` with every
   * EncryptedTable staging its writes (still visible to reads within `fn`
   * itself); phase 2 replays the staged writes inside one real transaction.
   * Only covers EncryptedTable writes — `keystoreTable` (unencrypted) isn't
   * staged, so don't write to it from inside an atomic block.
   */
  async atomically<T>(fn: () => Promise<T>): Promise<T> {
    const tables = this.encryptedTables()
    for (const t of tables) t.beginStaging()

    let result: T
    try {
      result = await fn()
    } catch (e) {
      for (const t of tables) t.endStaging() // discard staged writes
      throw e
    }

    const replays = tables.flatMap((t) => t.endStaging())
    await this.transaction('rw', this.tables, async () => {
      for (const replay of replays) await replay()
    })
    return result
  }

  /**
   * Tests a candidate key against real data (not just a pinCheck ciphertext)
   * by trying to decrypt one row from the first non-empty table. Used only
   * for PIN-change crash recovery, where pinCheck matching a PIN doesn't
   * prove that PIN's key can actually decrypt the data tables. Returns null
   * if every table is empty (fresh install — nothing to verify against).
   */
  async testKeyAgainstAnyData(key: CryptoKey): Promise<boolean | null> {
    for (const t of this.encryptedTables()) {
      const result = await t.canDecryptWithKey(key)
      if (result !== null) return result
    }
    return null
  }
}

export const db = new ShillakDB()
