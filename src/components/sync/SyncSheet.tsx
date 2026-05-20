/**
 * 3-tab sync sheet:
 *   Tab 1 — Local WiFi (WebRTC via QR SDP exchange)
 *   Tab 2 — QR Batch (chunked carousel, unidirectional)
 *   Tab 3 — History (last SyncEvent records)
 */

import {
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  CheckIcon,
  CircleNotchIcon,
  FileCodeIcon,
  QrCodeIcon,
  WifiHighIcon,
} from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import useAppStore from '@/stores/app.store'
import { applyDelta } from '@/sync/conflict'
import type { QRChunkEnvelope } from '@/sync/qr'
import {
  chunkPayload,
  decodeChunk,
  decodeClockQR,
  encodeChunk,
  encodeClockQR,
  isChunk,
  isClockQR,
  isSDP,
  reassembleChunks,
} from '@/sync/qr'
import { decryptPayload, deriveTransportKey, encryptPayload } from '@/sync/transport'
import type { SyncDelta } from '@/sync/vector-clock'
import { computeDelta, computeSince } from '@/sync/vector-clock'
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
import QRScanner, { type ScanProgress } from './QRScanner'

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
  // Sender path: scan receiver clock → show delta chunks
  | { step: 'sender-scan-clock' }
  | { step: 'sender-show-data'; chunks: string[]; chunkIndex: number; recordCount: number }
  | { step: 'sender-up-to-date' }
  // Receiver path: show own clock → scan incoming chunks
  | { step: 'receiver-show-clock'; clockQR: string }
  | { step: 'receiver-scanning'; collected: Map<number, QRChunkEnvelope>; total: number | null }
  | { step: 'receiver-processing' } // all chunks collected, decrypting + applying
  | { step: 'done'; applied: number; conflicts: number }
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
  if (msg.includes('RTCPeerConnection') || msg.includes('ICE') || msg.includes('WebRTC connection'))
    return 'Connection failed — make sure both devices are on the same WiFi network and try again.'
  if (msg.includes('Data channel timeout'))
    return 'Connection timed out — the other device did not complete the QR scan. Try again.'
  if (msg.includes('Message timeout'))
    return 'Sync timed out — both devices must stay on the sync screen until complete.'
  if (msg.includes('InvalidStateError')) return 'Connection closed unexpectedly. Try again.'
  if (msg.includes('Expected clock') || msg.includes('Expected delta'))
    return 'Sync handshake failed. Try again — both devices must stay on the sync screen.'
  if (msg.includes('Group not found'))
    return 'Space not found — make sure both devices have the same space open before syncing.'
  return `Sync failed: ${msg}`
}

