import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStoragePersisted, requestPersistentStorage } from '../storagePersistence'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPersistentStorage', () => {
  it('returns the result of navigator.storage.persist()', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } })
    expect(await requestPersistentStorage()).toBe(true)
  })

  it('returns false when the Persistent Storage API is unavailable', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    expect(await requestPersistentStorage()).toBe(false)
  })
})

describe('isStoragePersisted', () => {
  it('returns the result of navigator.storage.persisted()', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(true) } })
    expect(await isStoragePersisted()).toBe(true)
  })

  it('returns false when the Persistent Storage API is unavailable', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    expect(await isStoragePersisted()).toBe(false)
  })
})
