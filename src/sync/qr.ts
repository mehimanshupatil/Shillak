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
 *   Compressed with lz-string, base64 encoded — single QR.
 */
import LZString from 'lz-string'

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

// ─── SDP encode / decode ──────────────────────────────────────────────────────

/** Compress an SDP for QR display. Returns a short base64-like string. */
export function encodeSDP(sdp: RTCSessionDescriptionInit): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, type: 'sdp', sdp }))
}

/** Decompress and parse SDP from QR scan result. */
export function decodeSDP(encoded: string): RTCSessionDescriptionInit {
  const raw = LZString.decompressFromEncodedURIComponent(encoded)
  if (!raw) throw new Error('Failed to decompress SDP — invalid QR data')
  const envelope = JSON.parse(raw) as SDPEnvelope
  if (envelope.v !== 1 || envelope.type !== 'sdp') throw new Error('Not an SDP QR code')
  return envelope.sdp
}

export function isSDP(encoded: string): boolean {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(encoded)
    if (!raw) return false
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
  return LZString.compressToEncodedURIComponent(JSON.stringify(envelope))
}

/** Decode a scanned string back to a QRChunkEnvelope. */
export function decodeChunk(scanned: string): QRChunkEnvelope {
  const raw = LZString.decompressFromEncodedURIComponent(scanned)
  if (!raw) throw new Error('Failed to decompress chunk')
  const env = JSON.parse(raw) as QRChunkEnvelope
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
