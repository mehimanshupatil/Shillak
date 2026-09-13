import {
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  CheckIcon,
  CircleNotchIcon,
  QrCodeIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { QrReceiverState } from '@/sync/session/qrReceiver'
import type { QrSenderState } from '@/sync/session/qrSender'
import QRDisplay from '../QRDisplay'
import QRScanner, { type ScanProgress } from '../QRScanner'
import { InstructionCard, StepDots } from './parts'
import type { QRBatchState } from './types'

/**
 * Both role machines feed the one screen this tab draws. Only one is ever past
 * idle — a device is a sender or a receiver within a session, never both — so
 * collapsing them into a single view union is a rendering convenience, not a
 * claim that the roles share state.
 */
function viewOf(sender: QrSenderState, receiver: QrReceiverState): QRBatchState {
  switch (sender.step) {
    case 'scanning-clock':
    case 'building':
      return { step: 'sender-scan-clock' }
    case 'up-to-date':
      return { step: 'sender-up-to-date' }
    case 'showing-data':
      return {
        step: 'sender-show-data',
        chunks: sender.chunks,
        chunkIndex: sender.index,
        recordCount: sender.recordCount,
      }
    case 'error':
      return { step: 'error', message: sender.message }
    case 'idle':
      break
  }

  switch (receiver.step) {
    case 'showing-clock':
      return { step: 'receiver-show-clock', clockQR: receiver.clockQR }
    case 'scanning':
      return {
        step: 'receiver-scanning',
        collected: receiver.collected,
        total: receiver.total,
      }
    case 'processing':
      return { step: 'receiver-processing' }
    case 'done':
      return { step: 'done', applied: receiver.applied, conflicts: receiver.conflicts }
    case 'error':
      return { step: 'error', message: receiver.message }
    case 'idle':
    case 'preparing':
      return { step: 'idle' }
  }
}

export default function QRBatchTab({
  sender,
  receiver,
  onSenderStart,
  onClockScan,
  onReceiverStart,
  onReceiverScanStart,
  onChunkScan,
  onPrevChunk,
  onNextChunk,
  onReset,
}: {
  sender: QrSenderState
  receiver: QrReceiverState
  onSenderStart: () => void
  onClockScan: (s: string) => void
  onReceiverStart: () => void
  onReceiverScanStart: () => void
  onChunkScan: (s: string) => void
  onPrevChunk: () => void
  onNextChunk: () => void
  onReset: () => void
}) {
  const state = viewOf(sender, receiver)

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
