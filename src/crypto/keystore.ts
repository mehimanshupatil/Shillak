import { db } from '@/db/db'
import type { KeystoreRecord } from '@/db/schema'
import { decryptString, encryptString, fromBase64, toBase64 } from './encrypt'
import { deriveKey } from './pin'

const PIN_CHECK_PLAINTEXT = 'SHILLAK_V1'
const LOCK_CHANNEL = new BroadcastChannel('shillak-lock')

type LockMessage = { type: 'lock' } | { type: 'unlock' }

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

export interface UnlockResult {
  key: CryptoKey
  // Set when this unlock also resolved a PIN change interrupted mid-flight
  // (see ChangePinSheet.tsx). 'completed' = re-encryption had finished
  // before the crash, promoted pending -> primary. 'aborted' = it hadn't,
  // reverted to the still-valid old keystore.
  resolvedPinChange?: 'completed' | 'aborted'
}

/**
 * Resume-aware unlock. A plain pinCheck match doesn't prove a key can
 * decrypt real data — it's an independent ciphertext ("SHILLAK_V1") from the
 * data tables. Normally that's fine (both are always written together), but
 * if a PIN change was interrupted between finishing re-encryption and
 * committing the new keystore, pinCheck alone can't tell which state the
 * actual data is in. This empirically confirms the key against a real row
 * before trusting it, and finishes or reverts the interrupted change.
 */
export async function resolveUnlock(pin: string, ks: KeystoreRecord): Promise<UnlockResult> {
  if (!ks.pinChangeInProgress) {
    const key = await verifyPin(pin, ks.salt, ks.pinCheck)
    return { key }
  }

  let key: CryptoKey
  let source: 'primary' | 'pending'
  try {
    key = await verifyPin(pin, ks.salt, ks.pinCheck)
    source = 'primary'
  } catch {
    if (!ks.pendingSalt || !ks.pendingPinCheck) throw new Error('Wrong PIN')
    try {
      key = await verifyPin(pin, ks.pendingSalt, ks.pendingPinCheck)
      source = 'pending'
    } catch {
      throw new Error('Wrong PIN')
    }
  }

  const matchesData = await db.testKeyAgainstAnyData(key)
  if (matchesData === false) {
    throw new Error(
      source === 'primary'
        ? 'PIN change did not finish saving — enter your NEW PIN instead'
        : 'PIN change did not finish saving — enter your OLD PIN instead',
    )
  }
  // matchesData === true, or === null (no data yet to verify against) — trust it.

  if (source === 'pending') {
    // Re-encryption completed before the crash — finish the change.
    await db.keystoreTable.put({
      id: 1,
      salt: ks.pendingSalt as string,
      pinCheck: ks.pendingPinCheck as string,
      pinChangeInProgress: false,
      userId: ks.userId,
      pendingSalt: null,
      pendingPinCheck: null,
    })
    return { key, resolvedPinChange: 'completed' }
  }
  // Re-encryption never happened — old key is still correct, abort the change.
  await db.keystoreTable.put({
    ...ks,
    pinChangeInProgress: false,
    pendingSalt: null,
    pendingPinCheck: null,
  })
  return { key, resolvedPinChange: 'aborted' }
}
