import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeystoreRecord, User } from '@/db/schema'
import { exportIdentityBackup, importIdentityBackup } from '../identity'

let users: User[] = []
let keystore: KeystoreRecord | undefined

const mockDb = vi.hoisted(() => ({
  users: { get: vi.fn(), put: vi.fn() },
  keystoreTable: { get: vi.fn(), put: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'u1',
    displayName: 'Alice',
    avatarColor: '#000',
    identityBackupHint: '',
    createdAt: 0,
    ...overrides,
  }
}

function makeKeystore(overrides: Partial<KeystoreRecord> = {}): KeystoreRecord {
  return {
    id: 1,
    salt: 'salt-b64',
    pinCheck: 'pincheck-b64',
    pinChangeInProgress: false,
    userId: 'u1',
    ...overrides,
  }
}

function makeBackupFile(backup: Record<string, unknown>): File {
  return new File([JSON.stringify(backup)], 'identity.shillak-id', { type: 'application/json' })
}

beforeEach(() => {
  users = []
  keystore = undefined
  vi.clearAllMocks()
  mockDb.users.get.mockImplementation((id: string) =>
    Promise.resolve(users.find((u) => u.userId === id)),
  )
  mockDb.users.put.mockImplementation((u: User) => {
    users.push(u)
    return Promise.resolve(u.userId)
  })
  mockDb.keystoreTable.get.mockImplementation(() => Promise.resolve(keystore))
  mockDb.keystoreTable.put.mockImplementation((k: KeystoreRecord) => {
    keystore = k
    return Promise.resolve(k.id)
  })
})

describe('exportIdentityBackup', () => {
  it('throws when the user does not exist', async () => {
    keystore = makeKeystore()
    await expect(exportIdentityBackup('missing-user')).rejects.toThrow('User or keystore not found')
  })

  it('throws when the keystore does not exist', async () => {
    users.push(makeUser())
    keystore = undefined
    await expect(exportIdentityBackup('u1')).rejects.toThrow('User or keystore not found')
  })
})

describe('importIdentityBackup', () => {
  it('restores the keystore (salt/pinCheck) and a user record from a valid backup', async () => {
    const file = makeBackupFile({
      version: 1,
      userId: 'u2',
      displayName: 'Bob',
      avatarColor: '#111',
      salt: 'restored-salt',
      pinCheck: 'restored-pincheck',
      exportedAt: 12345,
    })

    const result = await importIdentityBackup(file)

    expect(result.requiresPin).toBe(true)
    expect(result.user.userId).toBe('u2')
    expect(keystore?.salt).toBe('restored-salt')
    expect(keystore?.pinCheck).toBe('restored-pincheck')
    expect(keystore?.pinChangeInProgress).toBe(false)
    expect(users.find((u) => u.userId === 'u2')).toBeDefined()
  })

  it('rejects an unsupported backup version', async () => {
    const file = makeBackupFile({ version: 2, userId: 'u2', salt: 's', pinCheck: 'p' })
    await expect(importIdentityBackup(file)).rejects.toThrow('Unsupported backup version')
  })

  it('rejects a backup missing required fields', async () => {
    const file = makeBackupFile({ version: 1 })
    await expect(importIdentityBackup(file)).rejects.toThrow(
      'Invalid backup file — missing required fields',
    )
  })

  it('does not restore any group/transaction data — identity only', async () => {
    const file = makeBackupFile({
      version: 1,
      userId: 'u2',
      displayName: 'Bob',
      avatarColor: '#111',
      salt: 'restored-salt',
      pinCheck: 'restored-pincheck',
      exportedAt: 12345,
    })
    await importIdentityBackup(file)
    // Only users + keystoreTable are touched — no groups/transactions/etc mock exists,
    // and none of the calls above reference them.
    expect(mockDb.users.put).toHaveBeenCalledTimes(1)
    expect(mockDb.keystoreTable.put).toHaveBeenCalledTimes(1)
  })
})
