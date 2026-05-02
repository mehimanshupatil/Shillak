import { decryptString, encryptString, fromBase64, toBase64 } from './encrypt'
import { deriveKey } from './pin'

const PIN_CHECK_PLAINTEXT = 'SHILLAK_V1'
const LOCK_CHANNEL = new BroadcastChannel('shillak-lock')

export type LockMessage = { type: 'lock' } | { type: 'unlock' }

/** Set up cross-tab lock/unlock listener. Call once at app boot. */
export function initLockChannel(onLock: () => void, onUnlock?: () => void): () => void {
  const handler = (e: MessageEvent<LockMessage>) => {
    if (e.data.type === 'lock') onLock()
    if (e.data.type === 'unlock' && onUnlock) onUnlock()
  }
  LOCK_CHANNEL.addEventListener('message', handler)
  return () => LOCK_CHANNEL.removeEventListener('message', handler)
}

export function broadcastLock() {
  LOCK_CHANNEL.postMessage({ type: 'lock' } satisfies LockMessage)
}

export function broadcastUnlock() {
  LOCK_CHANNEL.postMessage({ type: 'unlock' } satisfies LockMessage)
}

/** Create keystore entry for a new PIN. Returns the derived CryptoKey. */
export async function createKeystore(
  pin: string,
): Promise<{ key: CryptoKey; salt: string; pinCheck: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const key = await deriveKey(pin, salt)
  const pinCheck = await encryptString(PIN_CHECK_PLAINTEXT, key)
  return { key, salt: toBase64(salt), pinCheck }
}

/** Verify a PIN against stored keystore data. Throws if wrong. Returns CryptoKey. */
export async function verifyPin(
  pin: string,
  saltB64: string,
  pinCheckB64: string,
): Promise<CryptoKey> {
  const key = await deriveKey(pin, fromBase64(saltB64))
  // Will throw DOMException if PIN is wrong (decryption failure)
  const verified = await decryptString(pinCheckB64, key)
  if (verified !== PIN_CHECK_PLAINTEXT) throw new Error('Wrong PIN')
  return key
}
