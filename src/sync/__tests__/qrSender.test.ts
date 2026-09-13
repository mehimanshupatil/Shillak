import { describe, expect, it } from 'vitest'
import { classifyScan } from '@/sync/classifyScan'
import { chunkPayload, encodeChunk, encodeClockQR } from '@/sync/qr'
import type { QrSenderCommand, QrSenderEvent, QrSenderState } from '@/sync/session/qrSender'
import { initialQrSenderState, qrSenderReducer } from '@/sync/session/qrSender'

const CLOCK_QR = encodeClockQR('g1', { u1: 3 }, 1234)
const CHUNK_QR = encodeChunk(chunkPayload('payload')[0] as never)

function scanOf(qr: string): QrSenderEvent {
  return { type: 'scanned', scan: classifyScan(qr) }
}

function run(
  start: QrSenderState,
  ...events: QrSenderEvent[]
): { state: QrSenderState; commands: QrSenderCommand[] } {
  let state = start
  const commands: QrSenderCommand[] = []
  for (const event of events) {
    const [next, issued] = qrSenderReducer(state, event)
    state = next
    commands.push(...issued)
  }
  return { state, commands }
}

function showing(chunks = ['a', 'b', 'c']): QrSenderState {
  return run(initialQrSenderState(), { type: 'start' }, scanOf(CLOCK_QR), {
    type: 'delta-ready',
    chunks,
    recordCount: 7,
  }).state
}

describe('qrSenderReducer', () => {
  it('asks for a Delta once it has read the other device’s clock', () => {
    const scanned = run(initialQrSenderState(), { type: 'start' }, scanOf(CLOCK_QR))
    expect(scanned.state.step).toBe('building')
    expect(scanned.commands).toHaveLength(1)
    expect(scanned.commands[0]?.run).toBe('build-delta')
    expect(scanned.commands[0]?.envelope.clock).toEqual({ u1: 3 })
    expect(scanned.commands[0]?.envelope.since).toBe(1234)
  })

  it('says what was scanned when it is not a clock code', () => {
    const wrong = run(initialQrSenderState(), { type: 'start' }, scanOf(CHUNK_QR))
    expect(wrong.state.step).toBe('error')
    expect(wrong.state.step === 'error' && wrong.state.message).toMatch(/data chunk/)
    expect(wrong.commands).toEqual([])
  })

  it('reports when the other device already has everything', () => {
    const scanned = run(initialQrSenderState(), { type: 'start' }, scanOf(CLOCK_QR))
    expect(run(scanned.state, { type: 'already-up-to-date' }).state).toEqual({
      step: 'up-to-date',
    })
  })

  it('opens the carousel on the first chunk', () => {
    expect(showing()).toEqual({
      step: 'showing-data',
      chunks: ['a', 'b', 'c'],
      index: 0,
      recordCount: 7,
    })
  })

  it('moves through the carousel', () => {
    const moved = run(showing(), { type: 'show-chunk', index: 2 })
    expect(moved.state.step === 'showing-data' && moved.state.index).toBe(2)
  })

  it('clamps at both ends rather than running off the carousel', () => {
    const past = run(showing(), { type: 'show-chunk', index: 99 })
    expect(past.state.step === 'showing-data' && past.state.index).toBe(2)

    const before = run(showing(), { type: 'show-chunk', index: -3 })
    expect(before.state.step === 'showing-data' && before.state.index).toBe(0)
  })

  it('keeps the chunks while moving between them', () => {
    const moved = run(showing(), { type: 'show-chunk', index: 1 })
    expect(moved.state.step === 'showing-data' && moved.state.chunks).toEqual(['a', 'b', 'c'])
    expect(moved.state.step === 'showing-data' && moved.state.recordCount).toBe(7)
  })

  it('ignores events that do not belong to the current step', () => {
    const idle = initialQrSenderState()
    expect(run(idle, scanOf(CLOCK_QR)).state).toEqual(idle)
    expect(run(idle, { type: 'show-chunk', index: 1 }).state).toEqual(idle)
    expect(run(showing(), { type: 'delta-ready', chunks: ['z'], recordCount: 1 }).state).toEqual(
      showing(),
    )
  })

  it('is inert once the other device is up to date', () => {
    const upToDate: QrSenderState = { step: 'up-to-date' }
    expect(run(upToDate, scanOf(CLOCK_QR)).state).toEqual(upToDate)
  })

  it('can fail from anywhere and reset from anywhere', () => {
    expect(run(showing(), { type: 'failed', message: 'boom' }).state).toEqual({
      step: 'error',
      message: 'boom',
    })
    expect(run({ step: 'error', message: 'boom' }, { type: 'reset' }).state).toEqual(
      initialQrSenderState(),
    )
  })

  it('never mutates the state it was handed', () => {
    const before = showing()
    run(before, { type: 'show-chunk', index: 2 })
    expect(before.step === 'showing-data' && before.index).toBe(0)
  })
})
