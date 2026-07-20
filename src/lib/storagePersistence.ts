/**
 * Requests the Persistent Storage API so the browser is less likely to
 * silently evict IndexedDB under storage pressure. Best-effort — browsers
 * grant/deny based on their own heuristics (PWA install status, engagement,
 * bookmarks, etc), there's no user-facing permission prompt for this API.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}
