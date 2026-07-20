import { describe, expect, it } from 'vitest'
import {
  decryptRecord,
  decryptString,
  encryptRecord,
  encryptString,
  fromBase64,
  toBase64,
} from '../encrypt'
import { deriveKey } from '../pin'

async function testKey(pin = '1234'): Promise<CryptoKey> {
  return deriveKey(pin, new Uint8Array(16))
}

describe('toBase64 / fromBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 42])
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('encryptString / decryptString', () => {
  it('round-trips a UTF-8 string', async () => {
    const key = await testKey()
    const cipher = await encryptString('hello, shillak', key)
    expect(await decryptString(cipher, key)).toBe('hello, shillak')
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await testKey()
    const a = await encryptString('same plaintext', key)
    const b = await encryptString('same plaintext', key)
    expect(a).not.toBe(b)
  })

  it('fails to decrypt with the wrong key', async () => {
    const key = await testKey('1234')
    const wrongKey = await testKey('9999')
    const cipher = await encryptString('secret', key)
    await expect(decryptString(cipher, wrongKey)).rejects.toThrow()
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const key = await testKey()
    const cipher = await encryptString('secret', key)
    const bytes = fromBase64(cipher)
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0xff
    await expect(decryptString(toBase64(bytes), key)).rejects.toThrow()
  })
})

describe('encryptRecord / decryptRecord', () => {
  it('round-trips a JS object', async () => {
    const key = await testKey()
    const record = { txnId: 't1', amount: 12345, tags: ['a', 'b'] }
    const cipher = await encryptRecord(record, key)
    expect(await decryptRecord(cipher, key)).toEqual(record)
  })
})
