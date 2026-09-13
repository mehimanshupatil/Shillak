import { useCallback, useRef, useState } from 'react'
import { db } from '@/db/db'
import type { Scan } from '@/sync/classifyScan'
import { applyDelta } from '@/sync/conflict'
import { encodeClockQR } from '@/sync/qr'
import type { QrReceiverCommand, QrReceiverEvent, QrReceiverState } from '@/sync/session/qrReceiver'
import { initialQrReceiverState, qrReceiverReducer } from '@/sync/session/qrReceiver'
import { getSyncErrorMessage } from '@/sync/syncErrors'
import { decryptPayload, deriveTransportKey } from '@/sync/transport'
import type { SyncDelta } from '@/sync/vector-clock'
import { computeSince } from '@/sync/vector-clock'

interface Options {
  groupId: string | null
  currentUserId: string | null
  groupSecret: string | undefined
}

export interface QrReceiver {
  state: QrReceiverState
  start: () => void
  beginScanning: () => void
  scanned: (scan: Scan) => void
  reset: () => void
}

/**
 * Drives the QR-receiver machine: performs the commands it asks for and feeds
 * the results back as events. All the decisions live in the reducer; this holds
 * only the I/O and React's copy of the state.
 *
 * State is mirrored in a ref so a burst of scans can't read a stale value — the
 * camera fires faster than React re-renders.
 */
export function useQrReceiver({ groupId, currentUserId, groupSecret }: Options): QrReceiver {
  const [state, setState] = useState<QrReceiverState>(initialQrReceiverState)
  const stateRef = useRef(state)
  // A command's result comes back as an event, so the effect runner needs to
  // reach dispatch — which is defined below it. The ref breaks the cycle
  // without pretending the two don't depend on each other.
  const dispatchRef = useRef<(event: QrReceiverEvent) => void>(() => {})

  const perform = useCallback(
    async (command: QrReceiverCommand) => {
      try {
        if (command.run === 'build-clock') {
          if (!groupId) throw new Error('No active space')
          const group = await db.groups.get(groupId)
          if (!group) throw new Error('Group not found')
          const since = await computeSince(groupId)
          dispatchRef.current({
            type: 'clock-ready',
            clockQR: encodeClockQR(groupId, group.vectorClock, since),
          })
          return
        }

        if (!groupId || !currentUserId || !groupSecret) throw new Error('No active space')
        const transportKey = await deriveTransportKey(groupSecret)
        const delta = await decryptPayload<SyncDelta>(command.payload, transportKey)
        const result = await applyDelta(delta, groupId, crypto.randomUUID(), 'qr', currentUserId)
        dispatchRef.current({
          type: 'payload-applied',
          applied: result.recordsApplied,
          conflicts: result.conflictsFound,
        })
      } catch (e) {
        dispatchRef.current({ type: 'failed', message: getSyncErrorMessage(e) })
      }
    },
    [groupId, currentUserId, groupSecret],
  )

  const dispatch = useCallback(
    (event: QrReceiverEvent) => {
      const [next, commands] = qrReceiverReducer(stateRef.current, event)
      stateRef.current = next
      setState(next)
      for (const command of commands) void perform(command)
    },
    [perform],
  )
  dispatchRef.current = dispatch

  return {
    state,
    start: useCallback(() => dispatch({ type: 'start' }), [dispatch]),
    beginScanning: useCallback(() => dispatch({ type: 'begin-scanning' }), [dispatch]),
    scanned: useCallback((scan: Scan) => dispatch({ type: 'scanned', scan }), [dispatch]),
    reset: useCallback(() => dispatch({ type: 'reset' }), [dispatch]),
  }
}
