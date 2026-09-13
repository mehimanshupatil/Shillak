import { describe, expect, it } from 'vitest'
import { classifyScan, unexpectedScanMessage } from '@/sync/classifyScan'
import { chunkPayload, encodeChunk, encodeClockQR, encodeSDP } from '@/sync/qr'

const CLOCK = encodeClockQR('g1', { u1: 3 }, 1234)
const CHUNK = encodeChunk(chunkPayload('some encrypted payload')[0] as never)

const SDP = encodeSDP({
  type: 'offer',
  sdp: [
    'v=0',
    'a=ice-ufrag:abcd',
    'a=ice-pwd:0123456789abcdef0123',
    'a=fingerprint:sha-256 AA:BB:CC:DD',
    'a=setup:actpass',
    'a=candidate:1 1 udp 2130706431 192.168.1.20 54321 typ host',
  ].join('\r\n'),
})

const INVITE = JSON.stringify({
  v: 1,
  groupId: 'g1',
  groupSecret: 'c2VjcmV0',
  name: 'Home',
  sig: 'deadbeef',
  exp: 9_999_999_999_999,
})

describe('classifyScan', () => {
  it('names a WiFi sync code', () => {
    expect(classifyScan(SDP)).toEqual({ kind: 'sdp', encoded: SDP })
  })

  it('names a sync-state code and hands back its contents', () => {
    const scan = classifyScan(CLOCK)
    expect(scan.kind).toBe('clock')
    expect(scan.kind === 'clock' && scan.envelope.groupId).toBe('g1')
    expect(scan.kind === 'clock' && scan.envelope.since).toBe(1234)
  })

  it('names a data chunk and hands back its envelope', () => {
    const scan = classifyScan(CHUNK)
    expect(scan.kind).toBe('chunk')
    expect(scan.kind === 'chunk' && scan.envelope.index).toBe(0)
  })

  it('names a space invite', () => {
    expect(classifyScan(INVITE).kind).toBe('invite')
  })

  it('calls anything else unrecognised rather than failing silently', () => {
    expect(classifyScan('https://example.com')).toEqual({ kind: 'unrecognised' })
    expect(classifyScan('{"v":2,"nonsense":true}')).toEqual({ kind: 'unrecognised' })
    expect(classifyScan('')).toEqual({ kind: 'unrecognised' })
    expect(classifyScan('   ')).toEqual({ kind: 'unrecognised' })
  })

  it('never throws on malformed input of a known shape', () => {
    expect(() => classifyScan('{"v":1,"type":"clock"')).not.toThrow()
    expect(classifyScan('{"v":1,"type":"clock"')).toEqual({ kind: 'unrecognised' })
  })

  it('tolerates surrounding whitespace from a scanner or a paste', () => {
    expect(classifyScan(`  ${CLOCK}  `).kind).toBe('clock')
  })

  it('keeps the four formats distinct', () => {
    const kinds = [SDP, CLOCK, CHUNK, INVITE].map((s) => classifyScan(s).kind)
    expect(new Set(kinds).size).toBe(4)
  })
})

describe('unexpectedScanMessage', () => {
  it('says what was scanned and what was wanted', () => {
    expect(unexpectedScanMessage(classifyScan(CLOCK), 'chunk')).toBe(
      "That's a sync-state code, not a data chunk.",
    )
  })

  it('has a plainer answer for something that is not ours at all', () => {
    expect(unexpectedScanMessage(classifyScan('nope'), 'sdp')).toBe("That QR isn't a Shillak code.")
  })
})
