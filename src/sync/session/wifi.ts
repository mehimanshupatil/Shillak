import type { Scan } from '@/sync/classifyScan'
import { unexpectedScanMessage } from '@/sync/classifyScan'
import type { WebRTCOfferSession } from '@/sync/webrtc'

/**
 * A WiFi Sync session, as a pure state machine.
 *
 * Two devices meet by swapping SDP over QR: one offers, the other answers. The
 * roles diverge at the first choice and never meet again until both are syncing,
 * which is why a single step union reads as two paths braided together.
 *
 * The live `RTCPeerConnection` rides along in state but is never touched here —
 * the reducer only decides what should happen to it next.
 */

export type WifiState =
  | { step: 'idle' }
  | { step: 'creating-offer' }
  | { step: 'offering'; session: WebRTCOfferSession }
  | { step: 'scan-answer'; session: WebRTCOfferSession }
  | { step: 'scanning-offer' }
  | { step: 'answering'; encodedAnswer: string }
  | { step: 'syncing' }
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }

export type WifiEvent =
  | { type: 'offer' }
  | { type: 'offer-ready'; session: WebRTCOfferSession }
  | { type: 'ready-for-answer' }
  | { type: 'scan-offer' }
  | { type: 'scanned'; scan: Scan }
  | { type: 'answer-ready'; encodedAnswer: string }
  | { type: 'connected' }
  | { type: 'completed'; applied: number; conflicts: number }
  | { type: 'failed'; message: string }
  | { type: 'reset' }

export type WifiCommand =
  /** Device A: open a connection and produce an offer to show. */
  | { run: 'create-offer' }
  /** Device A: the other device answered — finish connecting and sync. */
  | { run: 'complete-offer'; session: WebRTCOfferSession; answer: string }
  /** Device B: answer someone else's offer, then sync. */
  | { run: 'accept-offer'; offer: string }
  /** Release whatever connection is open. */
  | { run: 'close' }

export function initialWifiState(): WifiState {
  return { step: 'idle' }
}

type Step = [WifiState, WifiCommand[]]

function fail(message: string): Step {
  return [{ step: 'error', message }, [{ run: 'close' }]]
}

export function wifiReducer(state: WifiState, event: WifiEvent): Step {
  // A session can be abandoned or fail from any step, and either way whatever
  // connection is open has to be released — nothing used to release it.
  if (event.type === 'reset') return [{ step: 'idle' }, [{ run: 'close' }]]
  if (event.type === 'failed') return fail(event.message)

  switch (state.step) {
    case 'idle':
      if (event.type === 'offer') return [{ step: 'creating-offer' }, [{ run: 'create-offer' }]]
      if (event.type === 'scan-offer') return [{ step: 'scanning-offer' }, []]
      return [state, []]

    case 'creating-offer':
      if (event.type === 'offer-ready') return [{ step: 'offering', session: event.session }, []]
      return [state, []]

    case 'offering':
      if (event.type === 'ready-for-answer')
        return [{ step: 'scan-answer', session: state.session }, []]
      return [state, []]

    case 'scan-answer': {
      if (event.type !== 'scanned') return [state, []]
      if (event.scan.kind !== 'sdp') return fail(unexpectedScanMessage(event.scan, 'sdp'))
      return [
        { step: 'syncing' },
        [{ run: 'complete-offer', session: state.session, answer: event.scan.encoded }],
      ]
    }

    case 'scanning-offer': {
      // Device B produces its answer before the channel opens, so it stays on
      // this step until then.
      if (event.type === 'answer-ready')
        return [{ step: 'answering', encodedAnswer: event.encodedAnswer }, []]
      if (event.type !== 'scanned') return [state, []]
      if (event.scan.kind !== 'sdp') return fail(unexpectedScanMessage(event.scan, 'sdp'))
      return [state, [{ run: 'accept-offer', offer: event.scan.encoded }]]
    }

    case 'answering':
      if (event.type === 'connected') return [{ step: 'syncing' }, []]
      return [state, []]

    case 'syncing':
      if (event.type === 'completed')
        return [{ step: 'done', applied: event.applied, conflicts: event.conflicts }, []]
      return [state, []]

    case 'done':
    case 'error':
      return [state, []]
  }
}
