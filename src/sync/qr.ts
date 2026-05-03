/**
 * QR chunk generation and reassembly.
 * Also handles SDP encoding/decoding for WebRTC signaling.
 *
 * SDP compact format — pipe-separated, ~120 chars total:
 *   t|ufrag|pwd|fp_hex|setup|ip:port[|ip:port...]
 *   t       = 'o' (offer) | 'a' (answer)
 *   fp_hex  = sha-256 fingerprint as 64 lowercase hex chars, no colons
 *   ip:port = local-network host candidates only
 *
 *   ~120 chars → version-3 QR at level M — small, fast to scan.
 *
 * Chunk envelope (JSON, no compression — payload is already encrypted):
 *   { v: 1, session: string, total: number, index: number, data: string }
 *   300 bytes per chunk → ~460 chars QR → version-5 QR at level M.
 */

// 300 bytes of data per chunk → ~460 chars QR → version-5 QR at level M.
export const QR_CHUNK_BYTES = 300

export interface QRChunkEnvelope {
  v: 1
  session: string // random ID tying chunks of one export together
  total: number
  index: number // 0-based
  data: string // base64 chunk of the full encrypted payload
}

// ─── Minimal SDP codec ────────────────────────────────────────────────────────
// Full SDP is ~800+ bytes. We only need 5 fields — ufrag, pwd, fingerprint,
// setup, and local ICE candidates. This brings the QR down to ~120 chars.

const SEP = '|'
const LOCAL_IP_RE = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/

interface MinimalSDP {
  type: 'offer' | 'answer'
  ufrag: string
  pwd: string
  fp: string // 64 hex chars, no colons
  setup: string
  candidates: string[] // "ip:port"
}

function parseSDP(sdp: RTCSessionDescriptionInit): MinimalSDP {
  const lines = (sdp.sdp ?? '').split(/\r?\n/)
  let ufrag = ''
  let pwd = ''
  let fp = ''
  let setup = ''
  const candidates: string[] = []

  for (const line of lines) {
    if (line.startsWith('a=ice-ufrag:')) {
      ufrag = line.slice(12).trim()
    } else if (line.startsWith('a=ice-pwd:')) {
      pwd = line.slice(10).trim()
    } else if (line.startsWith('a=fingerprint:sha-256 ')) {
      fp = line.slice(22).trim().replace(/:/g, '').toLowerCase()
    } else if (line.startsWith('a=setup:')) {
      setup = line.slice(8).trim()
    } else if (line.startsWith('a=candidate:')) {
      // a=candidate:1 1 UDP 2122252543 <ip> <port> typ host ...
      const parts = line.split(' ')
      const ip = parts[4] ?? ''
      const port = parts[5] ?? ''
      if (parts[7] === 'host' && LOCAL_IP_RE.test(ip)) {
        candidates.push(`${ip}:${port}`)
      }
    }
  }

  console.log(
    '[QR:parseSDP] ufrag:',
    ufrag,
    'pwd len:',
    pwd.length,
    'fp len:',
    fp.length,
    'candidates:',
    candidates,
  )

  if (!ufrag || !pwd || !fp || !setup || candidates.length === 0) {
    throw new Error(
      `SDP missing required fields — ufrag:${!!ufrag} pwd:${!!pwd} fp:${!!fp} setup:${!!setup} candidates:${candidates.length}`,
    )
  }

  return { type: sdp.type as 'offer' | 'answer', ufrag, pwd, fp, setup, candidates }
}

function reconstructSDP(m: MinimalSDP): RTCSessionDescriptionInit {
  const fpWithColons = (m.fp.match(/.{2}/g) ?? []).join(':')
  const candidateLines = m.candidates.map((c, i) => {
    const colonIdx = c.lastIndexOf(':')
    const ip = c.slice(0, colonIdx)
    const port = c.slice(colonIdx + 1)
    return `a=candidate:${i + 1} 1 UDP 2122252543 ${ip} ${port} typ host`
  })

  const sdpStr = [
    'v=0',
    'o=- 1 1 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=bundle-only',
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    `a=ice-ufrag:${m.ufrag}`,
    `a=ice-pwd:${m.pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fpWithColons}`,
    `a=setup:${m.setup}`,
    ...candidateLines,
    '',
  ].join('\r\n')

  return { type: m.type, sdp: sdpStr }
}

// ─── SDP encode / decode ──────────────────────────────────────────────────────

/**
 * Encode SDP to ~120 char pipe-delimited string.
 * Format: t|ufrag|pwd|fp_hex|setup|ip:port[|ip:port...]
 */
export function encodeSDP(sdp: RTCSessionDescriptionInit): string {
  const m = parseSDP(sdp)
  const encoded = [
    m.type === 'offer' ? 'o' : 'a',
    m.ufrag,
    m.pwd,
    m.fp,
    m.setup,
    ...m.candidates,
  ].join(SEP)
  console.log(
    '[QR:encodeSDP] encoded length:',
    encoded.length,
    'value:',
    `${encoded.slice(0, 40)}…`,
  )
  return encoded
}

export function decodeSDP(encoded: string): RTCSessionDescriptionInit {
  console.log('[QR:decodeSDP] encoded length:', encoded.length)
  const parts = encoded.split(SEP)
  if (parts.length < 6) throw new Error(`Invalid compact SDP — got ${parts.length} fields, need ≥6`)
  const [t, ufrag, pwd, fp, setup, ...candidates] = parts
  if (!t || !ufrag || !pwd || !fp || !setup || candidates.length === 0) {
    throw new Error('Invalid compact SDP — missing required fields')
  }
  const result = reconstructSDP({
    type: t === 'o' ? 'offer' : 'answer',
    ufrag,
    pwd,
    fp,
    setup,
    candidates,
  })
  console.log(
    '[QR:decodeSDP] reconstructed type:',
    result.type,
    'sdp lines:',
    result.sdp?.split('\r\n').length,
  )
  return result
}

export function isSDP(encoded: string): boolean {
  const parts = encoded.split(SEP)
  return (parts[0] === 'o' || parts[0] === 'a') && parts.length >= 6
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
  // Payload is already encrypted — no compression benefit.
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
