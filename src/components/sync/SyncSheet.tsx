/**
 * 3-tab sync sheet:
 *   Tab 1 — Local WiFi (WebRTC via QR SDP exchange)
 *   Tab 2 — QR Batch (chunked carousel, unidirectional)
 *   Tab 3 — History (last SyncEvent records)
 */
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  FileJson,
  Loader2,
  QrCode,
  Wifi,
} from 'lucide-react'
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
import type { WebRTCOfferSession } from '@/sync/webrtc'
import {
  applyAnswer,
  createAnswer,
  createMessageQueue,
  createOffer,
  sendMessage,
} from '@/sync/webrtc'
import ConflictResolver from './ConflictResolver'
import QRDisplay from './QRDisplay'
import QRScanner from './QRScanner'

type Tab = 'wifi' | 'qr' | 'history'

type WiFiState =
  | { step: 'idle' }
  | { step: 'offering'; session: WebRTCOfferSession }
  | { step: 'scan-answer'; session: WebRTCOfferSession }
  | { step: 'scanning-offer' }
  | { step: 'answering'; encodedAnswer: string }
  | { step: 'syncing' }
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }

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

function friendlyError(e: unknown): string {
  const msg = String(e)
  if (msg.includes('not in the same')) return msg
  if (msg.includes('OperationError') || msg.includes('decrypt'))
    return 'Decryption failed — both devices must be in the same space. Make sure you joined via an invite QR, not by creating a separate space.'
  if (msg.includes('RTCPeerConnection') || msg.includes('ICE'))
    return 'Connection failed — make sure both devices are on the same WiFi network and try again.'
  if (msg.includes('InvalidStateError'))
    return 'Connection closed unexpectedly. Try again.'
  if (msg.includes('Expected clock') || msg.includes('Expected delta'))
    return 'Sync handshake failed. Try again — both devices must stay on the sync screen.'
  return 'Something went wrong. Try again.'
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

  // ── Sync protocol ────────────────────────────────────────────────────────────
  const runSyncProtocol = useCallback(
    async (channel: RTCDataChannel, method: 'webrtc' | 'qr') => {
      if (!activeGroupId || !currentUserId || !group) return
      try {
        const msgQueue = createMessageQueue(channel)
        const transportKey = await deriveTransportKey(group.groupSecret)

        const myDelta = await computeDelta(activeGroupId, {}, currentUserId)

        sendMessage(channel, { type: 'clock', clock: myDelta.vectorClock })

        const clockMsg = await msgQueue.waitForMessage()
        if (clockMsg.type !== 'clock')
          throw new Error(`Expected clock message, got: ${clockMsg.type}`)
        const theirClock = clockMsg.clock

        const delta = await computeDelta(activeGroupId, theirClock, currentUserId)

        const encrypted = await encryptPayload(delta, transportKey)
        sendMessage(channel, { type: 'delta', payload: encrypted })

        const deltaMsg = await msgQueue.waitForMessage()
        if (deltaMsg.type !== 'delta')
          throw new Error(`Expected delta message, got: ${deltaMsg.type}`)
        const theirDelta = await decryptPayload<SyncDelta>(deltaMsg.payload, transportKey)

        const syncId = crypto.randomUUID()
        const result = await applyDelta(theirDelta, activeGroupId, syncId, method, currentUserId)

        sendMessage(channel, { type: 'done' })
        await msgQueue.waitForMessage()

        await db.syncEvents.update(syncId, {
          recordsSent: delta.transactions.length + delta.categories.length,
        })

        setWifi({ step: 'done', applied: result.recordsApplied, conflicts: result.conflictsFound })
        channel.close()
      } catch (e) {
        setWifi({ step: 'error', message: friendlyError(e) })
        try { channel.close() } catch { /* already closed */ }
      }
    },
    [activeGroupId, currentUserId, group],
  )

  // ── WiFi: Device A ───────────────────────────────────────────────────────────
  async function handleStartOffer() {
    if (!activeGroupId || !currentUserId || !group) return
    try {
      const session = await createOffer()
      setWifi({ step: 'offering', session })
    } catch (e) {
      setWifi({ step: 'error', message: friendlyError(e) })
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
        setWifi({ step: 'error', message: friendlyError(e) })
      }
    },
    [wifi, activeGroupId, currentUserId, group, runSyncProtocol],
  )

  // ── WiFi: Device B ───────────────────────────────────────────────────────────
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
        const channel = await session.channelPromise
        setWifi({ step: 'syncing' })
        await runSyncProtocol(channel, 'webrtc')
      } catch (e) {
        setWifi({ step: 'error', message: friendlyError(e) })
      }
    },
    [wifi, activeGroupId, currentUserId, group, runSyncProtocol],
  )

  // ── QR Batch ─────────────────────────────────────────────────────────────────
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
      setQRBatch({ step: 'error', message: friendlyError(e) })
    }
  }

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
          const transportKey = await deriveTransportKey(group.groupSecret)
          const delta = await decryptPayload<SyncDelta>(reassembled, transportKey)
          const syncId = crypto.randomUUID()
          const result = await applyDelta(delta, activeGroupId, syncId, 'qr', currentUserId)
          setQRBatch({ step: 'done', applied: result.recordsApplied })
        } else {
          setQRBatch({ step: 'scanning', collected, total })
        }
      } catch (e) {
        setQRBatch({ step: 'error', message: friendlyError(e) })
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
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-3" />
        </div>

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
              {t === 'wifi' ? 'Local WiFi' : t === 'qr' ? 'QR Code' : 'History'}
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

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable step order
          key={i}
          className={`rounded-full transition-all ${
            i < current
              ? 'w-2 h-2 bg-success'
              : i === current
                ? 'w-2.5 h-2.5 bg-accent'
                : 'w-2 h-2 bg-surface-3'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Instruction card ─────────────────────────────────────────────────────────

function InstructionCard({
  thisDevice,
  otherDevice,
}: {
  thisDevice: string
  otherDevice?: string
}) {
  return (
    <div className="rounded-xl bg-surface-2 border border-border divide-y divide-border mb-4">
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="text-xs font-semibold text-accent mt-0.5 shrink-0">YOU</span>
        <p className="text-sm text-text-primary leading-snug">{thisDevice}</p>
      </div>
      {otherDevice && (
        <div className="px-4 py-3 flex items-start gap-3">
          <span className="text-xs font-semibold text-text-tertiary mt-0.5 shrink-0">THEM</span>
          <p className="text-sm text-text-secondary leading-snug">{otherDevice}</p>
        </div>
      )}
    </div>
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
      <div className="flex flex-col gap-4">
        {/* Method hint */}
        <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={13} className="text-accent" />
            <p className="text-xs font-semibold text-text-primary">Same WiFi required</p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Both devices must be on the same WiFi network. Bidirectional — both devices send and
            receive. No internet needed.
          </p>
        </div>

        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Which device are you on?
        </p>

        {/* Role: initiator */}
        <button
          type="button"
          onClick={onStartOffer}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <QrCode size={20} className="text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">I'm starting the sync</p>
            <p className="text-sm text-text-secondary mt-0.5">
              This device shows a QR code. The other device scans it.
            </p>
          </div>
        </button>

        {/* Role: joiner */}
        <button
          type="button"
          onClick={onStartScanOffer}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <Wifi size={20} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Other device started</p>
            <p className="text-sm text-text-secondary mt-0.5">
              The other device shows a QR code. I'll scan it.
            </p>
          </div>
        </button>

        {/* QR fallback hint */}
        <div className="rounded-xl bg-surface-2 border border-border px-4 py-3 flex items-start gap-2">
          <FileJson size={13} className="text-text-tertiary mt-0.5 shrink-0" />
          <p className="text-xs text-text-secondary leading-relaxed">
            Not on the same WiFi?{' '}
            <span className="text-text-primary font-medium">Use the QR Code tab</span> instead — no
            network needed.
          </p>
        </div>
      </div>
    )
  }

  if (state.step === 'offering') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={0} total={3} />
        <InstructionCard
          thisDevice="Show this QR to the other device and wait while they scan it."
          otherDevice={`Other device: tap "Other device started" → scan this QR → their screen will show a NEW QR.`}
        />
        <QRDisplay
          value={state.session.encodedSDP}
          label="Step 1 — hold up to the other device's camera"
          onClose={onReset}
          action={{
            label: 'Their screen now shows a QR code →',
            onClick: onReadyToScanAnswer,
          }}
        />
        <p className="text-xs text-text-tertiary text-center px-2">
          Tap the button above once you can see a QR code appear on the other device's screen.
        </p>
      </div>
    )
  }

  if (state.step === 'scan-answer') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={1} total={3} />
        <InstructionCard
          thisDevice="Scan the QR code that is now showing on the other device's screen."
          otherDevice="Other device is holding their screen steady showing a QR — point your camera at it."
        />
        <QRScanner onScan={onScanAnswer} onClose={onReset} />
      </div>
    )
  }

  if (state.step === 'scanning-offer') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={0} total={3} />
        <InstructionCard
          thisDevice={`Scan the QR code on the other device's screen.`}
          otherDevice={`Other device: should have tapped "I'm starting the sync" and is showing a QR. After you scan it, their screen will ask them to scan your QR.`}
        />
        <QRScanner onScan={onScanOffer} onClose={onReset} />
      </div>
    )
  }

  if (state.step === 'answering') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={1} total={3} />
        <InstructionCard
          thisDevice="Show this QR to the other device and keep it on screen while they scan it."
          otherDevice={`Other device: tap "Their screen now shows a QR code" → then scan this QR. Connection will start automatically.`}
        />
        <QRDisplay
          value={state.encodedAnswer}
          label="Step 2 — hold up to the other device's camera"
          onClose={onReset}
        />
        <p className="text-xs text-text-tertiary text-center px-2">
          Do not close this screen. The connection starts automatically after they scan.
        </p>
      </div>
    )
  }

  if (state.step === 'syncing') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <StepDots current={2} total={3} />
        <Loader2 size={32} className="animate-spin text-accent" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">Syncing data…</p>
          <p className="text-xs text-text-tertiary mt-1">Keep both devices on this screen</p>
        </div>
      </div>
    )
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
          <Check size={30} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Sync complete</p>
          <p className="text-sm text-text-secondary mt-1">
            {state.applied === 0
              ? 'Everything was already up to date.'
              : `${state.applied} record${state.applied !== 1 ? 's' : ''} synced`}
            {state.conflicts > 0 && (
              <span className="text-warning">
                {' '}· {state.conflicts} conflict{state.conflicts > 1 ? 's' : ''} need attention
              </span>
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={onReset}>
          Done
        </Button>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
          <p className="text-xs font-semibold text-danger mb-1">Sync failed</p>
          <p className="text-sm text-text-primary leading-snug">{state.message}</p>
        </div>
        <Button variant="secondary" onClick={onReset} className="w-full">
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
      <div className="flex flex-col gap-4">
        {/* Method hint */}
        <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <QrCode size={13} className="text-accent" />
            <p className="text-xs font-semibold text-text-primary">Works without WiFi</p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            One device exports data as a series of QR codes. The other device scans each one.
            One-way only — repeat in reverse to sync back.
          </p>
        </div>

        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          What are you doing?
        </p>

        <button
          type="button"
          onClick={onExport}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <ArrowUpFromLine size={18} className="text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Send my data</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Show QR codes for the other device to scan.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onScanStart}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <ArrowDownToLine size={18} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Receive data</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Scan QR codes shown on the other device.
            </p>
          </div>
        </button>
      </div>
    )
  }

  if (state.step === 'exporting') {
    const { chunks, chunkIndex } = state
    const total = chunks.length
    return (
      <div className="flex flex-col gap-0">
        <StepDots current={chunkIndex} total={total} />
        <InstructionCard
          thisDevice={`Show QR ${chunkIndex + 1} of ${total} to the other device.`}
          otherDevice={
            total > 1
              ? 'After scanning each QR, tap the arrow to move to the next one.'
              : 'Scan this QR on the other device to receive the data.'
          }
        />
        <QRDisplay
          value={chunks[chunkIndex] ?? ''}
          label={`QR ${chunkIndex + 1} of ${total}`}
          onClose={onReset}
          chunkNav={{ index: chunkIndex, total, onPrev: onPrevChunk, onNext: onNextChunk }}
        />
      </div>
    )
  }

  if (state.step === 'scanning') {
    const { collected, total } = state
    const scanned = collected.size
    return (
      <div className="flex flex-col gap-4">
        <StepDots current={scanned} total={total ?? Math.max(scanned + 1, 1)} />
        <InstructionCard
          thisDevice={
            total !== null
              ? `Scanned ${scanned} of ${total} QR codes. Keep going.`
              : 'Point your camera at the QR codes on the other device.'
          }
          otherDevice={
            total !== null && total > 1
              ? 'The other device should advance to the next QR after you scan each one.'
              : undefined
          }
        />

        {total !== null && (
          <div className="flex gap-1.5 justify-center">
            {Array.from({ length: total }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stable chunk order
                key={i}
                className={`rounded-full transition-all ${
                  collected.has(i) ? 'w-6 h-2 bg-success' : 'w-2 h-2 bg-surface-3'
                }`}
              />
            ))}
          </div>
        )}

        <QRScanner onScan={onChunkScan} onClose={onReset} />
      </div>
    )
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
          <Check size={30} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Import complete</p>
          <p className="text-sm text-text-secondary mt-1">
            {state.applied === 0
              ? 'Everything was already up to date.'
              : `${state.applied} record${state.applied !== 1 ? 's' : ''} imported`}
          </p>
        </div>
        <Button variant="secondary" onClick={onReset}>
          Done
        </Button>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
          <p className="text-xs font-semibold text-danger mb-1">Import failed</p>
          <p className="text-sm text-text-primary leading-snug">{state.message}</p>
        </div>
        <Button variant="secondary" onClick={onReset} className="w-full">
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
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm text-text-secondary">No sync history yet.</p>
        <p className="text-xs text-text-tertiary">
          Sync logs appear here after a successful sync.
        </p>
      </div>
    )
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
              ↑ {evt.recordsSent} sent · ↓ {evt.recordsReceived} received
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
