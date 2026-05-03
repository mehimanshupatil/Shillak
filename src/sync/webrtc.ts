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

export interface WebRTCSession {
  connection: RTCPeerConnection
  channel: RTCDataChannel
  /** Encoded SDP string — display as QR */
  encodedSDP: string
}

// ─── Device A — creates offer ─────────────────────────────────────────────────

export async function createOffer(): Promise<WebRTCSession> {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = pc.createDataChannel(CHANNEL_LABEL)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // Wait for ICE gathering to complete
  await waitForICEGathering(pc)

  if (!pc.localDescription) throw new Error('ICE gathering completed but localDescription is null')
  const encodedSDP = encodeSDP(pc.localDescription)
  return { connection: pc, channel, encodedSDP }
}

/** After Device B shows their answer QR — Device A scans and calls this. */
export async function applyAnswer(
  session: WebRTCSession,
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

export async function createAnswer(encodedOffer: string): Promise<WebRTCSession> {
  const offerSDP = decodeSDP(encodedOffer)
  const pc = new RTCPeerConnection(RTC_CONFIG)

  // Device B receives the channel
  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Data channel timeout')), 15_000)
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
  const channel = await channelPromise

  return { connection: pc, channel, encodedSDP }
}

// ─── Message protocol helpers ─────────────────────────────────────────────────

export type SyncMessage =
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

/** Wait for all messages until 'done' — collects them in order. */
export function collectMessages(channel: RTCDataChannel): Promise<SyncMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: SyncMessage[] = []
    const timeout = setTimeout(() => reject(new Error('Sync session timeout')), 60_000)

    function handler(e: MessageEvent) {
      const msg = JSON.parse(e.data as string) as SyncMessage
      messages.push(msg)
      if (msg.type === 'done') {
        clearTimeout(timeout)
        channel.removeEventListener('message', handler)
        resolve(messages)
      }
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
