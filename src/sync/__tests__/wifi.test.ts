import { describe, expect, it } from 'vitest'
import { classifyScan } from '@/sync/classifyScan'
import { encodeClockQR, encodeSDP } from '@/sync/qr'
import type { WifiCommand, WifiEvent, WifiState } from '@/sync/session/wifi'
import { initialWifiState, wifiReducer } from '@/sync/session/wifi'
import type { WebRTCOfferSession } from '@/sync/webrtc'

const SDP_QR = encodeSDP({
  type: 'answer',
  sdp: [
    'v=0',
    'a=ice-ufrag:abcd',
    'a=ice-pwd:0123456789abcdef0123',
    'a=fingerprint:sha-256 AA:BB:CC:DD',
    'a=setup:active',
    'a=candidate:1 1 udp 2130706431 192.168.1.20 54321 typ host',
  ].join('\r\n'),
})
const CLOCK_QR = encodeClockQR('g1', { u1: 1 })

const SESSION = { encodedSDP: 'offer-qr' } as WebRTCOfferSession

function scanOf(qr: string): WifiEvent {
  return { type: 'scanned', scan: classifyScan(qr) }
}

function run(
  start: WifiState,
  ...events: WifiEvent[]
): { state: WifiState; commands: WifiCommand[] } {
  let state = start
  const commands: WifiCommand[] = []
  for (const event of events) {
    const [next, issued] = wifiReducer(state, event)
    state = next
    commands.push(...issued)
  }
  return { state, commands }
}

/** Device A, showing its offer and ready to read the answer. */
function awaitingAnswer(): WifiState {
  return run(
    initialWifiState(),
    { type: 'offer' },
    { type: 'offer-ready', session: SESSION },
    { type: 'ready-for-answer' },
  ).state
}

describe('wifiReducer — the offering device', () => {
  it('asks for an offer, then shows it', () => {
    const asked = run(initialWifiState(), { type: 'offer' })
    expect(asked.state.step).toBe('creating-offer')
    expect(asked.commands).toEqual([{ run: 'create-offer' }])

    const showing = run(asked.state, { type: 'offer-ready', session: SESSION })
    expect(showing.state).toEqual({ step: 'offering', session: SESSION })
  })

  it('carries the same session through to reading the answer', () => {
    const ready = awaitingAnswer()
    expect(ready.step === 'scan-answer' && ready.session).toBe(SESSION)
  })

  it('finishes connecting with the session it opened', () => {
    const scanned = run(awaitingAnswer(), scanOf(SDP_QR))
    expect(scanned.state.step).toBe('syncing')
    expect(scanned.commands).toEqual([{ run: 'complete-offer', session: SESSION, answer: SDP_QR }])
  })

  it('says what was scanned when it is not a sync code, and releases the connection', () => {
    const wrong = run(awaitingAnswer(), scanOf(CLOCK_QR))
    expect(wrong.state.step).toBe('error')
    expect(wrong.state.step === 'error' && wrong.state.message).toMatch(/sync-state code/)
    expect(wrong.commands).toEqual([{ run: 'close' }])
  })
})

describe('wifiReducer — the answering device', () => {
  it('accepts an offer it scanned', () => {
    const scanned = run(initialWifiState(), { type: 'scan-offer' }, scanOf(SDP_QR))
    expect(scanned.state.step).toBe('scanning-offer')
    expect(scanned.commands).toEqual([{ run: 'accept-offer', offer: SDP_QR }])
  })

  it('shows its answer before the channel opens, then syncs once it does', () => {
    const scanned = run(initialWifiState(), { type: 'scan-offer' }, scanOf(SDP_QR))
    const answering = run(scanned.state, { type: 'answer-ready', encodedAnswer: 'answer-qr' })
    expect(answering.state).toEqual({ step: 'answering', encodedAnswer: 'answer-qr' })

    expect(run(answering.state, { type: 'connected' }).state).toEqual({ step: 'syncing' })
  })

  it('refuses a code that is not an offer', () => {
    const wrong = run(initialWifiState(), { type: 'scan-offer' }, scanOf(CLOCK_QR))
    expect(wrong.state.step).toBe('error')
    expect(wrong.commands).toEqual([{ run: 'close' }])
  })
})

describe('wifiReducer — shared behaviour', () => {
  it('reports what the session applied', () => {
    const syncing: WifiState = { step: 'syncing' }
    expect(run(syncing, { type: 'completed', applied: 4, conflicts: 1 }).state).toEqual({
      step: 'done',
      applied: 4,
      conflicts: 1,
    })
  })

  it('releases the connection when abandoned from any step', () => {
    for (const state of [awaitingAnswer(), { step: 'syncing' } as WifiState]) {
      const abandoned = run(state, { type: 'reset' })
      expect(abandoned.state).toEqual(initialWifiState())
      expect(abandoned.commands).toEqual([{ run: 'close' }])
    }
  })

  it('releases the connection when it fails from any step', () => {
    const failed = run(awaitingAnswer(), { type: 'failed', message: 'boom' })
    expect(failed.state).toEqual({ step: 'error', message: 'boom' })
    expect(failed.commands).toEqual([{ run: 'close' }])
  })

  it('ignores events that do not belong to the current step', () => {
    const idle = initialWifiState()
    expect(run(idle, scanOf(SDP_QR)).state).toEqual(idle)
    expect(run(idle, { type: 'connected' }).state).toEqual(idle)
    expect(run(awaitingAnswer(), { type: 'offer' }).state.step).toBe('scan-answer')
  })

  it('is inert once done — a late scan cannot restart it', () => {
    const done: WifiState = { step: 'done', applied: 1, conflicts: 0 }
    expect(run(done, scanOf(SDP_QR)).state).toEqual(done)
    expect(run(done, scanOf(SDP_QR)).commands).toEqual([])
  })

  it('starts over cleanly from an error', () => {
    expect(run({ step: 'error', message: 'boom' }, { type: 'reset' }).state).toEqual(
      initialWifiState(),
    )
  })
})
