import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group, GroupMember, User } from '@/db/schema'
import { generateInvite, isInvite, joinGroupFromInvite, parseAndVerifyInvite } from '../invite'

let groups: Group[] = []
let members: GroupMember[] = []
let users: User[] = []

const mockDb = vi.hoisted(() => ({
  groups: { get: vi.fn(), put: vi.fn() },
  members: { where: vi.fn(), put: vi.fn() },
  users: { get: vi.fn() },
}))

vi.mock('@/db/db', () => ({ db: mockDb }))

function b64Secret(byte = 1): string {
  const raw = new Uint8Array(32).fill(byte)
  let bin = ''
  for (const b of raw) bin += String.fromCharCode(b)
  return btoa(bin)
}

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
    groupSecret: b64Secret(),
    vectorClock: { u1: 1 },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  groups = []
  members = []
  users = [
    {
      userId: 'u1',
      displayName: 'Alice',
      avatarColor: '#000',
      identityBackupHint: '',
      createdAt: 0,
    },
  ]
  vi.clearAllMocks()
  mockDb.groups.get.mockImplementation((id: string) =>
    Promise.resolve(groups.find((g) => g.groupId === id)),
  )
  mockDb.groups.put.mockImplementation((g: Group) => {
    groups.push(g)
    return Promise.resolve(g.groupId)
  })
  mockDb.members.where.mockImplementation((pred: (m: GroupMember) => boolean) =>
    Promise.resolve(members.filter(pred)),
  )
  mockDb.members.put.mockImplementation((m: GroupMember) => {
    members.push(m)
    return Promise.resolve(m.id)
  })
  mockDb.users.get.mockImplementation((id: string) =>
    Promise.resolve(users.find((u) => u.userId === id)),
  )
})

describe('generateInvite / parseAndVerifyInvite', () => {
  it('round-trips a generated invite through verification', async () => {
    groups.push(makeGroup())
    const qrData = await generateInvite('g1', 'u1')
    const parsed = await parseAndVerifyInvite(qrData)
    expect(parsed.groupId).toBe('g1')
    expect(parsed.createdByName).toBe('Alice')
  })

  it('rejects a payload whose signature no longer matches after tampering', async () => {
    groups.push(makeGroup())
    const qrData = await generateInvite('g1', 'u1')
    const tampered = JSON.parse(qrData)
    tampered.groupName = 'Evil Household'
    await expect(parseAndVerifyInvite(JSON.stringify(tampered))).rejects.toThrow(
      'Invite signature invalid',
    )
  })

  it('rejects an expired invite (even with a valid signature over the expired payload)', async () => {
    groups.push(makeGroup())
    const qrData = await generateInvite('g1', 'u1')
    const { sig, ...rest } = JSON.parse(qrData)
    void sig
    rest.expiresAt = Date.now() - 1000
    const resigned = { ...rest, sig: await signCanonical(rest) }
    await expect(parseAndVerifyInvite(JSON.stringify(resigned))).rejects.toThrow(
      'Invite has expired',
    )
  })

  it('rejects a payload missing required fields', async () => {
    await expect(parseAndVerifyInvite(JSON.stringify({ v: 1 }))).rejects.toThrow(
      'missing required fields',
    )
  })

  it('rejects non-JSON input', async () => {
    await expect(parseAndVerifyInvite('not json')).rejects.toThrow('Not a valid invite QR')
  })

  it('rejects an unsupported invite version', async () => {
    groups.push(makeGroup())
    const qrData = await generateInvite('g1', 'u1')
    const parsed = JSON.parse(qrData)
    parsed.v = 2
    await expect(parseAndVerifyInvite(JSON.stringify(parsed))).rejects.toThrow(
      'Unsupported invite version',
    )
  })
})

// Mirrors invite.ts's private canonicalString + HMAC sign — lets a test
// produce a validly-signed payload with fields the module itself wouldn't
// normally let you set together (e.g. an already-past expiresAt), so the
// expiry check can be tested in isolation from the signature check.
async function signCanonical(p: Record<string, unknown>): Promise<string> {
  const canonical = [
    p.v,
    p.inviteId,
    p.groupId,
    p.groupName,
    p.groupColor,
    p.currency,
    p.createdByName,
    p.memberCount,
    p.groupSecret,
    p.expiresAt,
  ].join('|')
  const keyBytes = Uint8Array.from(atob(p.groupSecret as string), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical))
  const sigBytes = new Uint8Array(buf)
  let bin = ''
  for (const b of sigBytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

describe('isInvite', () => {
  it('recognizes a well-formed invite payload', async () => {
    groups.push(makeGroup())
    const qrData = await generateInvite('g1', 'u1')
    expect(isInvite(qrData)).toBe(true)
  })

  it('rejects non-invite JSON and garbage', () => {
    expect(isInvite(JSON.stringify({ v: 1, foo: 'bar' }))).toBe(false)
    expect(isInvite('not json')).toBe(false)
  })
})

describe('joinGroupFromInvite', () => {
  it('creates a new group and member when neither exists locally', async () => {
    const invite = {
      v: 1 as const,
      inviteId: 'inv-1',
      groupId: 'g-new',
      groupName: 'New Household',
      groupColor: '#111',
      currency: 'INR',
      createdByName: 'Bob',
      memberCount: 1,
      groupSecret: b64Secret(),
      expiresAt: Date.now() + 1000,
      sig: 'irrelevant-here',
    }
    await joinGroupFromInvite(invite, 'u2')
    expect(groups.find((g) => g.groupId === 'g-new')).toBeDefined()
    expect(members.find((m) => m.groupId === 'g-new' && m.userId === 'u2')).toBeDefined()
  })

  it('does not overwrite an existing local group', async () => {
    groups.push(makeGroup({ groupId: 'g1', name: 'Original Name' }))
    const invite = {
      v: 1 as const,
      inviteId: 'inv-1',
      groupId: 'g1',
      groupName: 'Renamed By Invite',
      groupColor: '#111',
      currency: 'INR',
      createdByName: 'Bob',
      memberCount: 1,
      groupSecret: b64Secret(),
      expiresAt: Date.now() + 1000,
      sig: 'irrelevant-here',
    }
    await joinGroupFromInvite(invite, 'u2')
    expect(groups.filter((g) => g.groupId === 'g1')).toHaveLength(1)
    expect(mockDb.groups.put).not.toHaveBeenCalled()
  })

  it('does not create a duplicate member if the user already joined', async () => {
    groups.push(makeGroup({ groupId: 'g1' }))
    members.push({
      id: 'm1',
      groupId: 'g1',
      userId: 'u2',
      role: 'member',
      status: 'active',
      joinedAt: 0,
      leftAt: null,
      nickname: null,
      monthlyIncome: null,
      incomeCurrency: null,
      updatedAt: 0,
    })
    const invite = {
      v: 1 as const,
      inviteId: 'inv-1',
      groupId: 'g1',
      groupName: 'Home',
      groupColor: '#111',
      currency: 'INR',
      createdByName: 'Bob',
      memberCount: 1,
      groupSecret: b64Secret(),
      expiresAt: Date.now() + 1000,
      sig: 'irrelevant-here',
    }
    await joinGroupFromInvite(invite, 'u2')
    expect(members.filter((m) => m.groupId === 'g1' && m.userId === 'u2')).toHaveLength(1)
    expect(mockDb.members.put).not.toHaveBeenCalled()
  })
})
