import {
  CheckIcon,
  CircleNotchIcon,
  FileCodeIcon,
  QrCodeIcon,
  WifiHighIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { WifiState } from '@/sync/session/wifi'
import QRDisplay from '../QRDisplay'
import QRScanner from '../QRScanner'
import { InstructionCard, StepDots } from './parts'
import type { WiFiState } from './types'

/** `creating-offer` has no screen of its own — the same as before it was named. */
function viewOf(session: WifiState): WiFiState {
  return session.step === 'creating-offer' ? { step: 'idle' } : session
}

export default function WiFiTab({
  session,
  onStartOffer,
  onReadyToScanAnswer,
  onScanAnswer,
  onStartScanOffer,
  onScanOffer,
  onReset,
}: {
  session: WifiState
  onStartOffer: () => void
  onReadyToScanAnswer: () => void
  onScanAnswer: (s: string) => void
  onStartScanOffer: () => void
  onScanOffer: (s: string) => void
  onReset: () => void
}) {
  const state = viewOf(session)

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