export default function SyncSheet({ open, onClose }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [tab, setTab] = useState<Tab>('wifi')
  const [wifi, setWifi] = useState<WiFiState>({ step: 'idle' })
  const [qrBatch, setQRBatch] = useState<QRBatchState>({ step: 'idle' })
  // Ref to avoid stale closure when chunks arrive in quick succession
  const collectedRef = useRef<Map<number, QRChunkEnvelope>>(new Map())

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

  const pendingConflictsCount = useLiveQuery(
    async () => {
      if (!activeGroupId) return 0
      const all = await db.conflicts.where(
        (c) => c.groupId === activeGroupId && c.resolution === 'pending',
      )
      return all.length
    },
    [activeGroupId],
    0,
  )

  const lastSync = useLiveQuery(async () => {
    if (!activeGroupId) return null
    const events = await db.syncEvents.where(
      (e) => e.groupId === activeGroupId && e.status === 'ok',
    )
    return events.sort((a, b) => b.syncedAt - a.syncedAt)[0] ?? null
  }, [activeGroupId])

  // ── Sync protocol ────────────────────────────────────────────────────────────
  const runSyncProtocol = useCallback(
    async (channel: RTCDataChannel, method: 'webrtc' | 'qr') => {
      if (!activeGroupId || !currentUserId || !group) {
        channel.close()
        setWifi({ step: 'error', message: 'Space not ready — wait a moment and try again.' })
        return
      }
      try {
        const msgQueue = createMessageQueue(channel)
        const transportKey = await deriveTransportKey(group.groupSecret)

        const myDelta = await computeDelta(activeGroupId, {}, currentUserId)
        const mySince = await computeSince(activeGroupId)

        sendMessage(channel, { type: 'clock', clock: myDelta.vectorClock, since: mySince })

        const clockMsg = await msgQueue.waitForMessage()
        if (clockMsg.type !== 'clock')
          throw new Error(`Expected clock message, got: ${clockMsg.type}`)
        const theirClock = clockMsg.clock
        const theirSince = clockMsg.since

        const delta = await computeDelta(activeGroupId, theirClock, currentUserId, theirSince)

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
        if (result.conflictsFound > 0) setTab('history')
        channel.close()
      } catch (e) {
        setWifi({ step: 'error', message: friendlyError(e) })
        try {
          channel.close()
        } catch {
          /* already closed */
        }
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

  // Sender: start by scanning receiver's clock QR
  function handleQRSenderStart() {
    setQRBatch({ step: 'sender-scan-clock' })
  }

  // Sender: scanned receiver's clock → compute delta → show chunks
  const handleQRClockScan = useCallback(
    async (scanned: string) => {
      if (qrBatch.step !== 'sender-scan-clock' || !activeGroupId || !currentUserId || !group) return
      if (!isClockQR(scanned)) return
      try {
        const { clock: theirClock, since } = decodeClockQR(scanned)
        const transportKey = await deriveTransportKey(group.groupSecret)
        const delta = await computeDelta(activeGroupId, theirClock, currentUserId, since)
        const totalRecords =
          delta.transactions.length +
          delta.categories.length +
          delta.members.length +
          delta.budgets.length +
          delta.goals.length +
          delta.recurrences.length +
          delta.users.length
        if (totalRecords === 0) {
          setQRBatch({ step: 'sender-up-to-date' })
          return
        }
        const encrypted = await encryptPayload(delta, transportKey)
        const chunks = chunkPayload(encrypted).map(encodeChunk)
        setQRBatch({ step: 'sender-show-data', chunks, chunkIndex: 0, recordCount: totalRecords })
      } catch (e) {
        setQRBatch({ step: 'error', message: friendlyError(e) })
      }
    },
    [qrBatch, activeGroupId, currentUserId, group],
  )

  // Receiver: show own clock QR so sender can compute minimal delta
  async function handleQRReceiverStart() {
    if (!activeGroupId || !currentUserId) return
    try {
      const grp = await db.groups.get(activeGroupId)
      if (!grp) return

      // Compute `since`: max timestamp across all non-transaction entities we already have.
      // Sender will skip anything ≤ this, drastically reducing QR chunk count after first sync.
      const since = await computeSince(activeGroupId)

      const clockQR = encodeClockQR(activeGroupId, grp.vectorClock, since)
      setQRBatch({ step: 'receiver-show-clock', clockQR })
    } catch (e) {
      setQRBatch({ step: 'error', message: friendlyError(e) })
    }
  }

  function handleQRReceiverScanStart() {
    collectedRef.current = new Map()
    setQRBatch({ step: 'receiver-scanning', collected: new Map(), total: null })
  }

  const handleQRChunkScan = useCallback(
    async (scanned: string) => {
      if (!activeGroupId || !currentUserId || !group) return
      if (!isChunk(scanned)) return
      try {
        const envelope = decodeChunk(scanned)
        // Mutate the ref synchronously — no stale closure even when chunks arrive fast
        collectedRef.current.set(envelope.index, envelope)
        const total = envelope.total
        const reassembled = reassembleChunks(collectedRef.current, total)
        if (reassembled) {
          // Close scanner immediately — synchronous state update before any await.
          // Without this, the scanner stays visible during applyDelta, user taps XIcon
          // (onReset → idle), then applyDelta resolves and sets done — confusing.
          setQRBatch({ step: 'receiver-processing' })
          const transportKey = await deriveTransportKey(group.groupSecret)
          const delta = await decryptPayload<SyncDelta>(reassembled, transportKey)
          const syncId = crypto.randomUUID()
          const result = await applyDelta(delta, activeGroupId, syncId, 'qr', currentUserId)
          setQRBatch({
            step: 'done',
            applied: result.recordsApplied,
            conflicts: result.conflictsFound,
          })
          if (result.conflictsFound > 0) setTab('history')
        } else {
          // Snapshot ref into state for UI rendering only
          setQRBatch({ step: 'receiver-scanning', collected: new Map(collectedRef.current), total })
        }
      } catch (e) {
        setQRBatch({ step: 'error', message: friendlyError(e) })
      }
    },
    [activeGroupId, currentUserId, group],
  )

  function handleQRPrevChunk() {
    if (qrBatch.step !== 'sender-show-data' || qrBatch.chunkIndex === 0) return
    setQRBatch({ ...qrBatch, chunkIndex: qrBatch.chunkIndex - 1 })
  }

  function handleQRNextChunk() {
    if (qrBatch.step !== 'sender-show-data' || qrBatch.chunkIndex >= qrBatch.chunks.length - 1)
      return
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
          <p className="text-xs text-text-tertiary">
            {group?.name}
            {lastSync && (
              <>
                {' · '}last synced{' '}
                {new Date(lastSync.syncedAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </>
            )}
          </p>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mx-4 mb-4 p-1 rounded-xl bg-surface-2">
          {(['wifi', 'qr', 'history'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${
                tab === t ? 'bg-accent text-black' : 'text-text-secondary'
              }`}
            >
              {t === 'wifi' ? 'Local WiFi' : t === 'qr' ? 'QR Code' : 'History'}
              {t === 'history' && (pendingConflictsCount ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning" />
              )}
            </button>
          ))}
        </div>

        {/* Pending conflicts — shown above tab content so always visible */}
        {(pendingConflictsCount ?? 0) > 0 && activeGroupId && (
          <div className="px-4 mb-4">
            <ConflictResolver groupId={activeGroupId} />
          </div>
        )}

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
              onSenderStart={handleQRSenderStart}
              onClockScan={handleQRClockScan}
              onReceiverStart={handleQRReceiverStart}
              onReceiverScanStart={handleQRReceiverScanStart}
              onChunkScan={handleQRChunkScan}
              onPrevChunk={handleQRPrevChunk}
              onNextChunk={handleQRNextChunk}
              onReset={() => {
                collectedRef.current = new Map()
                setQRBatch({ step: 'idle' })
              }}
            />
          )}
          {tab === 'history' && <HistoryTab events={syncHistory ?? []} />}
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
            <WifiHighIcon size={13} className="text-accent" />
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
            <QrCodeIcon size={20} className="text-accent" />
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
            <WifiHighIcon size={20} className="text-text-secondary" />
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
          <FileCodeIcon size={13} className="text-text-tertiary mt-0.5 shrink-0" />
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
          thisDevice="ScanIcon the QR code that is now showing on the other device's screen."
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
          thisDevice={`ScanIcon the QR code on the other device's screen.`}
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
        <CircleNotchIcon size={32} className="animate-spin text-accent" />
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
          <CheckIcon size={30} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Sync complete</p>
          <p className="text-sm text-text-secondary mt-1">
            {state.applied === 0
              ? 'Everything was already up to date.'
              : `${state.applied} record${state.applied !== 1 ? 's' : ''} synced`}
            {state.conflicts > 0 && (
              <span className="text-warning">
                {' '}
                · {state.conflicts} conflict{state.conflicts > 1 ? 's' : ''} need attention
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
  onSenderStart,
  onClockScan,
  onReceiverStart,
  onReceiverScanStart,
  onChunkScan,
  onPrevChunk,
  onNextChunk,
  onReset,
}: {
  state: QRBatchState
  onSenderStart: () => void
  onClockScan: (s: string) => void
  onReceiverStart: () => void
  onReceiverScanStart: () => void
  onChunkScan: (s: string) => void
  onPrevChunk: () => void
  onNextChunk: () => void
  onReset: () => void
}) {
  if (state.step === 'idle') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <QrCodeIcon size={13} className="text-accent" />
            <p className="text-xs font-semibold text-text-primary">Works without WiFi</p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Receiver shows their sync state first so only missing data is transferred. One-way —
            repeat in reverse to sync back.
          </p>
        </div>

        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          What are you doing?
        </p>

        <button
          type="button"
          onClick={onSenderStart}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <ArrowLineUpIcon size={18} className="text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Send my data</p>
            <p className="text-sm text-text-secondary mt-0.5">
              ScanIcon the other device's QR, then show them yours.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onReceiverStart}
          className="w-full p-4 rounded-2xl border border-border bg-surface
                     flex items-start gap-4 text-left active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <ArrowLineDownIcon size={18} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Receive data</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Show your sync state, then scan the other device's QRs.
            </p>
          </div>
        </button>
      </div>
    )
  }

  // ── Sender: scan receiver's clock ────────────────────────────────────────────
  if (state.step === 'sender-scan-clock') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={0} total={2} />
        <InstructionCard
          thisDevice="ScanIcon the QR code showing on the other device's screen."
          otherDevice='Other device: should have tapped "Receive data" and is showing a QR.'
        />
        <QRScanner onScan={onClockScan} onClose={onReset} />
      </div>
    )
  }

  // ── Sender: show delta chunks ────────────────────────────────────────────────
  if (state.step === 'sender-show-data') {
    const { chunks, chunkIndex, recordCount } = state
    const total = chunks.length
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={1} total={2} />
        <InstructionCard
          thisDevice={`Show QR ${chunkIndex + 1} of ${total} to the other device.`}
          otherDevice={
            total > 1
              ? 'ScanIcon each QR in order. Tap arrow to advance after each scan.'
              : 'ScanIcon this QR to receive the data.'
          }
        />
        <div className="text-center text-xs text-text-tertiary -mt-1 mb-1">
          {recordCount} record{recordCount !== 1 ? 's' : ''} to transfer · {total} QR
          {total !== 1 ? 's' : ''}
        </div>
        <QRDisplay
          value={chunks[chunkIndex] ?? ''}
          label={`QR ${chunkIndex + 1} of ${total}`}
          onClose={onReset}
          chunkNav={{ index: chunkIndex, total, onPrev: onPrevChunk, onNext: onNextChunk }}
        />
      </div>
    )
  }

  // ── Sender: receiver already up to date ─────────────────────────────────────
  if (state.step === 'sender-up-to-date') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
          <CheckIcon size={30} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Already up to date</p>
          <p className="text-sm text-text-secondary mt-1">
            The other device has all your data. Nothing to send.
          </p>
        </div>
        <Button variant="secondary" onClick={onReset}>
          Done
        </Button>
      </div>
    )
  }

  // ── Receiver: show own clock QR ──────────────────────────────────────────────
  if (state.step === 'receiver-show-clock') {
    return (
      <div className="flex flex-col gap-3">
        <StepDots current={0} total={2} />
        <InstructionCard
          thisDevice="Show this QR to the sender so they know what you already have."
          otherDevice='Sender: tap "Send my data" → scan this QR → they will show you data QRs.'
        />
        <QRDisplay
          value={state.clockQR}
          label="Your sync state"
          onClose={onReset}
          action={{ label: 'Ready to scan their QRs →', onClick: onReceiverScanStart }}
        />
        <p className="text-xs text-text-tertiary text-center px-2">
          Tap the button once the sender's screen shows data QR codes.
        </p>
      </div>
    )
  }

  // ── Receiver: all chunks in, applying ───────────────────────────────────────
  if (state.step === 'receiver-processing') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <CircleNotchIcon size={32} className="animate-spin text-accent" />
        <p className="text-sm font-medium text-text-primary">Applying data…</p>
      </div>
    )
  }

  // ── Receiver: scan data chunks ───────────────────────────────────────────────
  if (state.step === 'receiver-scanning') {
    const { collected, total } = state
    const scanned = collected.size
    const missing = total
      ? Array.from({ length: total }, (_, i) => i).filter((i) => !collected.has(i))
      : []
    const nextNeeded = missing[0] ?? null

    const scanProgress: ScanProgress | undefined =
      total !== null
        ? { scanned, total, collected: new Set(collected.keys()), nextNeeded }
        : undefined

    return <QRScanner onScan={onChunkScan} onClose={onReset} progress={scanProgress} />
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
          <CheckIcon size={30} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Sync complete</p>
          <p className="text-sm text-text-secondary mt-1">
            {state.applied === 0
              ? 'Everything was already up to date.'
              : `${state.applied} record${state.applied !== 1 ? 's' : ''} applied`}
            {state.conflicts > 0 && (
              <span className="text-warning">
                {' '}
                · {state.conflicts} conflict{state.conflicts > 1 ? 's' : ''} need attention
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

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ events }: { events: import('@/db/schema').SyncEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm text-text-secondary">No sync history yet.</p>
        <p className="text-xs text-text-tertiary">Sync logs appear here after a successful sync.</p>
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
