import { describe, expect, it } from 'vitest'
import { classifyScan } from '@/sync/classifyScan'
import { chunkPayload, encodeChunk, encodeClockQR } from '@/sync/qr'
import type { QrReceiverCommand, QrReceiverEvent, QrReceiverState } from '@/sync/session/qrReceiver'
import {
  chunksCollected,
  initialQrReceiverState,
  nextChunkNeeded,
  qrReceiverReducer,
} from '@/sync/session/qrReceiver'

/** Chunk QRs for one export, as the sender would show them. */
function chunksFor(payload: string): string[] {
  return chunkPayload(payload).map(encodeChunk)
}

const PAYLOAD = 'x'.repeat(1500) // long enough to need several chunks
const CHUNKS = chunksFor(PAYLOAD)

function scanOf(qr: string): QrReceiverEvent {
  return { type: 'scanned', scan: classifyScan(qr) }
}

/** Feeds events through the reducer, collecting every command it asked for. */
function run(
  start: QrReceiverState,
  ...events: QrReceiverEvent[]
): { state: QrReceiverState; commands: QrReceiverCommand[] } {
  let state = start
  const commands: QrReceiverCommand[] = []
  for (const event of events) {
    const [next, issued] = qrReceiverReducer(state, event)
    state = next
    commands.push(...issued)
  }
  return { state, commands }
}

function scanning(): QrReceiverState {
  return run(
    initialQrReceiverState(),
    { type: 'start' },
    { type: 'clock-ready', clockQR: encodeClockQR('g1', { u1: 1 }) },
    { type: 'begin-scanning' },
  ).state
}

describe('qrReceiverReducer', () => {
  it('asks for a clock to show, and shows it when one arrives', () => {
    const started = run(initialQrReceiverState(), { type: 'start' })
    expect(started.state.step).toBe('preparing')
    expect(started.commands).toEqual([{ run: 'build-clock' }])

    const shown = run(started.state, { type: 'clock-ready', clockQR: 'QR' })
    expect(shown.state).toEqual({ step: 'showing-clock', clockQR: 'QR' })
  })

  it('collects chunks without asking for anything until the set is complete', () => {
    const partial = run(scanning(), scanOf(CHUNKS[0] as string))
    expect(partial.state.step).toBe('scanning')
    expect(partial.commands).toEqual([])
    expect(chunksCollected(partial.state)).toBe(1)
  })

  it('applies the payload once every chunk has arrived', () => {
    const all = run(scanning(), ...CHUNKS.map(scanOf))
    expect(all.state.step).toBe('processing')
    expect(all.commands).toEqual([{ run: 'apply-payload', payload: PAYLOAD }])
  })

  it('accepts chunks out of order', () => {
    const reversed = run(scanning(), ...[...CHUNKS].reverse().map(scanOf))
    expect(reversed.state.step).toBe('processing')
    expect(reversed.commands).toEqual([{ run: 'apply-payload', payload: PAYLOAD }])
  })

  it('treats a re-scanned chunk as the same chunk, not a new one', () => {
    const twice = run(scanning(), scanOf(CHUNKS[0] as string), scanOf(CHUNKS[0] as string))
    expect(chunksCollected(twice.state)).toBe(1)
  })

  it('refuses chunks from a different export instead of interleaving them', () => {
    const other = chunksFor('y'.repeat(1500))
    const mixed = run(scanning(), scanOf(CHUNKS[0] as string), scanOf(other[1] as string))
    expect(mixed.state.step).toBe('error')
    expect(mixed.state.step === 'error' && mixed.state.message).toMatch(/different transfer/)
  })

  it('says what was scanned when it is not a chunk at all', () => {
    const wrong = run(scanning(), scanOf(encodeClockQR('g1', { u1: 1 })))
    expect(wrong.state.step).toBe('error')
    expect(wrong.state.step === 'error' && wrong.state.message).toMatch(/sync-state code/)
  })

  it('reports what was applied', () => {
    const all = run(scanning(), ...CHUNKS.map(scanOf))
    const done = run(all.state, { type: 'payload-applied', applied: 12, conflicts: 2 })
    expect(done.state).toEqual({ step: 'done', applied: 12, conflicts: 2 })
  })

  it('ignores events that do not belong to the current step', () => {
    const idle = initialQrReceiverState()
    expect(run(idle, { type: 'begin-scanning' }).state).toEqual(idle)
    expect(run(idle, scanOf(CHUNKS[0] as string)).state).toEqual(idle)
    expect(run(scanning(), { type: 'payload-applied', applied: 1, conflicts: 0 }).state.step).toBe(
      'scanning',
    )
  })

  it('is inert once it is done — a late scan cannot restart it', () => {
    const done: QrReceiverState = { step: 'done', applied: 1, conflicts: 0 }
    expect(run(done, scanOf(CHUNKS[0] as string)).state).toEqual(done)
  })

  it('can fail from anywhere and reset from anywhere', () => {
    expect(run(scanning(), { type: 'failed', message: 'boom' }).state).toEqual({
      step: 'error',
      message: 'boom',
    })
    const recovered = run({ step: 'error', message: 'boom' }, { type: 'reset' })
    expect(recovered.state).toEqual(initialQrReceiverState())
  })

  it('never mutates the state it was handed', () => {
    const before = scanning()
    const snapshot = chunksCollected(before)
    run(before, scanOf(CHUNKS[0] as string))
    expect(chunksCollected(before)).toBe(snapshot)
  })
})

describe('progress readout', () => {
  it('names the lowest chunk still missing', () => {
    const partial = run(scanning(), scanOf(CHUNKS[0] as string), scanOf(CHUNKS[2] as string))
    expect(nextChunkNeeded(partial.state)).toBe(1)
  })

  it('has nothing to report before the first chunk names a total', () => {
    expect(nextChunkNeeded(scanning())).toBeNull()
    expect(nextChunkNeeded(initialQrReceiverState())).toBeNull()
  })
})
