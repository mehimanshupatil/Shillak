import { describe, expect, it } from 'vitest'
import { decryptString, encryptString } from '../encrypt'
import { deriveKey } from '../pin'

describe('deriveKey', () => {
  it('derives the same key for the same PIN + salt (decryptable round trip)', async () => {
    const salt = new Uint8Array(16).fill(7)
    const keyA = await deriveKey('1234', salt)
    const keyB = await deriveKey('1234', salt)
    const cipher = await encryptString('probe', keyA)
    expect(await decryptString(cipher, keyB)).toBe('probe')
  })

  it('derives a different key for a different salt', async () => {
    const keyA = await deriveKey('1234', new Uint8Array(16).fill(1))
    const keyB = await deriveKey('1234', new Uint8Array(16).fill(2))
    const cipher = await encryptString('probe', keyA)
    await expect(decryptString(cipher, keyB)).rejects.toThrow()
  })

  it('derives a different key for a different PIN', async () => {
    const salt = new Uint8Array(16).fill(7)
    const keyA = await deriveKey('1234', salt)
    const keyB = await deriveKey('4321', salt)
    const cipher = await encryptString('probe', keyA)
    await expect(decryptString(cipher, keyB)).rejects.toThrow()
  })
})
