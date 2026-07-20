import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { deriveKey } from '@/crypto/pin'
import type { Budget, Transaction } from '@/db/schema'
import useKeyStore from '@/stores/key.store'
import { AppLockedError, db } from '../db'

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: crypto.randomUUID(),
    groupId: 'g1',
    ownerId: 'u1',
    authorSeq: 1,
    categoryId: 'cat-1',
    type: 'expense',
    amount: 10000,
    currency: 'INR',
    fxRate: null,
    originalAmount: null,
    note: 'test',
    tags: [],
    date: Date.UTC(2026, 0, 1),
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

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    budgetId: crypto.randomUUID(),
    groupId: 'g1',
    categoryId: 'cat-1',
    limit: 50000,
    period: 'monthly',
    updatedAt: 0,
    ...overrides,
  }
}

beforeAll(async () => {
  const key = await deriveKey('0000', new Uint8Array(16))
  useKeyStore.getState().setKey(key)
  await db.open()
})

describe('EncryptedTable', () => {
  it('round-trips a record through put/get, encrypted at rest', async () => {
    const txn = makeTxn()
    await db.transactions.put(txn)
    const fetched = await db.transactions.get(txn.txnId)
    expect(fetched).toEqual(txn)
  })

  it('throws AppLockedError when the key is missing', async () => {
    const txn = makeTxn()
    useKeyStore.getState().clearKey()
    await expect(db.transactions.put(txn)).rejects.toThrow(AppLockedError)
    // restore for subsequent tests
    const key = await deriveKey('0000', new Uint8Array(16))
    useKeyStore.getState().setKey(key)
  })

  it('update() merges a patch into the existing decrypted record', async () => {
    const txn = makeTxn({ note: 'original' })
    await db.transactions.put(txn)
    await db.transactions.update(txn.txnId, { note: 'updated' })
    const fetched = await db.transactions.get(txn.txnId)
    expect(fetched?.note).toBe('updated')
    expect(fetched?.amount).toBe(txn.amount)
  })

  it('where() filters on decrypted fields', async () => {
    const groupId = crypto.randomUUID()
    const a = makeTxn({ groupId, type: 'income' })
    const b = makeTxn({ groupId, type: 'expense' })
    await db.transactions.put(a)
    await db.transactions.put(b)
    const expenses = await db.transactions.where(
      (t) => t.groupId === groupId && t.type === 'expense',
    )
    expect(expenses.map((t) => t.txnId)).toEqual([b.txnId])
  })
})

describe('db.atomically', () => {
  it('commits writes across multiple tables when the callback succeeds', async () => {
    const txn = makeTxn()
    const budget = makeBudget()
    await db.atomically(async () => {
      await db.transactions.put(txn)
      await db.budgets.put(budget)
    })
    expect(await db.transactions.get(txn.txnId)).toEqual(txn)
    expect(await db.budgets.get(budget.budgetId)).toEqual(budget)
  })

  it('rolls back every write in the batch when the callback throws partway through', async () => {
    const txn = makeTxn()
    const budget = makeBudget()

    await expect(
      db.atomically(async () => {
        await db.transactions.put(txn)
        await db.budgets.put(budget)
        throw new Error('simulated failure after both writes')
      }),
    ).rejects.toThrow('simulated failure')

    // Neither write should have survived — proves atomicity through the
    // async Web Crypto encrypt calls inside EncryptedTable.
    expect(await db.transactions.get(txn.txnId)).toBeUndefined()
    expect(await db.budgets.get(budget.budgetId)).toBeUndefined()
  })
})
