import { describe, expect, it } from 'vitest'
import {
  chunkPayload,
  decodeChunk,
  decodeClockQR,
  decodeSDP,
  encodeChunk,
  encodeClockQR,
  encodeSDP,
  isChunk,
  isClockQR,
  isSDP,
  QR_CHUNK_BYTES,
  reassembleChunks,
} from '../qr'

// ─── SDP codec ────────────────────────────────────────────────────────────────

const MINIMAL_SDP_LINES = [
  'v=0',
  'o=- 1 1 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:efgh12345678901234',
  'a=fingerprint:sha-256 AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90',
  'a=setup:actpass',
  'a=candidate:1 1 UDP 2122252543 192.168.1.5 54321 typ host',
  '',
].join('\r\n')

function makeSdp(type: 'offer' | 'answer' = 'offer'): RTCSessionDescriptionInit {
  return { type, sdp: MINIMAL_SDP_LINES }
}

describe('encodeSDP / decodeSDP', () => {
  it('round-trips an offer through the compact format', () => {
    const encoded = encodeSDP(makeSdp('offer'))
    const decoded = decodeSDP(encoded)
    expect(decoded.type).toBe('offer')
    expect(decoded.sdp).toContain('a=ice-ufrag:abcd')
    expect(decoded.sdp).toContain('192.168.1.5')
  })

  it('round-trips an answer', () => {
    const encoded = encodeSDP(makeSdp('answer'))
    expect(decodeSDP(encoded).type).toBe('answer')
  })

  it('throws when required SDP fields are missing', () => {
    expect(() => parseAndEncode('v=0\r\ns=-\r\n')).toThrow(/missing required fields/)
  })

  function parseAndEncode(sdp: string) {
    return encodeSDP({ type: 'offer', sdp })
  }

  it('rejects a compact SDP with too few fields', () => {
    expect(() => decodeSDP('o|ufrag|pwd')).toThrow(/Invalid compact SDP/)
  })

  it('isSDP recognizes a valid compact SDP and rejects garbage', () => {
    const encoded = encodeSDP(makeSdp('offer'))
    expect(isSDP(encoded)).toBe(true)
    expect(isSDP('not an sdp')).toBe(false)
    expect(isSDP('{"v":1}')).toBe(false)
  })

  it('only keeps local-network host candidates, dropping public/relay ones', () => {
    const sdpWithPublicCandidate = [
      'v=0',
      'a=ice-ufrag:abcd',
      'a=ice-pwd:efgh12345678901234',
      'a=fingerprint:sha-256 AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90',
      'a=setup:actpass',
      'a=candidate:1 1 UDP 2122252543 8.8.8.8 54321 typ host',
      'a=candidate:2 1 UDP 2122252543 192.168.1.5 54321 typ host',
      '',
    ].join('\r\n')
    const encoded = encodeSDP({ type: 'offer', sdp: sdpWithPublicCandidate })
    const decoded = decodeSDP(encoded)
    expect(decoded.sdp).not.toContain('8.8.8.8')
    expect(decoded.sdp).toContain('192.168.1.5')
  })
})

// ─── Chunking ─────────────────────────────────────────────────────────────────

describe('chunkPayload / reassembleChunks', () => {
  it('produces a single chunk for a payload smaller than the chunk size', () => {
    const chunks = chunkPayload('short-payload')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.data).toBe('short-payload')
    expect(chunks[0]?.total).toBe(1)
  })

  it('splits a payload larger than QR_CHUNK_BYTES into multiple chunks', () => {
    const payload = 'x'.repeat(QR_CHUNK_BYTES * 3 + 50)
    const chunks = chunkPayload(payload)
    expect(chunks).toHaveLength(4)
    expect(chunks.every((c) => c.total === 4)).toBe(true)
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3])
  })

  it('splits a payload exactly at a chunk-size boundary without an empty trailing chunk', () => {
    const payload = 'x'.repeat(QR_CHUNK_BYTES * 2)
    const chunks = chunkPayload(payload)
    expect(chunks).toHaveLength(2)
  })

  it('reassembles chunks back to the exact original payload, regardless of arrival order', () => {
    const payload = `${'a'.repeat(QR_CHUNK_BYTES)}${'b'.repeat(QR_CHUNK_BYTES)}c123`
    const chunks = chunkPayload(payload)
    const map = new Map(chunks.map((c) => [c.index, c] as const).reverse()) // insert out of order
    const reassembled = reassembleChunks(map, chunks.length)
    expect(reassembled).toBe(payload)
  })

  it('returns null when a chunk is missing', () => {
    const payload = 'x'.repeat(QR_CHUNK_BYTES * 2 + 10)
    const chunks = chunkPayload(payload)
    const map = new Map(chunks.map((c) => [c.index, c]))
    map.delete(1)
    expect(reassembleChunks(map, chunks.length)).toBeNull()
  })
})

describe('encodeChunk / decodeChunk / isChunk', () => {
  it('round-trips a chunk envelope', () => {
    const [chunk] = chunkPayload('payload-data')
    if (!chunk) throw new Error('expected a chunk')
    const encoded = encodeChunk(chunk)
    expect(decodeChunk(encoded)).toEqual(chunk)
  })

  it('rejects an envelope with an unsupported version', () => {
    expect(() =>
      decodeChunk(JSON.stringify({ v: 2, session: 's', total: 1, index: 0, data: 'x' })),
    ).toThrow('Unsupported chunk version')
  })

  it('isChunk distinguishes a real chunk from arbitrary JSON', () => {
    const [chunk] = chunkPayload('x')
    if (!chunk) throw new Error('expected a chunk')
    expect(isChunk(encodeChunk(chunk))).toBe(true)
    expect(isChunk('{"foo":"bar"}')).toBe(false)
    expect(isChunk('not json at all')).toBe(false)
  })
})

// ─── Clock QR ─────────────────────────────────────────────────────────────────

describe('encodeClockQR / decodeClockQR / isClockQR', () => {
  it('round-trips a clock without since', () => {
    const encoded = encodeClockQR('g1', { u1: 3, u2: 1 })
    const decoded = decodeClockQR(encoded)
    expect(decoded).toEqual({ v: 1, type: 'clock', groupId: 'g1', clock: { u1: 3, u2: 1 } })
  })

  it('round-trips a clock with since when since > 0', () => {
    const encoded = encodeClockQR('g1', { u1: 1 }, 12345)
    expect(decodeClockQR(encoded).since).toBe(12345)
  })

  it('omits since when it is 0 (first sync, absent = send everything)', () => {
    const encoded = encodeClockQR('g1', { u1: 1 }, 0)
    expect(decodeClockQR(encoded).since).toBeUndefined()
  })

  it('rejects a payload that is not a clock envelope', () => {
    expect(() => decodeClockQR(JSON.stringify({ v: 1, type: 'chunk' }))).toThrow('Not a clock QR')
  })

  it('isClockQR distinguishes a clock QR from a chunk QR', () => {
    const clockQR = encodeClockQR('g1', {})
    const [chunk] = chunkPayload('x')
    if (!chunk) throw new Error('expected a chunk')
    expect(isClockQR(clockQR)).toBe(true)
    expect(isClockQR(encodeChunk(chunk))).toBe(false)
  })
})
