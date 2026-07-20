import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { encryptRecord } from '@/crypto/encrypt'
import { deriveKey } from '@/crypto/pin'
import type { Transaction } from '@/db/schema'
import useKeyStore from '@/stores/key.store'

const DB_NAME = 'Shillak_migration_test_db'

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-1',
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'expense',
    amount: 42500,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'pre-migration transaction',
    tags: [],
    date: Date.UTC(2025, 5, 1),
    attachmentIds: [],
    recurrenceId: null,
    accountId: null,
    paidBy: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

describe('schema migration v1 -> v2', () => {
  it('preserves existing v1 data untouched and adds the v2 accounts table', async () => {
    const key = await deriveKey('0000', new Uint8Array(16))
    useKeyStore.getState().setKey(key)

    const txn = makeTxn()
    const encrypted = await encryptRecord(txn, key)

    // Simulate a device that only ever ran the v1 schema (no _accounts table).
    const v1db = new Dexie(DB_NAME)
    v1db.version(1).stores({
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
    await v1db.open()
    await v1db.table('_transactions').put({ _id: txn.txnId, _data: encrypted })
    await v1db.table('keystoreTable').put({
      id: 1,
      salt: 'salt',
      pinCheck: 'pinCheck',
      pinChangeInProgress: false,
    })
    v1db.close()

    // Now open with the real v1+v2 schema definitions, against the same
    // underlying database — this is the exact upgrade path a real device
    // goes through when the app ships a new table.
    const v2db = new Dexie(DB_NAME)
    v2db.version(1).stores({
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
    v2db.version(2).stores({ _accounts: '_id' })
    await v2db.open()

    // Pre-existing v1 data survived the upgrade, byte-for-byte.
    const migratedRow = await v2db.table('_transactions').get(txn.txnId)
    expect(migratedRow).toEqual({ _id: txn.txnId, _data: encrypted })

    // ...and is still decryptable with the same key post-migration.
    const { decryptRecord } = await import('@/crypto/encrypt')
    const decrypted = await decryptRecord<Transaction>(migratedRow._data, key)
    expect(decrypted).toEqual(txn)

    // The new v2 table exists and is immediately usable.
    await v2db.table('_accounts').put({ _id: 'acc-1', _data: 'anything' })
    expect(await v2db.table('_accounts').get('acc-1')).toEqual({
      _id: 'acc-1',
      _data: 'anything',
    })

    v2db.close()
    await Dexie.delete(DB_NAME)
  })
})
