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
const ICE_TIMEOUT_MS = 8000

// ─── Debug logger ─────────────────────────────────────────────────────────────

function log(role: string, ...args: unknown[]) {
  console.log(`[WebRTC:${role}]`, ...args)
}

function attachConnectionLogs(pc: RTCPeerConnection, role: string) {
  pc.addEventListener('icecandidate', (e) => {
    log(
      role,
      'icecandidate',
      e.candidate ? `${e.candidate.type} ${e.candidate.address}` : 'null (gathering done)',
    )
  })
  pc.addEventListener('icegatheringstatechange', () => {
    log(role, 'iceGatheringState →', pc.iceGatheringState)
  })
  pc.addEventListener('iceconnectionstatechange', () => {
    log(role, 'iceConnectionState →', pc.iceConnectionState)
  })
  pc.addEventListener('connectionstatechange', () => {
    log(role, 'connectionState →', pc.connectionState)
  })
  pc.addEventListener('signalingstatechange', () => {
    log(role, 'signalingState →', pc.signalingState)
  })
}

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
  log('A', 'createOffer start')
  const pc = new RTCPeerConnection(RTC_CONFIG)
  attachConnectionLogs(pc, 'A')

  const channel = pc.createDataChannel(CHANNEL_LABEL)
  log('A', 'data channel created:', channel.label)
  channel.addEventListener('open', () => log('A', 'channel OPEN'))
  channel.addEventListener('close', () => log('A', 'channel CLOSED'))
  channel.addEventListener('error', (e) => log('A', 'channel ERROR', e))

  const offer = await pc.createOffer()
  log('A', 'offer created, type:', offer.type)
  await pc.setLocalDescription(offer)
  log('A', 'setLocalDescription done, gathering ICE…')

  await waitForICEGathering(pc)
  log('A', 'ICE gathering complete, state:', pc.iceGatheringState)

  if (!pc.localDescription) throw new Error('ICE gathering completed but localDescription is null')

  const encodedSDP = encodeSDP(pc.localDescription)
  log('A', 'encoded SDP length:', encodedSDP.length, 'chars')
  return { connection: pc, channel, encodedSDP }
}

/** After Device B shows their answer QR — Device A scans and calls this. */
export async function applyAnswer(
  session: WebRTCOfferSession,
  encodedAnswer: string,
): Promise<RTCDataChannel> {
  log('A', 'applyAnswer — decoding answer SDP, encoded length:', encodedAnswer.length)
  const answerSDP = decodeSDP(encodedAnswer)
  log('A', 'answer SDP decoded, type:', answerSDP.type, 'sdp length:', answerSDP.sdp?.length)
  await session.connection.setRemoteDescription(new RTCSessionDescription(answerSDP))
  log('A', 'setRemoteDescription done, signalingState:', session.connection.signalingState)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      log('A', 'channel open TIMEOUT, connectionState:', session.connection.connectionState)
      reject(new Error('WebRTC connection timeout'))
    }, 20_000)

    session.channel.addEventListener('open', () => {
      clearTimeout(timeout)
      log('A', 'channel opened — ready to sync')
      resolve(session.channel)
    })

    session.connection.addEventListener('connectionstatechange', () => {
      const s = session.connection.connectionState
      log('A', 'connectionState in applyAnswer:', s)
      if (s === 'failed' || s === 'closed') {
        clearTimeout(timeout)
        reject(new Error(`WebRTC connection ${s}`))
      }
    })
  })
}

// ─── Device B — receives offer, creates answer ────────────────────────────────

