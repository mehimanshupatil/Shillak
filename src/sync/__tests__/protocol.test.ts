import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncDelta } from '@/sync/vector-clock'

const mockDb = vi.hoisted(() => ({ syncEvents: { update: vi.fn() } }))
vi.mock('@/db/db', () => ({ db: mockDb }))
vi.mock('@/sync/conflict', () => ({ applyDelta: vi.fn() }))
vi.mock('@/sync/vector-clock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sync/vector-clock')>()
  return { ...actual, computeDelta: vi.fn(), computeSince: vi.fn() }
})
vi.mock('@/sync/transport', () => ({
  deriveTransportKey: vi.fn(async () => 'key' as unknown as CryptoKey),
  // Round-trip through JSON so the pair really exchanges a payload, without crypto.
  encryptPayload: vi.fn(async (d: unknown) => JSON.stringify(d)),
  decryptPayload: vi.fn(async (p: string) => JSON.parse(p)),
}))

import { applyDelta } from '@/sync/conflict'
import { memoryCourierPair } from '@/sync/session/courier'
import { runSyncSession } from '@/sync/session/protocol'
import { computeDelta, computeSince } from '@/sync/vector-clock'

function deltaFrom(userId: string, clock: Record<string, number>): SyncDelta {
  return {
    fromUserId: userId,
    vectorClock: clock,
    transactions: [],
    categories: [],
    members: [],
    users: [],
    budgets: [],
    goals: [],
    recurrences: [],
    accounts: [],
  }
}

const ALICE = { groupId: 'g1', userId: 'alice', groupSecret: 'secret' }
const BOB = { groupId: 'g1', userId: 'bob', groupSecret: 'secret' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(computeSince).mockResolvedValue(0)
  vi.mocked(computeDelta).mockImplementation(async (_g, _clock, userId) =>
    deltaFrom(userId, { [userId]: 1 }),
  )
  vi.mocked(applyDelta).mockResolvedValue({
    recordsApplied: 0,
    conflictsFound: 0,
  } as unknown as Awaited<ReturnType<typeof applyDelta>>)
  mockDb.syncEvents.update.mockResolvedValue(undefined)
})

describe('runSyncSession over a courier pair', () => {
  it('completes on both sides — the sequence is symmetric', async () => {
    const [a, b] = memoryCourierPair()
    const [ra, rb] = await Promise.all([
      runSyncSession(a, ALICE, 'webrtc'),
      runSyncSession(b, BOB, 'webrtc'),
    ])
    expect(ra.applied).toBe(0)
    expect(rb.applied).toBe(0)
    expect(applyDelta).toHaveBeenCalledTimes(2)
  })

  it('each side applies the Delta the other one sent', async () => {
    const [a, b] = memoryCourierPair()
    await Promise.all([runSyncSession(a, ALICE, 'webrtc'), runSyncSession(b, BOB, 'webrtc')])

    const appliedBy = vi.mocked(applyDelta).mock.calls.map((c) => [c[0].fromUserId, c[4]])
    expect(appliedBy).toContainEqual(['bob', 'alice'])
    expect(appliedBy).toContainEqual(['alice', 'bob'])
  })

  it('computes the second Delta against the clock the peer announced', async () => {
    const [a, b] = memoryCourierPair()
    await Promise.all([runSyncSession(a, ALICE, 'webrtc'), runSyncSession(b, BOB, 'webrtc')])

    const clocksUsed = vi.mocked(computeDelta).mock.calls.map((c) => c[1])
    expect(clocksUsed).toContainEqual({ bob: 1 })
    expect(clocksUsed).toContainEqual({ alice: 1 })
  })

  it('records what it sent, which applyDelta cannot know', async () => {
    const [a, b] = memoryCourierPair()
    await Promise.all([runSyncSession(a, ALICE, 'webrtc'), runSyncSession(b, BOB, 'webrtc')])
    expect(mockDb.syncEvents.update).toHaveBeenCalledTimes(2)
    expect(mockDb.syncEvents.update.mock.calls[0]?.[1]).toEqual({ recordsSent: 0 })
  })

  it('refuses a peer that opens with the wrong message', async () => {
    const [a, b] = memoryCourierPair()
    const session = runSyncSession(a, ALICE, 'webrtc')
    await b.receive()
    b.send({ type: 'done' })
    await expect(session).rejects.toThrow(/Expected clock message/)
  })

  it('refuses a peer that answers a clock with something other than a Delta', async () => {
    const [a, b] = memoryCourierPair()
    const session = runSyncSession(a, ALICE, 'webrtc')
    await b.receive()
    b.send({ type: 'clock', clock: { bob: 1 } })
    await b.receive()
    b.send({ type: 'ack' })
    await expect(session).rejects.toThrow(/Expected delta message/)
  })

  it('never closes the courier — the caller owns its lifetime', async () => {
    const [a, b] = memoryCourierPair()
    const closeSpy = vi.spyOn(a, 'close')
    await Promise.all([runSyncSession(a, ALICE, 'webrtc'), runSyncSession(b, BOB, 'webrtc')])
    expect(closeSpy).not.toHaveBeenCalled()
  })

  it('does not write a sent-count when it failed before applying', async () => {
    const [a, b] = memoryCourierPair()
    const session = runSyncSession(a, ALICE, 'webrtc')
    await b.receive()
    b.send({ type: 'done' })
    await expect(session).rejects.toThrow()
    expect(mockDb.syncEvents.update).not.toHaveBeenCalled()
  })
})

describe('memoryCourierPair', () => {
  it('delivers a message sent before the other side asked for it', async () => {
    const [a, b] = memoryCourierPair()
    a.send({ type: 'done' })
    await expect(b.receive()).resolves.toEqual({ type: 'done' })
  })

  it('delivers a message to a side already waiting', async () => {
    const [a, b] = memoryCourierPair()
    const pending = b.receive()
    a.send({ type: 'ack' })
    await expect(pending).resolves.toEqual({ type: 'ack' })
  })

  it('keeps messages in order', async () => {
    const [a, b] = memoryCourierPair()
    a.send({ type: 'clock', clock: {} })
    a.send({ type: 'done' })
    expect((await b.receive()).type).toBe('clock')
    expect((await b.receive()).type).toBe('done')
  })

  it('refuses to send once closed', async () => {
    const [a] = memoryCourierPair()
    a.close()
    expect(() => a.send({ type: 'done' })).toThrow(/closed/)
  })
})
