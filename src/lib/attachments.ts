export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export function isAttachmentTooLarge(sizeBytes: number): boolean {
  return sizeBytes > MAX_ATTACHMENT_BYTES
}

export interface QuotaStatus {
  blocked: boolean
  warn: boolean
}

/** Pure quota-threshold logic — separated from navigator.storage.estimate() so it's testable. */
export function evaluateStorageQuota(
  usage: number | undefined,
  quota: number | undefined,
): QuotaStatus {
  if (!quota || quota === 0) return { blocked: false, warn: false }
  const pct = (usage ?? 0) / quota
  return { blocked: pct >= 0.9, warn: pct >= 0.8 }
}

export async function checkStorageQuota(): Promise<QuotaStatus> {
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return evaluateStorageQuota(usage, quota)
  } catch {
    return { blocked: false, warn: false }
  }
}
