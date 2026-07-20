import { describe, expect, it } from 'vitest'
import { createKeystore, verifyPin } from '../keystore'

describe('createKeystore / verifyPin', () => {
  it('verifies successfully with the correct PIN', async () => {
    const { salt, pinCheck } = await createKeystore('1234')
    const key = await verifyPin('1234', salt, pinCheck)
    expect(key).toBeDefined()
  })

  it('throws on a wrong PIN', async () => {
    const { salt, pinCheck } = await createKeystore('1234')
    await expect(verifyPin('0000', salt, pinCheck)).rejects.toThrow()
  })

  it('two keystores for the same PIN use different salts (and thus different pinCheck ciphertext)', async () => {
    const a = await createKeystore('1234')
    const b = await createKeystore('1234')
    expect(a.salt).not.toBe(b.salt)
  })
})
