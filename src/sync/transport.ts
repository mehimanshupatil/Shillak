/**
 * Sync transport encryption.
 * Key derived from group_secret via HKDF — independent of the device AES key.
 * Both devices in a group share group_secret, so both can decrypt each other's payloads.
 */
import { fromBase64, toBase64 } from '@/crypto/encrypt'

const INFO = new TextEncoder().encode('shillak-sync-v1')

export async function deriveTransportKey(groupSecret: string): Promise<CryptoKey> {
  const raw = fromBase64(groupSecret)
  const base = await crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt a JS object with the transport key. Returns base64(iv+ciphertext). */
export async function encryptPayload(payload: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return toBase64(combined)
}

/** Decrypt a base64(iv+ciphertext) back to a JS object. */
export async function decryptPayload<T>(b64: string, key: CryptoKey): Promise<T> {
  const combined = fromBase64(b64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
