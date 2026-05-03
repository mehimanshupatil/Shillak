/**
 * QR chunk generation and reassembly.
 * Also handles SDP encoding/decoding for WebRTC signaling.
 *
 * Chunk target: ≤600 bytes raw data. After base64 + JSON wrapper the QR payload
 * stays within version-40 QR capacity (~1850 alphanumeric chars).
 *
 * Chunk envelope:
 *   { v: 1, session: string, total: number, index: number, data: string }
 *
 * SDP envelope (for WebRTC):
 *   { v: 1, type: 'sdp', sdp: RTCSessionDescriptionInit }
 *   DEFLATE-compressed (fflate), base64 encoded — single QR.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

export const QR_CHUNK_BYTES = 600

export interface QRChunkEnvelope {
  v: 1
  session: string // random ID tying chunks of one export together
  total: number
  index: number // 0-based
  data: string // base64 chunk of the full encrypted payload
}

interface SDPEnvelope {
  v: 1
  type: 'sdp'
  sdp: RTCSessionDescriptionInit
}

// ─── SDP strip — local WiFi only ─────────────────────────────────────────────

const LOCAL_IP_RE = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/

/**
 * Strip SDP down to only local-network ICE candidates.
 * Removes srflx (STUN) and relay (TURN) candidates — useless on local WiFi
 * and take up ~60% of the raw SDP bytes.
 */
function stripSDP(sdp: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  // RTCSessionDescription has type/sdp as prototype getters — spread drops them.
  // Always extract explicitly so JSON.stringify captures both fields.
  const type = sdp.type
  const raw = sdp.sdp
  if (!raw) return { type, sdp: raw }
  const lines = raw.split('\r\n')
  const filtered = lines.filter((line) => {
    if (!line.startsWith('a=candidate:')) return true
    if (!line.includes('typ host')) return false
    const parts = line.split(' ')
    const ip = parts[4] ?? ''
    return LOCAL_IP_RE.test(ip)
  })
  return { type, sdp: filtered.join('\r\n') }
}

// ─── Compress helpers ─────────────────────────────────────────────────────────

function compress(text: string): string {
  const bytes = deflateSync(strToU8(text), { level: 9 })
  // Avoid spread (...bytes) — crashes on large arrays (call stack limit).
  // Build the binary string with a loop instead.
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number)
  return btoa(bin)
}

function decompress(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return strFromU8(inflateSync(bytes))
}

// ─── SDP encode / decode ──────────────────────────────────────────────────────

/**
 * Strips non-local ICE candidates, then DEFLATE-compresses and base64-encodes.
 * Typical stripped SDP (~350 bytes) compresses to ~150 bytes → ~200 base64 chars.
 */
export function encodeSDP(sdp: RTCSessionDescriptionInit): string {
  return compress(JSON.stringify({ v: 1, type: 'sdp', sdp: stripSDP(sdp) }))
}

export function decodeSDP(encoded: string): RTCSessionDescriptionInit {
  const raw = decompress(encoded)
  const envelope = JSON.parse(raw) as SDPEnvelope
  if (envelope.v !== 1 || envelope.type !== 'sdp') throw new Error('Not an SDP QR code')
  return envelope.sdp
}

export function isSDP(encoded: string): boolean {
  try {
    const raw = decompress(encoded)
    const env = JSON.parse(raw) as Partial<SDPEnvelope>
    return env.v === 1 && env.type === 'sdp'
  } catch {
    return false
  }
}

// ─── Chunk encode / decode ────────────────────────────────────────────────────

/** Split an encrypted payload string into ≤QR_CHUNK_BYTES chunks. */
export function chunkPayload(encryptedPayload: string): QRChunkEnvelope[] {
  const session = crypto.randomUUID().slice(0, 8)
  const chunks: string[] = []
  for (let i = 0; i < encryptedPayload.length; i += QR_CHUNK_BYTES) {
    chunks.push(encryptedPayload.slice(i, i + QR_CHUNK_BYTES))
  }
  return chunks.map((data, index) => ({
    v: 1,
    session,
    total: chunks.length,
    index,
    data,
  }))
}

/** Encode a QRChunkEnvelope to a string for QR display. */
export function encodeChunk(envelope: QRChunkEnvelope): string {
  // Encrypted data is already random bytes — compression gives no benefit.
  // Plain JSON is simpler and avoids wasting CPU.
  return JSON.stringify(envelope)
}

/** Decode a scanned string back to a QRChunkEnvelope. */
export function decodeChunk(scanned: string): QRChunkEnvelope {
  const env = JSON.parse(scanned) as QRChunkEnvelope
  if (env.v !== 1) throw new Error('Unsupported chunk version')
  return env
}

export function isChunk(scanned: string): boolean {
  try {
    const env = decodeChunk(scanned)
    return typeof env.index === 'number' && typeof env.total === 'number'
  } catch {
    return false
  }
}

/**
 * Reassemble chunks into the original encrypted payload.
 * Returns null if not all chunks are present.
 */
export function reassembleChunks(
  chunks: Map<number, QRChunkEnvelope>,
  total: number,
): string | null {
  const parts: string[] = []
  for (let i = 0; i < total; i++) {
    const chunk = chunks.get(i)
    if (!chunk) return null
    parts.push(chunk.data)
  }
  return parts.join('')
}
