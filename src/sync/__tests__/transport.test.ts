import { describe, expect, it } from 'vitest'
import { decryptPayload, deriveTransportKey, encryptPayload } from '../transport'

async function testKey(secretByte = 1): Promise<CryptoKey> {
  const raw = new Uint8Array(32).fill(secretByte)
  let bin = ''
  for (const b of raw) bin += String.fromCharCode(b)
  const groupSecret = btoa(bin)
  return deriveTransportKey(groupSecret)
}

describe('encryptPayload / decryptPayload', () => {
  it('round-trips a plain object', async () => {
    const key = await testKey()
    const payload = { hello: 'world', amount: 12345, nested: { a: [1, 2, 3] } }
    const encrypted = await encryptPayload(payload, key)
    expect(await decryptPayload(encrypted, key)).toEqual(payload)
  })

  it('round-trips a large repetitive payload (exercises the compression path)', async () => {
    const key = await testKey()
    const payload = {
      transactions: Array.from({ length: 200 }, (_, i) => ({
        txnId: `txn-${i}`,
        amount: 10000,
        note: 'Groceries',
        currency: 'INR',
      })),
    }
    const encrypted = await encryptPayload(payload, key)
    expect(await decryptPayload(encrypted, key)).toEqual(payload)
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await testKey()
    const a = await encryptPayload({ x: 1 }, key)
    const b = await encryptPayload({ x: 1 }, key)
    expect(a).not.toBe(b)
  })

  it('fails to decrypt with a key derived from a different group secret', async () => {
    const keyA = await testKey(1)
    const keyB = await testKey(2)
    const encrypted = await encryptPayload({ x: 1 }, keyA)
    await expect(decryptPayload(encrypted, keyB)).rejects.toThrow(
      'the two devices are not in the same space',
    )
  })

  it('fails to decrypt tampered ciphertext with the friendly not-same-space error', async () => {
    const key = await testKey()
    const encrypted = await encryptPayload({ x: 1 }, key)
    const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0xff
    let tamperedBin = ''
    for (const b of bytes) tamperedBin += String.fromCharCode(b)
    const tampered = btoa(tamperedBin)
    await expect(decryptPayload(tampered, key)).rejects.toThrow(
      'the two devices are not in the same space',
    )
  })
})

describe('deriveTransportKey', () => {
  it('derives the same key for the same group secret (decryptable round trip across two derivations)', async () => {
    const raw = new Uint8Array(32).fill(7)
    let bin = ''
    for (const b of raw) bin += String.fromCharCode(b)
    const groupSecret = btoa(bin)
    const keyA = await deriveTransportKey(groupSecret)
    const keyB = await deriveTransportKey(groupSecret)
    const encrypted = await encryptPayload({ probe: true }, keyA)
    expect(await decryptPayload(encrypted, keyB)).toEqual({ probe: true })
  })
})
