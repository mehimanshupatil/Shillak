import Logo from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'

interface Props {
  onNext: () => void
}

export default function WelcomeScreen({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-8 text-center">
      <Logo variant="mark" size={72} />

      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-text-primary">Shillak</h1>
        <p className="text-lg text-text-secondary">Your private space ledger</p>
        <p className="text-sm text-text-tertiary max-w-xs mx-auto leading-relaxed">
          Track shared expenses, manage budgets, and hit savings goals with your household. No
          account. No cloud. Everything stays on your device.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-xs text-text-tertiary">
        {[
          '100% offline — works without internet',
          'PIN-encrypted on your device',
          'Sync via local WiFi or QR code',
        ].map((f) => (
          <div key={f} className="flex items-center gap-2">
            <span className="text-success">✓</span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      <Button size="xl" onClick={onNext} className="w-full rounded-2xl font-semibold text-base">
        Get started
      </Button>
    </div>
  )
}
