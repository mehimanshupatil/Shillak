import { useCallback, useEffect, useRef, useState } from 'react'
import type { Scan } from '@/sync/classifyScan'
import type { Courier } from '@/sync/session/courier'
import { webrtcCourier } from '@/sync/session/courier'
import { runSyncSession } from '@/sync/session/protocol'
import type { WifiCommand, WifiEvent, WifiState } from '@/sync/session/wifi'
import { initialWifiState, wifiReducer } from '@/sync/session/wifi'
import { getSyncErrorMessage } from '@/sync/syncErrors'
import { applyAnswer, createAnswer, createOffer } from '@/sync/webrtc'

interface Options {
  groupId: string | null
  currentUserId: string | null
  groupSecret: string | undefined
}

export interface WifiSession {
  state: WifiState
  offer: () => void
  readyForAnswer: () => void
  scanOffer: () => void
  scanned: (scan: Scan) => void
  reset: () => void
}

/**
 * Drives the WiFi machine. Holds the two things a pure reducer can't: the live
 * connection, and the session running over it.
 *
 * The connection is released on every path out — failure, abandonment, unmount.
 * Nothing released it before, so cancelling mid-offer or closing the drawer left
 * a peer connection and its ICE timers running.
 */
export function useWifiSession({ groupId, currentUserId, groupSecret }: Options): WifiSession {
  const [state, setState] = useState<WifiState>(initialWifiState)
  const stateRef = useRef(state)
  const dispatchRef = useRef<(event: WifiEvent) => void>(() => {})
  const courierRef = useRef<Courier | null>(null)
  const connectionRef = useRef<RTCPeerConnection | null>(null)

  const release = useCallback(() => {
    courierRef.current?.close()
    courierRef.current = null
    // A connection opened but never handed to a courier still needs closing.
    try {
      connectionRef.current?.close()
    } catch {
      /* already closed */
    }
    connectionRef.current = null
  }, [])

  const sync = useCallback(
    async (channel: RTCDataChannel, connection: RTCPeerConnection) => {
      if (!groupId || !currentUserId || !groupSecret) {
        throw new Error('Space not ready — wait a moment and try again.')
      }
      const courier = webrtcCourier(channel, connection)
      courierRef.current = courier
      const result = await runSyncSession(
        courier,
        { groupId, userId: currentUserId, groupSecret },
        'webrtc',
      )
      dispatchRef.current({
        type: 'completed',
        applied: result.applied,
        conflicts: result.conflicts,
      })
      release()
    },
    [groupId, currentUserId, groupSecret, release],
  )

  const perform = useCallback(
    async (command: WifiCommand) => {
      try {
        switch (command.run) {
          case 'close':
            release()
            return

          case 'create-offer': {
            const session = await createOffer()
            connectionRef.current = session.connection
            dispatchRef.current({ type: 'offer-ready', session })
            return
          }

          case 'complete-offer': {
            const channel = await applyAnswer(command.session, command.answer)
            await sync(channel, command.session.connection)
            return
          }

          case 'accept-offer': {
            const session = await createAnswer(command.offer)
            connectionRef.current = session.connection
            dispatchRef.current({ type: 'answer-ready', encodedAnswer: session.encodedSDP })
            const channel = await session.channelPromise
            dispatchRef.current({ type: 'connected' })
            await sync(channel, session.connection)
            return
          }
        }
      } catch (e) {
        dispatchRef.current({ type: 'failed', message: getSyncErrorMessage(e) })
      }
    },
    [release, sync],
  )

  const dispatch = useCallback(
    (event: WifiEvent) => {
      const [next, commands] = wifiReducer(stateRef.current, event)
      stateRef.current = next
      setState(next)
      for (const command of commands) void perform(command)
    },
    [perform],
  )
  dispatchRef.current = dispatch

  // Teardown on unmount — closing the drawer must not leak a connection.
  useEffect(() => release, [release])

  return {
    state,
    offer: useCallback(() => dispatch({ type: 'offer' }), [dispatch]),
    readyForAnswer: useCallback(() => dispatch({ type: 'ready-for-answer' }), [dispatch]),
    scanOffer: useCallback(() => dispatch({ type: 'scan-offer' }), [dispatch]),
    scanned: useCallback((scan: Scan) => dispatch({ type: 'scanned', scan }), [dispatch]),
    reset: useCallback(() => dispatch({ type: 'reset' }), [dispatch]),
  }
}
