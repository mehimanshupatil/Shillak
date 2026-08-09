import { describe, expect, it } from 'vitest'
import { getSyncErrorMessage } from '../syncErrors'

describe('getSyncErrorMessage', () => {
  it('passes through a "not in the same" message verbatim', () => {
    expect(getSyncErrorMessage('Devices are not in the same space')).toBe(
      'Devices are not in the same space',
    )
  })

  it('maps a decrypt/OperationError failure to a space-mismatch message', () => {
    expect(getSyncErrorMessage(new Error('OperationError'))).toContain('Decryption failed')
    expect(getSyncErrorMessage(new Error('failed to decrypt'))).toContain('Decryption failed')
  })

  it('maps an RTCPeerConnection/ICE/WebRTC failure to a connection message', () => {
    expect(getSyncErrorMessage(new Error('RTCPeerConnection closed'))).toContain(
      'Connection failed',
    )
    expect(getSyncErrorMessage(new Error('ICE connection failed'))).toContain('Connection failed')
    expect(getSyncErrorMessage(new Error('WebRTC connection lost'))).toContain('Connection failed')
  })

  it('maps a data channel timeout to a scan-timeout message', () => {
    expect(getSyncErrorMessage(new Error('Data channel timeout'))).toContain('Connection timed out')
  })

  it('maps a message timeout to a stay-on-screen message', () => {
    expect(getSyncErrorMessage(new Error('Message timeout'))).toContain('Sync timed out')
  })

  it('maps InvalidStateError to a connection-closed message', () => {
    expect(getSyncErrorMessage(new Error('InvalidStateError'))).toBe(
      'Connection closed unexpectedly. Try again.',
    )
  })

  it('maps a handshake mismatch (Expected clock/delta) to a handshake-failed message', () => {
    expect(getSyncErrorMessage(new Error('Expected clock message, got: delta'))).toContain(
      'handshake failed',
    )
    expect(getSyncErrorMessage(new Error('Expected delta message, got: done'))).toContain(
      'handshake failed',
    )
  })

  it('maps "Group not found" to a space-not-found message', () => {
    expect(getSyncErrorMessage(new Error('Group not found'))).toContain('Space not found')
  })

  it('falls back to a generic "Sync failed" message for anything unrecognized', () => {
    expect(getSyncErrorMessage(new Error('something weird'))).toBe(
      'Sync failed: Error: something weird',
    )
  })

  it('handles non-Error thrown values via String()', () => {
    expect(getSyncErrorMessage('a plain string')).toBe('Sync failed: a plain string')
  })
})
