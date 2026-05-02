/** AES-GCM encrypt/decrypt helpers. IV is 12 random bytes prepended to ciphertext. */

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(
    atob(b64)
      .split('')
      .map((c) => c.charCodeAt(0)),
  )
}

/** Encrypt a UTF-8 string. Returns base64(iv + ciphertext). */
export async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return toBase64(combined)
}

/** Decrypt a base64(iv + ciphertext) string. Returns plaintext. */
export async function decryptString(b64: string, key: CryptoKey): Promise<string> {
  const combined = fromBase64(b64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

/** Encrypt a JS object. Returns base64 ciphertext. */
export async function encryptRecord<T>(record: T, key: CryptoKey): Promise<string> {
  return encryptString(JSON.stringify(record), key)
}

/** Decrypt a base64 ciphertext back to a JS object. */
export async function decryptRecord<T>(ciphertext: string, key: CryptoKey): Promise<T> {
  const json = await decryptString(ciphertext, key)
  return JSON.parse(json) as T
}
