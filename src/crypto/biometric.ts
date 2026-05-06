/**
 * Biometric unlock via WebAuthn PRF extension.
 *
 * Flow:
 *   Register: create platform credential → get PRF output → derive wrap key
 *             → encrypt PIN with wrap key → store credentialId + iv + encryptedPin in keystore
 *
 *   Unlock:   get assertion for stored credential → get same PRF output → derive same wrap key
 *             → decrypt PIN → PBKDF2(PIN, salt) → AES key (normal unlock path)
 *
 * PRF output is deterministic per credential + salt, only available after biometric verification.
 * The PIN is never stored plaintext — only AES-GCM ciphertext keyed from the PRF output.
 */

import { fromBase64, toBase64 } from '@/crypto/encrypt'
import { verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'
import type { KeystoreRecord } from '@/db/schema'

// Deterministic PRF evaluation input — app-specific, version-locked
const PRF_INFO = new TextEncoder().encode('shillak-pin-wrap-v1')

// ─── Feature detection ────────────────────────────────────────────────────────

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
}

// ─── Register ────────────────────────────────────────────────────────────────

export async function registerBiometric(pin: string, userId: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: location.hostname, name: 'Shillak' },
      user: {
        id: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>,
        name: 'shillak-user',
        displayName: 'Shillak',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged', // don't sync to Google/iCloud Password Manager
      },
      extensions: { prf: { eval: { first: PRF_INFO } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null

  if (!credential) throw new Error('Biometric registration cancelled')

  // biome-ignore lint/suspicious/noExplicitAny: PRF extension not yet in TS DOM types
  const prfOutput: ArrayBuffer | undefined = (credential.getClientExtensionResults() as any).prf
    ?.results?.first

  if (!prfOutput) {
    throw new Error(
      'Biometric unlock requires Chrome 116+ or Edge 116+. Not supported on this browser.',
    )
  }

  const wrapKey = await deriveWrapKey(prfOutput)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedPin = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    new TextEncoder().encode(pin),
  )

  await db.keystoreTable.update(1, {
    biometricCredentialId: toBase64(new Uint8Array(credential.rawId)),
    biometricIv: toBase64(iv),
    biometricEncryptedPin: toBase64(new Uint8Array(encryptedPin)),
  })
}

// ─── Unlock ───────────────────────────────────────────────────────────────────

export async function unlockWithBiometric(ks: KeystoreRecord): Promise<CryptoKey> {
  if (!ks.biometricCredentialId || !ks.biometricIv || !ks.biometricEncryptedPin) {
    throw new Error('No biometric credential enrolled')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))

  // biome-ignore lint/suspicious/noExplicitAny: PRF extension not yet in TS DOM types
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        { type: 'public-key', id: fromBase64(ks.biometricCredentialId) as Uint8Array<ArrayBuffer> },
      ],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_INFO } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw new Error('Biometric authentication cancelled')

  // biome-ignore lint/suspicious/noExplicitAny: PRF extension not yet in TS DOM types
  const prfOutput: ArrayBuffer | undefined = (assertion.getClientExtensionResults() as any).prf
    ?.results?.first

  if (!prfOutput) throw new Error('Biometric authentication failed — PRF output unavailable')

  const wrapKey = await deriveWrapKey(prfOutput)
  const pinBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ks.biometricIv) as Uint8Array<ArrayBuffer> },
    wrapKey,
    fromBase64(ks.biometricEncryptedPin) as Uint8Array<ArrayBuffer>,
  )
  const pin = new TextDecoder().decode(pinBytes)

  return verifyPin(pin, ks.salt, ks.pinCheck)
}

// ─── Disable ──────────────────────────────────────────────────────────────────

export async function disableBiometric(): Promise<void> {
  await db.keystoreTable.update(1, {
    biometricCredentialId: null,
    biometricIv: null,
    biometricEncryptedPin: null,
  })
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function deriveWrapKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('shillak-biometric-wrap-v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