export async function createAnswer(encodedOffer: string): Promise<WebRTCAnswerSession> {
  log('B', 'createAnswer — decoding offer SDP, encoded length:', encodedOffer.length)
  const offerSDP = decodeSDP(encodedOffer)
  log('B', 'offer SDP decoded, type:', offerSDP.type, 'sdp length:', offerSDP.sdp?.length)

  const pc = new RTCPeerConnection(RTC_CONFIG)
  attachConnectionLogs(pc, 'B')

  // Set up datachannel listener BEFORE setRemoteDescription.
  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = setTimeout(() => {
      log('B', 'datachannel TIMEOUT — Device A may not have scanned the answer QR')
      reject(new Error('Data channel timeout — did Device A scan the answer QR?'))
    }, 60_000)

    pc.addEventListener('datachannel', (e) => {
      clearTimeout(timeout)
      const ch = e.channel
      log('B', 'datachannel received:', ch.label, 'readyState:', ch.readyState)
      ch.addEventListener('open', () => log('B', 'channel OPEN'))
      ch.addEventListener('close', () => log('B', 'channel CLOSED'))
      ch.addEventListener('error', (ev) => log('B', 'channel ERROR', ev))
      resolve(ch)
    })
  })

  await pc.setRemoteDescription(new RTCSessionDescription(offerSDP))
  log('B', 'setRemoteDescription done, signalingState:', pc.signalingState)

  const answer = await pc.createAnswer()
  log('B', 'answer created, type:', answer.type)
  await pc.setLocalDescription(answer)
  log('B', 'setLocalDescription done, gathering ICE…')

  await waitForICEGathering(pc)
  log('B', 'ICE gathering complete, state:', pc.iceGatheringState)

  if (!pc.localDescription) throw new Error('ICE gathering completed but localDescription is null')

  const encodedSDP = encodeSDP(pc.localDescription)
  log('B', 'encoded answer SDP length:', encodedSDP.length, 'chars')

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
  log('msg', '→ send', msg.type)
  channel.send(JSON.stringify(msg))
}

/**
 * Buffered message queue — attach to channel immediately when it opens so no
 * messages are lost in the gap between successive waitForMessage calls.
 *
 * Root cause of "Expected clock message" bug: the one-shot addEventListener
 * approach drops messages that arrive while no listener is attached (between
 * the previous removeEventListener and the next addEventListener call).
 */
export interface MessageQueue {
  waitForMessage(): Promise<SyncMessage>
}

export function createMessageQueue(channel: RTCDataChannel): MessageQueue {
  const buffer: SyncMessage[] = []
  const pending: Array<{
    resolve: (m: SyncMessage) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  channel.addEventListener('message', (e: MessageEvent) => {
    const msg = JSON.parse(e.data as string) as SyncMessage
    log('msg', '← recv (queued)', msg.type)
    if (pending.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: checked length above
      const waiter = pending.shift()!
      clearTimeout(waiter.timer)
      waiter.resolve(msg)
    } else {
      buffer.push(msg)
    }
  })

  return {
    waitForMessage(): Promise<SyncMessage> {
      if (buffer.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: checked length above
        const msg = buffer.shift()!
        log('msg', '← dequeue (buffered)', msg.type)
        return Promise.resolve(msg)
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = pending.findIndex((p) => p.resolve === resolve)
          if (idx !== -1) pending.splice(idx, 1)
          log('msg', 'waitForMessage TIMEOUT')
          reject(new Error('Message timeout'))
        }, 30_000)
        pending.push({ resolve, reject, timer })
      })
    },
  }
}

/** @deprecated Use createMessageQueue instead — this one-shot variant can miss messages. */
export function waitForMessage(channel: RTCDataChannel): Promise<SyncMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      log('msg', 'waitForMessage TIMEOUT')
      reject(new Error('Message timeout'))
    }, 30_000)

    function handler(e: MessageEvent) {
      clearTimeout(timeout)
      channel.removeEventListener('message', handler)
      const msg = JSON.parse(e.data as string) as SyncMessage
      log('msg', '← recv', msg.type)
      resolve(msg)
    }

    channel.addEventListener('message', handler)
  })
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function waitForICEGathering(pc: RTCPeerConnection): Promise<void> {
  log('ice', 'waitForICEGathering, current state:', pc.iceGatheringState)
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log('ice', `timeout after ${ICE_TIMEOUT_MS}ms, state:`, pc.iceGatheringState)
      resolve()
    }, ICE_TIMEOUT_MS)

    function check() {
      log('ice', 'state change →', pc.iceGatheringState)
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout)
        pc.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
    }

    pc.addEventListener('icegatheringstatechange', check)
  })
}
