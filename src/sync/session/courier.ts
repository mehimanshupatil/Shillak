import type { SyncMessage } from '@/sync/webrtc'
import { createMessageQueue, sendMessage } from '@/sync/webrtc'

/**
 * How the messages of a Sync session cross between two devices.
 *
 * The two WebRTC roles expose different shapes — the offerer holds a channel,
 * the answerer holds a promise for one — which forced every caller to know
 * which role it was in before it could do anything. A Courier presents one
 * shape, so the protocol above it doesn't know or care.
 */
export interface Courier {
  send(message: SyncMessage): void
  receive(): Promise<SyncMessage>
  /** Tears down the underlying connection. Safe to call more than once. */
  close(): void
}

/** A Courier over an open WebRTC data channel. */
export function webrtcCourier(channel: RTCDataChannel, connection: RTCPeerConnection): Courier {
  const queue = createMessageQueue(channel)
  let closed = false

  return {
    send: (message) => sendMessage(channel, message),
    receive: () => queue.waitForMessage(),
    close() {
      if (closed) return
      closed = true
      // Closing the channel alone leaves the peer connection and its ICE
      // machinery alive — which is how a cancelled sync used to leak one.
      try {
        channel.close()
      } catch {
        /* already closed */
      }
      try {
        connection.close()
      } catch {
        /* already closed */
      }
    },
  }
}

/**
 * Two Couriers wired to each other, for exercising a session without a network.
 * The second adapter at this seam — and the reason the seam is worth having.
 */
export function memoryCourierPair(): [Courier, Courier] {
  const inboxes: [SyncMessage[], SyncMessage[]] = [[], []]
  const waiters: [Array<(m: SyncMessage) => void>, Array<(m: SyncMessage) => void>] = [[], []]
  let closed = false

  function make(self: 0 | 1): Courier {
    const other = (1 - self) as 0 | 1
    return {
      send(message) {
        if (closed) throw new Error('Courier is closed')
        const waiter = waiters[other].shift()
        if (waiter) waiter(message)
        else inboxes[other].push(message)
      },
      receive() {
        const buffered = inboxes[self].shift()
        if (buffered) return Promise.resolve(buffered)
        return new Promise((resolve) => waiters[self].push(resolve))
      },
      close() {
        closed = true
      },
    }
  }

  return [make(0), make(1)]
}
