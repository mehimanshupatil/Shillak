import { db } from '@/db/db'
import { applyDelta } from '@/sync/conflict'
import type { Courier } from '@/sync/session/courier'
import { decryptPayload, deriveTransportKey, encryptPayload } from '@/sync/transport'
import type { SyncDelta } from '@/sync/vector-clock'
import { computeDelta, computeSince, countDeltaRecords } from '@/sync/vector-clock'

export interface SessionDeps {
  groupId: string
  userId: string
  groupSecret: string
}

export interface SessionResult {
  applied: number
  conflicts: number
  sent: number
}

/**
 * One bidirectional Sync session: swap clocks, swap Deltas, apply, acknowledge.
 *
 * Both sides run this same sequence — it is symmetric, so neither is the
 * client. It talks only to a Courier, which is what lets the whole handshake be
 * exercised over an in-memory pair with no WebRTC and no network.
 *
 * The caller owns the Courier's lifetime: this never closes it, so a caller can
 * report a failure before tearing down.
 */
export async function runSyncSession(
  courier: Courier,
  deps: SessionDeps,
  method: 'webrtc' | 'qr',
): Promise<SessionResult> {
  const { groupId, userId, groupSecret } = deps
  const transportKey = await deriveTransportKey(groupSecret)

  // 1. Announce what we already know.
  const ownState = await computeDelta(groupId, {}, userId)
  const ownSince = await computeSince(groupId)
  courier.send({ type: 'clock', clock: ownState.vectorClock, since: ownSince })

  // 2. Learn what they know.
  const clockMsg = await courier.receive()
  if (clockMsg.type !== 'clock') throw new Error(`Expected clock message, got: ${clockMsg.type}`)

  // 3. Send only what they're missing.
  const delta = await computeDelta(groupId, clockMsg.clock, userId, clockMsg.since)
  courier.send({ type: 'delta', payload: await encryptPayload(delta, transportKey) })

  // 4. Take what we're missing.
  const deltaMsg = await courier.receive()
  if (deltaMsg.type !== 'delta') throw new Error(`Expected delta message, got: ${deltaMsg.type}`)
  const theirDelta = await decryptPayload<SyncDelta>(deltaMsg.payload, transportKey)

  const syncId = crypto.randomUUID()
  const result = await applyDelta(theirDelta, groupId, syncId, method, userId)

  // 5. Agree we're both finished before anyone hangs up.
  courier.send({ type: 'done' })
  await courier.receive()

  // applyDelta logs the SyncEvent but only knows what arrived; what we sent is
  // ours to record.
  const sent = countDeltaRecords(delta)
  await db.syncEvents.update(syncId, { recordsSent: sent })

  return { applied: result.recordsApplied, conflicts: result.conflictsFound, sent }
}
