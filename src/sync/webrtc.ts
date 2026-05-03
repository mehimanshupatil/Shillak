/**
 * WebRTC local WiFi sync — no signaling server.
 * SDP exchanged manually via QR codes.
 *
 * Flow:
 *   Device A: createOffer() → show offer QR → scan answer QR → applyAnswer() → connected
 *   Device B: scan offer QR → createAnswer() → show answer QR → Device A scans → connected
 *
 * Data channel carries JSON messages:
 *   { type: 'clock', clock: Record<string,number> }    — handshake
 *   { type: 'delta', payload: string }                 — encrypted SyncDelta (transport key)
 *   { type: 'ack' }                                    — received + applied
 *   { type: 'done' }                                   — both sides finished
 */
import { decodeSDP, encodeSDP } from './qr'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [], // local WiFi — no STUN/TURN needed
}
const CHANNEL_LABEL = 'shillak-sync'
const ICE_TIMEOUT_MS = 5000

/** Device A session — channel already created, just needs remote description. */
export interface WebRTCOfferSession {
  connection: RTCPeerConnection
  channel: RTCDataChannel
  encodedSDP: string
}

/**
 * Device B session — channel arrives via 'datachannel' event AFTER Device A
 * scans the answer QR and completes ICE. Never await channelPromise before
 * showing the answer QR or it will time out.
 */
export interface WebRTCAnswerSession {
  connection: RTCPeerConnection
  channelPromise: Promise<RTCDataChannel>
  encodedSDP: string
}

// ─── Device A — creates offer ─────────────────────────────────────────────────

export async function createOffer(): Promise<WebRTCOfferSession> {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = pc.createDataChannel(CHANNEL_LABEL)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  await waitForICEGathering(pc)

  if (!pc.localDescription) throw new Error('ICE gathering completed but localDescription is null')
  const encodedSDP = encodeSDP(pc.localDescription)
  return { connection: pc, channel, encodedSDP }
}

/** After Device B shows their answer QR — Device A scans and calls this. */
export async function applyAnswer(
  session: WebRTCOfferSession,
  encodedAnswer: string,
): Promise<RTCDataChannel> {
  const answerSDP = decodeSDP(encodedAnswer)
  await session.connection.setRemoteDescription(new RTCSessionDescription(answerSDP))

  // Channel is already created by Device A — return it
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebRTC connection timeout')), 15_000)

    session.channel.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve(session.channel)
    })

    session.connection.addEventListener('connectionstatechange', () => {
      if (
        session.connection.connectionState === 'failed' ||
        session.connection.connectionState === 'closed'
      ) {
        clearTimeout(timeout)
        reject(new Error(`WebRTC connection ${session.connection.connectionState}`))
      }
    })
  })
}

// ─── Device B — receives offer, creates answer ────────────────────────────────

/**
 * Device B: decode the offer QR, create an answer, return immediately.
 * The caller must show encodedSDP as a QR for Device A to scan.
 * Only after Device A scans will channelPromise resolve.
 */
export async function createAnswer(encodedOffer: string): Promise<WebRTCAnswerSession> {
  const offerSDP = decodeSDP(encodedOffer)
  const pc = new RTCPeerConnection(RTC_CONFIG)

  // Set up the datachannel listener BEFORE setRemoteDescription so we don't miss the event.
  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Data channel timeout — did Device A scan the answer QR?')),
      60_000,
    )
    pc.addEventListener('datachannel', (e) => {
      clearTimeout(timeout)
      resolve(e.channel)
    })
  })

  await pc.setRemoteDescription(new RTCSessionDescription(offerSDP))
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)

  await waitForICEGathering(pc)

  if (!pc.localDescription) throw new Error('ICE gathering completed but localDescription is null')
  const encodedSDP = encodeSDP(pc.localDescription)

  // Return WITHOUT awaiting channelPromise — caller shows QR first, then awaits it.
  return { connection: pc, channelPromise, encodedSDP }
}

// ─── Message protocol helpers ─────────────────────────────────────────────────

type SyncMessage =
  | { type: 'clock'; clock: Record<string, number> }
  | { type: 'delta'; payload: string }
  | { type: 'ack' }
  | { type: 'done' }

export function sendMessage(channel: RTCDataChannel, msg: SyncMessage): void {
  channel.send(JSON.stringify(msg))
}

export function waitForMessage(channel: RTCDataChannel): Promise<SyncMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Message timeout')), 30_000)

    function handler(e: MessageEvent) {
      clearTimeout(timeout)
      channel.removeEventListener('message', handler)
      resolve(JSON.parse(e.data as string) as SyncMessage)
    }

    channel.addEventListener('message', handler)
  })
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function waitForICEGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ICE_TIMEOUT_MS)

    function check() {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout)
        pc.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
    }

    pc.addEventListener('icegatheringstatechange', check)
  })
}
