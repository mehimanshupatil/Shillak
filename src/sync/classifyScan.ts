import { isInvite } from '@/sync/invite'
import type { ClockEnvelope, QRChunkEnvelope } from '@/sync/qr'
import { decodeChunk, decodeClockQR, isChunk, isClockQR, isSDP } from '@/sync/qr'

/**
 * What a scanned QR turned out to be.
 *
 * Four wire formats travel over the camera, and every call site used to try one
 * discriminator and `return` on a miss — so scanning the wrong code did nothing
 * at all, indistinguishable from a camera that hadn't read anything. One
 * classifier means a caller switches on `kind`, the compiler checks the switch
 * is complete, and `unrecognised` is a state the UI can actually show.
 */
export type Scan =
  | { kind: 'sdp'; encoded: string }
  | { kind: 'clock'; envelope: ClockEnvelope }
  | { kind: 'chunk'; envelope: QRChunkEnvelope }
  | { kind: 'invite'; encoded: string }
  | { kind: 'unrecognised' }

/**
 * Names a scanned string. Never throws: a malformed code of a known shape is
 * `unrecognised` like anything else, because to the person holding the phone
 * there is no difference.
 */
export function classifyScan(scanned: string): Scan {
  const text = scanned.trim()
  if (!text) return { kind: 'unrecognised' }

  if (isSDP(text)) return { kind: 'sdp', encoded: text }

  if (isClockQR(text)) {
    try {
      return { kind: 'clock', envelope: decodeClockQR(text) }
    } catch {
      return { kind: 'unrecognised' }
    }
  }

  if (isChunk(text)) {
    try {
      return { kind: 'chunk', envelope: decodeChunk(text) }
    } catch {
      return { kind: 'unrecognised' }
    }
  }

  if (isInvite(text)) return { kind: 'invite', encoded: text }

  return { kind: 'unrecognised' }
}

/** What to tell someone who scanned something this flow can't use. */
export function unexpectedScanMessage(scan: Scan, expected: Scan['kind']): string {
  if (scan.kind === 'unrecognised') return "That QR isn't a Shillak code."
  const names: Record<Exclude<Scan['kind'], 'unrecognised'>, string> = {
    sdp: 'a WiFi sync code',
    clock: 'a sync-state code',
    chunk: 'a data chunk',
    invite: 'a space invite',
  }
  return `That's ${names[scan.kind]}, not ${names[expected as Exclude<Scan['kind'], 'unrecognised'>]}.`
}
