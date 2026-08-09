/**
 * Maps a thrown error to user-facing sync copy. Matches against message text
 * thrown deep inside webrtc.ts/conflict.ts/transport.ts — genuinely coupled to
 * their wording, but concentrated here in one tested place instead of inline
 * in SyncSheet's component code.
 */
export function getSyncErrorMessage(e: unknown): string {
  const msg = String(e)
  if (msg.includes('not in the same')) return msg
  if (msg.includes('OperationError') || msg.includes('decrypt'))
    return 'Decryption failed — both devices must be in the same space. Make sure you joined via an invite QR, not by creating a separate space.'
  if (msg.includes('RTCPeerConnection') || msg.includes('ICE') || msg.includes('WebRTC connection'))
    return 'Connection failed — make sure both devices are on the same WiFi network and try again.'
  if (msg.includes('Data channel timeout'))
    return 'Connection timed out — the other device did not complete the QR scan. Try again.'
  if (msg.includes('Message timeout'))
    return 'Sync timed out — both devices must stay on the sync screen until complete.'
  if (msg.includes('InvalidStateError')) return 'Connection closed unexpectedly. Try again.'
  if (msg.includes('Expected clock') || msg.includes('Expected delta'))
    return 'Sync handshake failed. Try again — both devices must stay on the sync screen.'
  if (msg.includes('Group not found'))
    return 'Space not found — make sure both devices have the same space open before syncing.'
  return `Sync failed: ${msg}`
}
