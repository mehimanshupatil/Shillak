import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import type { Group } from '@/db/schema'
import useKeyStore from '@/stores/key.store'
import { createKeystore, resolveUnlock } from '../keystore'

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupId: 'g1',
    name: 'Home',
    avatarColor: '#000',
    createdBy: 'u1',
    currency: 'INR',
    fiscalYearStart: 4,
    visibility: 'full',
    status: 'active',
    groupSecret: 'secret',
    vectorClock: { u1: 1 },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.open()
  await db.groups.delete('g1')
  useKeyStore.getState().clearKey()
})

describe('resolveUnlock — no PIN change in progress', () => {
  it('behaves like a normal unlock', async () => {
    const { salt, pinCheck } = await createKeystore('1234')
    const result = await resolveUnlock('1234', {
      id: 1,
      salt,
      pinCheck,
      pinChangeInProgress: false,
    })
    expect(result.key).toBeDefined()
    expect(result.resolvedPinChange).toBeUndefined()
  })

  it('throws on a wrong PIN', async () => {
    const { salt, pinCheck } = await createKeystore('1234')
    await expect(
      resolveUnlock('0000', { id: 1, salt, pinCheck, pinChangeInProgress: false }),
    ).rejects.toThrow()
  })
})

describe('resolveUnlock — interrupted PIN change, re-encryption never happened', () => {
  it('entering the OLD pin aborts the change and unlocks normally', async () => {
    const { key: oldKey, salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    useKeyStore.getState().setKey(oldKey)
    await db.groups.put(makeGroup()) // real data, still under the old key

    const { pinCheck: pendingPinCheck, salt: pendingSalt } = await createKeystore('2222')

    const result = await resolveUnlock('1111', {
      id: 1,
      salt: oldSalt,
      pinCheck: oldPinCheck,
      pinChangeInProgress: true,
      pendingSalt,
      pendingPinCheck,
    })

    expect(result.resolvedPinChange).toBe('aborted')
    const ks = await db.keystoreTable.get(1)
    expect(ks?.pinChangeInProgress).toBe(false)
    expect(ks?.pendingSalt).toBeNull()
  })

  it('entering the NEW pin is rejected with a hint to use the old one', async () => {
    const { key: oldKey, salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    useKeyStore.getState().setKey(oldKey)
    await db.groups.put(makeGroup()) // still under the old key

    const { pinCheck: pendingPinCheck, salt: pendingSalt } = await createKeystore('2222')

    await expect(
      resolveUnlock('2222', {
        id: 1,
        salt: oldSalt,
        pinCheck: oldPinCheck,
        pinChangeInProgress: true,
        pendingSalt,
        pendingPinCheck,
      }),
    ).rejects.toThrow('enter your OLD PIN instead')
  })
})

describe('resolveUnlock — interrupted PIN change, re-encryption completed before the crash', () => {
  it('entering the NEW pin finishes the change and unlocks', async () => {
    const { key: oldKey, salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    useKeyStore.getState().setKey(oldKey)
    await db.groups.put(makeGroup())

    const {
      key: newKey,
      salt: pendingSalt,
      pinCheck: pendingPinCheck,
    } = await createKeystore('2222')
    // Simulate re-encryption having completed: data is now under the new key.
    useKeyStore.getState().setKey(newKey)
    await db.groups.put(makeGroup())

    const result = await resolveUnlock('2222', {
      id: 1,
      salt: oldSalt,
      pinCheck: oldPinCheck,
      pinChangeInProgress: true,
      pendingSalt,
      pendingPinCheck,
    })

    expect(result.resolvedPinChange).toBe('completed')
    const ks = await db.keystoreTable.get(1)
    expect(ks?.salt).toBe(pendingSalt)
    expect(ks?.pinCheck).toBe(pendingPinCheck)
    expect(ks?.pinChangeInProgress).toBe(false)
  })

  it('entering the OLD pin is rejected with a hint to use the new one', async () => {
    const { salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    const {
      key: newKey,
      salt: pendingSalt,
      pinCheck: pendingPinCheck,
    } = await createKeystore('2222')
    useKeyStore.getState().setKey(newKey)
    await db.groups.put(makeGroup()) // data is under the new key

    await expect(
      resolveUnlock('1111', {
        id: 1,
        salt: oldSalt,
        pinCheck: oldPinCheck,
        pinChangeInProgress: true,
        pendingSalt,
        pendingPinCheck,
      }),
    ).rejects.toThrow('enter your NEW PIN instead')
  })
})

describe('resolveUnlock — edge cases', () => {
  it('rejects a PIN matching neither the old nor the pending keystore', async () => {
    const { salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    const { salt: pendingSalt, pinCheck: pendingPinCheck } = await createKeystore('2222')

    await expect(
      resolveUnlock('9999', {
        id: 1,
        salt: oldSalt,
        pinCheck: oldPinCheck,
        pinChangeInProgress: true,
        pendingSalt,
        pendingPinCheck,
      }),
    ).rejects.toThrow('Wrong PIN')
  })

  it('trusts the candidate when there is no data yet to verify against (fresh install)', async () => {
    const { salt: oldSalt, pinCheck: oldPinCheck } = await createKeystore('1111')
    const { salt: pendingSalt, pinCheck: pendingPinCheck } = await createKeystore('2222')
    // No db.groups.put — every table empty, testKeyAgainstAnyData returns null

    const result = await resolveUnlock('2222', {
      id: 1,
      salt: oldSalt,
      pinCheck: oldPinCheck,
      pinChangeInProgress: true,
      pendingSalt,
      pendingPinCheck,
    })

    expect(result.resolvedPinChange).toBe('completed')
  })
})
