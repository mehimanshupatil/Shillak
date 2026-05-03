/**
 * 3-tab sync sheet:
 *   Tab 1 — Local WiFi (WebRTC via QR SDP exchange)
 *   Tab 2 — QR Batch (chunked carousel, unidirectional)
 *   Tab 3 — History (last SyncEvent records)
 *
 * WiFi flow (initiator = Device A):
 *   1. Tap "Start sync" → createOffer() → show offer QR
 *   2. After Device B shows answer QR → scan it → connected
 *   3. Exchange vector clocks → compute delta → encrypt → send
 *   4. Receive their delta → apply → show result
 *
 * WiFi flow (joiner = Device B):
 *   1. Tap "Scan offer QR" → scan Device A's QR
 *   2. createAnswer() → show answer QR
 *   3. Connection auto-establishes after Device A scans → same exchange
 *
 * QR Batch (export side):
 *   1. Tap "Export QR" → compute full snapshot → encrypt → chunk
 *   2. Show carousel — swipe through chunks
 *
 * QR Batch (import side):
 *   1. Tap "Scan QR chunks" → scanner → collect all chunks → reassemble → apply
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Loader2, QrCode, Wifi } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import useAppStore from '@/stores/app.store'
import { applyDelta } from '@/sync/conflict'
import type { QRChunkEnvelope } from '@/sync/qr'
import { chunkPayload, decodeChunk, encodeChunk, isChunk, isSDP, reassembleChunks } from '@/sync/qr'
import { decryptPayload, deriveTransportKey, encryptPayload } from '@/sync/transport'
import type { SyncDelta } from '@/sync/vector-clock'
import { computeDelta } from '@/sync/vector-clock'
import type { WebRTCSession } from '@/sync/webrtc'
import { applyAnswer, createAnswer, createOffer, sendMessage, waitForMessage } from '@/sync/webrtc'
import ConflictResolver from './ConflictResolver'
import QRDisplay from './QRDisplay'
import QRScanner from './QRScanner'

type Tab = 'wifi' | 'qr' | 'history'

// WiFi sub-states
type WiFiState =
  | { step: 'idle' }
  | { step: 'offering'; session: WebRTCSession }
  | { step: 'scan-answer'; session: WebRTCSession }
  | { step: 'scanning-offer' }
  | { step: 'answering'; encodedAnswer: string }
  | { step: 'syncing' }
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }

// QR batch sub-states
type QRBatchState =
  | { step: 'idle' }
  | { step: 'exporting'; chunks: string[]; chunkIndex: number }
  | { step: 'scanning'; collected: Map<number, QRChunkEnvelope>; total: number | null }
  | { step: 'done'; applied: number }
  | { step: 'error'; message: string }

interface Props {
  open: boolean
  onClose: () => void
}

export default function SyncSheet({ open, onClose }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [tab, setTab] = useState<Tab>('wifi')
  const [wifi, setWifi] = useState<WiFiState>({ step: 'idle' })
  const [qrBatch, setQRBatch] = useState<QRBatchState>({ step: 'idle' })

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const syncHistory = useLiveQuery(
    () =>
      activeGroupId
        ? db.syncEvents
            .where((e) => e.groupId === activeGroupId)
            .then((evts) => evts.sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 10))
        : [],
    [activeGroupId],
  )

  // ── Sync protocol — runs on both devices after channel opens ─────────────
  const runSyncProtocol = useCallback(
    async (channel: RTCDataChannel, method: 'webrtc' | 'qr') => {
      if (!activeGroupId || !currentUserId || !group) return

      try {
        const transportKey = await deriveTransportKey(group.groupSecret)
        const myDelta = await computeDelta(activeGroupId, {}, currentUserId)

        // 1. Send my clock
        sendMessage(channel, { type: 'clock', clock: myDelta.vectorClock })

        // 2. Receive their clock
        const clockMsg = await waitForMessage(channel)
        if (clockMsg.type !== 'clock') throw new Error('Expected clock message')
        const theirClock = clockMsg.clock

        // 3. Re-compute delta based on what they already know
        const delta = await computeDelta(activeGroupId, theirClock, currentUserId)

        // 4. Send encrypted delta
        const encrypted = await encryptPayload(delta, transportKey)
        sendMessage(channel, { type: 'delta', payload: encrypted })

        // 5. Receive their delta
        const deltaMsg = await waitForMessage(channel)
        if (deltaMsg.type !== 'delta') throw new Error('Expected delta message')
        const theirDelta = await decryptPayload<SyncDelta>(deltaMsg.payload, transportKey)

        // 6. Apply their delta
        const syncId = crypto.randomUUID()
        const result = await applyDelta(theirDelta, activeGroupId, syncId, method, currentUserId)

        // 7. Ack + done
        sendMessage(channel, { type: 'ack' })
        sendMessage(channel, { type: 'done' })

        // Update sent count on sync event
        await db.syncEvents.update(syncId, {
          recordsSent: delta.transactions.length + delta.categories.length,
        })

        setWifi({ step: 'done', applied: result.recordsApplied, conflicts: result.conflictsFound })
        channel.close()
      } catch (e) {
        setWifi({ step: 'error', message: String(e) })
        channel.close()
      }
    },
    [activeGroupId, currentUserId, group],
  )

  // ── WiFi: Device A creates offer ─────────────────────────────────────────
  async function handleStartOffer() {
    if (!activeGroupId || !currentUserId || !group) return
    try {
      const session = await createOffer()
      setWifi({ step: 'offering', session })
    } catch (e) {
      setWifi({ step: 'error', message: String(e) })
    }
  }

  function handleReadyToScanAnswer() {
    if (wifi.step !== 'offering') return
    setWifi({ step: 'scan-answer', session: wifi.session })
  }

  const handleScanAnswer = useCallback(
    async (scanned: string) => {
      if (wifi.step !== 'scan-answer' || !activeGroupId || !currentUserId || !group) return
      if (!isSDP(scanned)) return

      setWifi({ step: 'syncing' })
      try {
        const channel = await applyAnswer(wifi.session, scanned)
        await runSyncProtocol(channel, 'webrtc')
      } catch (e) {
        setWifi({ step: 'error', message: String(e) })
      }
    },
    [wifi, activeGroupId, currentUserId, group, runSyncProtocol],
  )

  // ── WiFi: Device B scans offer, creates answer ────────────────────────────
  function handleStartScanOffer() {
    setWifi({ step: 'scanning-offer' })
  }

  const handleScanOffer = useCallback(
    async (scanned: string) => {
      if (wifi.step !== 'scanning-offer' || !activeGroupId || !currentUserId || !group) return
      if (!isSDP(scanned)) return

      try {
        const session = await createAnswer(scanned)
        setWifi({ step: 'answering', encodedAnswer: session.encodedSDP })

        const channel = await new Promise<RTCDataChannel>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30_000)
          session.channel.addEventListener('open', () => {
            clearTimeout(timeout)
            resolve(session.channel)
          })
        })

        setWifi({ step: 'syncing' })
        await runSyncProtocol(channel, 'webrtc')
      } catch (e) {
        setWifi({ step: 'error', message: String(e) })
      }
    },
    [wifi, activeGroupId, currentUserId, group, runSyncProtocol],
  )

  // ── QR Batch: export ──────────────────────────────────────────────────────
  async function handleQRExport() {
    if (!activeGroupId || !currentUserId || !group) return
    try {
      const transportKey = await deriveTransportKey(group.groupSecret)
      const delta = await computeDelta(activeGroupId, {}, currentUserId)
      const encrypted = await encryptPayload(delta, transportKey)
      const envelopes = chunkPayload(encrypted)
      const encoded = envelopes.map(encodeChunk)
      setQRBatch({ step: 'exporting', chunks: encoded, chunkIndex: 0 })
    } catch (e) {
      setQRBatch({ step: 'error', message: String(e) })
    }
  }

  // ── QR Batch: import (scan chunks) ────────────────────────────────────────
  function handleQRScanStart() {
    setQRBatch({ step: 'scanning', collected: new Map(), total: null })
  }

  const handleQRChunkScan = useCallback(
    async (scanned: string) => {
      if (qrBatch.step !== 'scanning' || !activeGroupId || !currentUserId || !group) return
      if (!isChunk(scanned)) return

      try {
        const envelope = decodeChunk(scanned)
        const collected = new Map(qrBatch.collected)
        collected.set(envelope.index, envelope)
        const total = envelope.total

        const reassembled = reassembleChunks(collected, total)
        if (reassembled) {
          // All chunks received
          const transportKey = await deriveTransportKey(group.groupSecret)
          const delta = await decryptPayload<SyncDelta>(reassembled, transportKey)
          const syncId = crypto.randomUUID()
          const result = await applyDelta(delta, activeGroupId, syncId, 'qr', currentUserId)
          setQRBatch({ step: 'done', applied: result.recordsApplied })
        } else {
          setQRBatch({ step: 'scanning', collected, total })
        }
      } catch (e) {
        setQRBatch({ step: 'error', message: String(e) })
      }
    },
    [qrBatch, activeGroupId, currentUserId, group],
  )

  function handleQRPrevChunk() {
    if (qrBatch.step !== 'exporting' || qrBatch.chunkIndex === 0) return
    setQRBatch({ ...qrBatch, chunkIndex: qrBatch.chunkIndex - 1 })
  }

  function handleQRNextChunk() {
    if (qrBatch.step !== 'exporting' || qrBatch.chunkIndex >= qrBatch.chunks.length - 1) return
    setQRBatch({ ...qrBatch, chunkIndex: qrBatch.chunkIndex + 1 })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="w-full max-w-[430px] mx-auto rounded-t-2xl bg-surface
                   border-0 border-t border-border px-0 pb-0 gap-0 max-h-[92vh] overflow-y-auto"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-3" />
        </div>

        {/* Header */}
        <SheetHeader className="px-4 pb-3 text-left">
          <SheetTitle className="text-lg font-bold text-text-primary">Sync</SheetTitle>
          {group && <p className="text-xs text-text-tertiary">{group.name}</p>}
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mx-4 mb-4 p-1 rounded-xl bg-surface-2">
          {(['wifi', 'qr', 'history'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t ? 'bg-accent text-black' : 'text-text-secondary'
              }`}
            >
              {t === 'wifi' ? 'Local WiFi' : t === 'qr' ? 'QR Batch' : 'History'}
            </button>
          ))}
        </div>

        <div className="px-4 pb-8">
          {tab === 'wifi' && (
            <WiFiTab
              state={wifi}
              onStartOffer={handleStartOffer}
              onReadyToScanAnswer={handleReadyToScanAnswer}
              onScanAnswer={handleScanAnswer}
              onStartScanOffer={handleStartScanOffer}
              onScanOffer={handleScanOffer}
              onReset={() => setWifi({ step: 'idle' })}
            />
          )}
          {tab === 'qr' && (
            <QRBatchTab
              state={qrBatch}
              onExport={handleQRExport}
              onScanStart={handleQRScanStart}
              onChunkScan={handleQRChunkScan}
              onPrevChunk={handleQRPrevChunk}
              onNextChunk={handleQRNextChunk}
              onReset={() => setQRBatch({ step: 'idle' })}
            />
          )}
          {tab === 'history' && <HistoryTab events={syncHistory ?? []} />}

          {activeGroupId && (
            <div className="mt-6">
              <ConflictResolver groupId={activeGroupId} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── WiFi Tab ─────────────────────────────────────────────────────────────────

function WiFiTab({
  state,
  onStartOffer,
  onReadyToScanAnswer,
  onScanAnswer,
  onStartScanOffer,
  onScanOffer,
  onReset,
}: {
  state: WiFiState
  onStartOffer: () => void
  onReadyToScanAnswer: () => void
  onScanAnswer: (s: string) => void
  onStartScanOffer: () => void
  onScanOffer: (s: string) => void
  onReset: () => void
}) {
  if (state.step === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Both devices must be on the same WiFi. No internet required.
        </p>
        <Button
          onClick={onStartOffer}
          className="w-full h-12 rounded-xl bg-accent text-black font-medium"
        >
          <Wifi size={16} className="mr-2" />
          Start sync (show QR)
        </Button>
        <Button
          onClick={onStartScanOffer}
          className="w-full h-12 rounded-xl bg-surface-2 text-text-primary"
        >
          <QrCode size={16} className="mr-2" />
          Scan peer&apos;s QR
        </Button>
      </div>
    )
  }

  if (state.step === 'offering') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary text-center">
          Step 1: Show this QR to the other device
        </p>
        <QRDisplay value={state.session.encodedSDP} label="Offer QR — scan on other device" />
        <Button
          onClick={onReadyToScanAnswer}
          className="w-full h-12 rounded-xl bg-accent text-black font-medium"
        >
          Other device shows answer QR →
        </Button>
        <button type="button" onClick={onReset} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    )
  }

  if (state.step === 'scan-answer') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary text-center">
          Step 2: Scan the answer QR from the other device
        </p>
        <QRScanner onScan={onScanAnswer} />
        <button type="button" onClick={onReset} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    )
  }

  if (state.step === 'scanning-offer') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary text-center">
          Scan the other device&apos;s offer QR
        </p>
        <QRScanner onScan={onScanOffer} />
        <button type="button" onClick={onReset} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    )
  }

  if (state.step === 'answering') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary text-center">
          Show this answer QR to the other device, then wait
        </p>
        <QRDisplay value={state.encodedAnswer} label="Answer QR — scan on other device" />
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 size={12} className="animate-spin" />
          Waiting for connection…
        </div>
      </div>
    )
  }

  if (state.step === 'syncing') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 size={32} className="animate-spin text-accent" />
        <p className="text-sm text-text-secondary">Syncing…</p>
      </div>
    )
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
          <Check size={28} className="text-success" />
        </div>
        <p className="text-base font-semibold text-text-primary">Sync complete</p>
        <p className="text-sm text-text-secondary">
          {state.applied} records applied
          {state.conflicts > 0 && ` · ${state.conflicts} conflict(s) below`}
        </p>
        <Button onClick={onReset} className="h-10 px-6 rounded-xl bg-surface-2 text-text-primary">
          Done
        </Button>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="text-sm text-danger text-center">{state.message}</p>
        <Button onClick={onReset} className="h-10 px-6 rounded-xl bg-surface-2 text-text-primary">
          Try again
        </Button>
      </div>
    )
  }

  return null
}

// ─── QR Batch Tab ─────────────────────────────────────────────────────────────

function QRBatchTab({
  state,
  onExport,
  onScanStart,
  onChunkScan,
  onPrevChunk,
  onNextChunk,
  onReset,
}: {
  state: QRBatchState
  onExport: () => void
  onScanStart: () => void
  onChunkScan: (s: string) => void
  onPrevChunk: () => void
  onNextChunk: () => void
  onReset: () => void
}) {
  if (state.step === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Unidirectional — export on one device, scan all chunks on the other.
        </p>
        <Button
          onClick={onExport}
          className="w-full h-12 rounded-xl bg-accent text-black font-medium"
        >
          Export QR chunks
        </Button>
        <Button
          onClick={onScanStart}
          className="w-full h-12 rounded-xl bg-surface-2 text-text-primary"
        >
          <QrCode size={16} className="mr-2" />
          Scan QR chunks
        </Button>
      </div>
    )
  }

  if (state.step === 'exporting') {
    const { chunks, chunkIndex } = state
    const total = chunks.length
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary">
          Chunk {chunkIndex + 1} of {total} — scan each on the other device
        </p>
        <QRDisplay value={chunks[chunkIndex] ?? ''} label={`QR ${chunkIndex + 1}/${total}`} />
        <div className="flex items-center gap-4">
          <Button
            onClick={onPrevChunk}
            disabled={chunkIndex === 0}
            className="h-10 w-10 rounded-xl bg-surface-2 text-text-primary disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="text-sm text-text-secondary">
            {chunkIndex + 1} / {total}
          </span>
          <Button
            onClick={onNextChunk}
            disabled={chunkIndex === total - 1}
            className="h-10 w-10 rounded-xl bg-surface-2 text-text-primary disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        <button type="button" onClick={onReset} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    )
  }

  if (state.step === 'scanning') {
    const { collected, total } = state
    const scanned = collected.size
    const missing = total !== null ? total - scanned : null
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-text-secondary text-center">
          {total !== null
            ? `Scanned ${scanned} of ${total} chunks`
            : 'Scan the first chunk to begin'}
        </p>
        {total !== null && (
          <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stable chunk order
                key={i}
                className={`w-4 h-4 rounded-sm ${collected.has(i) ? 'bg-success' : 'bg-surface-2'}`}
              />
            ))}
          </div>
        )}
        {missing !== null && missing > 0 && (
          <p className="text-xs text-text-tertiary">
            {missing} chunk{missing > 1 ? 's' : ''} remaining
          </p>
        )}
        <QRScanner onScan={onChunkScan} />
        <button type="button" onClick={onReset} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    )
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
          <Check size={28} className="text-success" />
        </div>
        <p className="text-base font-semibold text-text-primary">Import complete</p>
        <p className="text-sm text-text-secondary">{state.applied} records applied</p>
        <Button onClick={onReset} className="h-10 px-6 rounded-xl bg-surface-2 text-text-primary">
          Done
        </Button>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="text-sm text-danger text-center">{state.message}</p>
        <Button onClick={onReset} className="h-10 px-6 rounded-xl bg-surface-2 text-text-primary">
          Try again
        </Button>
      </div>
    )
  }

  return null
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ events }: { events: import('@/db/schema').SyncEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-tertiary text-center py-8">No sync history yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((evt) => (
        <div
          key={evt.syncId}
          className="p-3 rounded-xl bg-surface-2 flex items-start justify-between gap-3"
        >
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  evt.status === 'ok'
                    ? 'bg-success'
                    : evt.status === 'partial'
                      ? 'bg-warning'
                      : 'bg-danger'
                }`}
              />
              <span className="text-xs font-medium text-text-primary capitalize">{evt.method}</span>
              {evt.conflictsFound > 0 && (
                <span className="text-[10px] text-warning">
                  · {evt.conflictsFound} conflict{evt.conflictsFound > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-text-tertiary">
              ↑{evt.recordsSent} ↓{evt.recordsReceived}
            </p>
          </div>
          <p className="text-[10px] text-text-tertiary shrink-0">
            {new Date(evt.syncedAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      ))}
    </div>
  )
}
