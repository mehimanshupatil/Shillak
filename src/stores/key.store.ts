// Session-only store — NEVER add zustand/middleware/persist here.
// CryptoKey is non-extractable and must never be serialized.
import { create } from 'zustand'

interface KeyStore {
  key: CryptoKey | null
  setKey: (k: CryptoKey) => void
  clearKey: () => void
}

const useKeyStore = create<KeyStore>((set) => ({
  key: null,
  setKey: (key) => set({ key }),
  clearKey: () => set({ key: null }),
}))

/** Read key outside React (for use in db.ts / crypto helpers). */
export function getKey(): CryptoKey | null {
  return useKeyStore.getState().key
}

export default useKeyStore
