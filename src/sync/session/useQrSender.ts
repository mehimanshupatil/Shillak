import { useCallback, useRef, useState } from 'react'
import { db } from '@/db/db'
import type { Scan } from '@/sync/classifyScan'
import { chunkPayload, encodeChunk } from '@/sync/qr'
import type { QrSenderCommand, QrSenderEvent, QrSenderState } from '@/sync/session/qrSender'
import { initialQrSenderState, qrSenderReducer } from '@/sync/session/qrSender'
import { getSyncErrorMessage } from '@/sync/syncErrors'
import { deriveTransportKey, encryptPayload } from '@/sync/transport'
import { computeDelta, countDeltaRecords } from '@/sync/vector-clock'

interface Options {
  groupId: string | null
  currentUserId: string | null
  groupSecret: string | undefined
}

export interface QrSender {
  state: QrSenderState
  start: () => void
  scanned: (scan: Scan) => void
  showChunk: (index: number) => void
  reset: () => void
}

/**
 * Drives the QR-sender machine. The one thing here that isn't plumbing is the
 * SyncEvent: a QR send used to write none at all, because the logging lived in
 * the WiFi handler and this path never went through it — so QR sends were
 * invisible in History even though data left the device.
 *
 * It is logged as `partial`, which is the truth: the sender presented the
 * chunks and cannot know whether the other device finished scanning them.
 */
export function useQrSender({ groupId, currentUserId, groupSecret }: Options): QrSender {
  const [state, setState] = useState<QrSenderState>(initialQrSenderState)
  const stateRef = useRef(state)
  const dispatchRef = useRef<(event: QrSenderEvent) => void>(() => {})

  const perform = useCallback(
    async (command: QrSenderCommand) => {
      try {
        if (!groupId || !currentUserId || !groupSecret) throw new Error('No active space')

        const { clock, since, groupId: theirGroupId } = command.envelope
        if (theirGroupId !== groupId) {
          throw new Error('That code is for a different space')
        }

        const delta = await computeDelta(groupId, clock, currentUserId, since)
        const recordCount = countDeltaRecords(delta)
        if (recordCount === 0) {
          dispatchRef.current({ type: 'already-up-to-date' })
          return
        }

        const transportKey = await deriveTransportKey(groupSecret)
        const encrypted = await encryptPayload(delta, transportKey)
        const chunks = chunkPayload(encrypted).map(encodeChunk)

        await db.syncEvents.put({
          syncId: crypto.randomUUID(),
          groupId,
          initiatedBy: currentUserId,
          method: 'qr',
          syncedWith: '',
          recordsSent: recordCount,
          recordsReceived: 0,
          conflictsFound: 0,
          // A one-way handoff: the data was presented, not confirmed received.
          status: 'partial',
          syncedAt: Date.now(),
        })

        dispatchRef.current({ type: 'delta-ready', chunks, recordCount })
      } catch (e) {
        dispatchRef.current({ type: 'failed', message: getSyncErrorMessage(e) })
      }
    },
    [groupId, currentUserId, groupSecret],
  )

  const dispatch = useCallback(
    (event: QrSenderEvent) => {
      const [next, commands] = qrSenderReducer(stateRef.current, event)
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
    scanned: useCallback((scan: Scan) => dispatch({ type: 'scanned', scan }), [dispatch]),
    showChunk: useCallback((index: number) => dispatch({ type: 'show-chunk', index }), [dispatch]),
    reset: useCallback(() => dispatch({ type: 'reset' }), [dispatch]),
  }
}
