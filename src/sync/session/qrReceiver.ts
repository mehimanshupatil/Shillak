import type { Scan } from '@/sync/classifyScan'
import { unexpectedScanMessage } from '@/sync/classifyScan'
import type { QRChunkEnvelope } from '@/sync/qr'
import { reassembleChunks } from '@/sync/qr'

/**
 * The receiving half of a QR-batch Sync session, as a pure state machine.
 *
 * The receiver shows its own clock so the sender can work out a minimal Delta,
 * then collects the chunks that come back. Every transition here used to live in
 * a render module alongside the I/O, which is why none of it was ever tested.
 *
 * The reducer performs no effects: it returns the commands the driver should
 * run, and the driver feeds the results back as events.
 */

export type QrReceiverState =
  | { step: 'idle' }
  | { step: 'preparing' }
  | { step: 'showing-clock'; clockQR: string }
  | {
      step: 'scanning'
      /** Chunks collected so far, keyed by index. */
      collected: Map<number, QRChunkEnvelope>
      /** How many chunks the export has, once a first chunk has said so. */
      total: number | null
      /** Which export these chunks belong to — chunks from another are refused. */
      session: string | null
    }
  | { step: 'processing' }
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }

export type QrReceiverEvent =
  | { type: 'start' }
  | { type: 'clock-ready'; clockQR: string }
  | { type: 'begin-scanning' }
  | { type: 'scanned'; scan: Scan }
  | { type: 'payload-applied'; applied: number; conflicts: number }
  | { type: 'failed'; message: string }
  | { type: 'reset' }

export type QrReceiverCommand = { run: 'build-clock' } | { run: 'apply-payload'; payload: string }

export function initialQrReceiverState(): QrReceiverState {
  return { step: 'idle' }
}

type Step = [QrReceiverState, QrReceiverCommand[]]

function fail(message: string): Step {
  return [{ step: 'error', message }, []]
}

export function qrReceiverReducer(state: QrReceiverState, event: QrReceiverEvent): Step {
  // Available from any step: starting over, and reporting a failure.
  if (event.type === 'reset') return [{ step: 'idle' }, []]
  if (event.type === 'failed') return fail(event.message)

  switch (state.step) {
    case 'idle':
      if (event.type === 'start') return [{ step: 'preparing' }, [{ run: 'build-clock' }]]
      return [state, []]

    case 'preparing':
      if (event.type === 'clock-ready')
        return [{ step: 'showing-clock', clockQR: event.clockQR }, []]
      return [state, []]

    case 'showing-clock':
      if (event.type === 'begin-scanning')
        return [{ step: 'scanning', collected: new Map(), total: null, session: null }, []]
      return [state, []]

    case 'scanning': {
      if (event.type !== 'scanned') return [state, []]
      if (event.scan.kind !== 'chunk') return fail(unexpectedScanMessage(event.scan, 'chunk'))

      const envelope = event.scan.envelope

      // Chunks are only meaningful together with the rest of their own export.
      // Two exports interleaving would reassemble into a payload that decrypts
      // to nothing useful, with no hint as to why.
      if (state.session !== null && envelope.session !== state.session) {
        return fail('Those chunks are from a different transfer — start the scan again.')
      }

      const collected = new Map(state.collected)
      collected.set(envelope.index, envelope)

      const payload = reassembleChunks(collected, envelope.total)
      if (payload !== null) return [{ step: 'processing' }, [{ run: 'apply-payload', payload }]]

      return [{ step: 'scanning', collected, total: envelope.total, session: envelope.session }, []]
    }

    case 'processing':
      if (event.type === 'payload-applied')
        return [{ step: 'done', applied: event.applied, conflicts: event.conflicts }, []]
      return [state, []]

    case 'done':
    case 'error':
      return [state, []]
  }
}

/** How many distinct chunks have been scanned, for the progress readout. */
export function chunksCollected(state: QrReceiverState): number {
  return state.step === 'scanning' ? state.collected.size : 0
}

/** The lowest chunk index still missing, so the UI can say which one to show. */
export function nextChunkNeeded(state: QrReceiverState): number | null {
  if (state.step !== 'scanning' || state.total === null) return null
  for (let i = 0; i < state.total; i++) {
    if (!state.collected.has(i)) return i
  }
  return null
}
