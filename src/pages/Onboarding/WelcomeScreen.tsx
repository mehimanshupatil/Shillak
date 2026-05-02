import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onNext: () => void
}

export default function WelcomeScreen({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-8 text-center">
      <div className="w-20 h-20 rounded-3xl bg-[var(--color-accent-subtle)] flex items-center justify-center">
        <Wallet size={40} className="text-[var(--color-accent)]" />
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Shillak</h1>
        <p className="text-lg text-[var(--color-text-secondary)]">Your private group ledger</p>
        <p className="text-sm text-[var(--color-text-tertiary)] max-w-xs mx-auto leading-relaxed">
          Track shared expenses, split bills, and manage group budgets. No account. No cloud.
          Everything stays on your device.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-xs text-[var(--color-text-tertiary)]">
        {[
          '100% offline — works without internet',
          'PIN-encrypted on your device',
          'Sync via local WiFi or QR code',
        ].map((f) => (
          <div key={f} className="flex items-center gap-2">
            <span className="text-[var(--color-success)]">✓</span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onNext}
        className="w-full h-14 rounded-2xl bg-[var(--color-accent)] text-black font-semibold text-base
                   hover:bg-[var(--color-accent-hover)]"
      >
        Get started
      </Button>
    </div>
  )
}
