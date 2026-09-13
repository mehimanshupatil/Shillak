import type { Scan } from '@/sync/classifyScan'
import { unexpectedScanMessage } from '@/sync/classifyScan'
import type { ClockEnvelope } from '@/sync/qr'

/**
 * The sending half of a QR-batch Sync session, as a pure state machine.
 *
 * The sender scans the receiver's clock, works out what they're missing, and
 * shows the result as a carousel of chunks for them to scan back. It is a
 * one-way handoff: nothing comes back over the camera, so the sender learns
 * only that it presented the data, never that it landed.
 */

export interface ChunkCarousel {
  chunks: string[]
  index: number
  recordCount: number
}

export type QrSenderState =
  | { step: 'idle' }
  | { step: 'scanning-clock' }
  | { step: 'building' }
  | { step: 'up-to-date' }
  | ({ step: 'showing-data' } & ChunkCarousel)
  | { step: 'error'; message: string }

export type QrSenderEvent =
  | { type: 'start' }
  | { type: 'scanned'; scan: Scan }
  | { type: 'delta-ready'; chunks: string[]; recordCount: number }
  | { type: 'already-up-to-date' }
  | { type: 'show-chunk'; index: number }
  | { type: 'failed'; message: string }
  | { type: 'reset' }

export type QrSenderCommand = { run: 'build-delta'; envelope: ClockEnvelope }

export function initialQrSenderState(): QrSenderState {
  return { step: 'idle' }
}

type Step = [QrSenderState, QrSenderCommand[]]

export function qrSenderReducer(state: QrSenderState, event: QrSenderEvent): Step {
  if (event.type === 'reset') return [{ step: 'idle' }, []]
  if (event.type === 'failed') return [{ step: 'error', message: event.message }, []]

  switch (state.step) {
    case 'idle':
      if (event.type === 'start') return [{ step: 'scanning-clock' }, []]
      return [state, []]

    case 'scanning-clock': {
      if (event.type !== 'scanned') return [state, []]
      if (event.scan.kind !== 'clock')
        return [{ step: 'error', message: unexpectedScanMessage(event.scan, 'clock') }, []]
      return [{ step: 'building' }, [{ run: 'build-delta', envelope: event.scan.envelope }]]
    }

    case 'building':
      if (event.type === 'already-up-to-date') return [{ step: 'up-to-date' }, []]
      if (event.type === 'delta-ready')
        return [
          {
            step: 'showing-data',
            chunks: event.chunks,
            index: 0,
            recordCount: event.recordCount,
          },
          [],
        ]
      return [state, []]

    case 'showing-data': {
      if (event.type !== 'show-chunk') return [state, []]
      // Clamped rather than guarded at the call site: the carousel knows its own
      // length, and a tap past either end is a no-op, not an error.
      const index = Math.min(Math.max(event.index, 0), state.chunks.length - 1)
      return [{ ...state, index }, []]
    }

    case 'up-to-date':
    case 'error':
      return [state, []]
  }
}
