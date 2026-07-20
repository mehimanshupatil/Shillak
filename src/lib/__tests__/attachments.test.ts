import { describe, expect, it } from 'vitest'
import { evaluateStorageQuota, isAttachmentTooLarge, MAX_ATTACHMENT_BYTES } from '../attachments'

describe('isAttachmentTooLarge', () => {
  it('rejects a file over 5MB', () => {
    expect(isAttachmentTooLarge(MAX_ATTACHMENT_BYTES + 1)).toBe(true)
  })

  it('accepts a file at exactly the limit', () => {
    expect(isAttachmentTooLarge(MAX_ATTACHMENT_BYTES)).toBe(false)
  })

  it('accepts a small file', () => {
    expect(isAttachmentTooLarge(1024)).toBe(false)
  })
})

describe('evaluateStorageQuota', () => {
  it('blocks at 90% or above', () => {
    expect(evaluateStorageQuota(90, 100)).toEqual({ blocked: true, warn: true })
    expect(evaluateStorageQuota(95, 100)).toEqual({ blocked: true, warn: true })
  })

  it('warns but does not block between 80% and 90%', () => {
    expect(evaluateStorageQuota(85, 100)).toEqual({ blocked: false, warn: true })
  })

  it('neither warns nor blocks below 80%', () => {
    expect(evaluateStorageQuota(50, 100)).toEqual({ blocked: false, warn: false })
  })

  it('treats a missing or zero quota as not blocked (browser gave no usable estimate)', () => {
    expect(evaluateStorageQuota(50, undefined)).toEqual({ blocked: false, warn: false })
    expect(evaluateStorageQuota(50, 0)).toEqual({ blocked: false, warn: false })
  })

  it('treats missing usage as 0', () => {
    expect(evaluateStorageQuota(undefined, 100)).toEqual({ blocked: false, warn: false })
  })
})
