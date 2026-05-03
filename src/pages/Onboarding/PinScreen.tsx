import { useState } from 'react'
import Logo from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { broadcastUnlock, verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'
import useKeyStore from '@/stores/key.store'

interface Props {
  onUnlocked: () => void
}

export default function PinScreen({ onUnlocked }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setKey = useKeyStore((s) => s.setKey)

  async function handleSubmit() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    setLoading(true)
    setError('')
    try {
      const ks = await db.keystoreTable.get(1)
      if (!ks) throw new Error('No keystore found')
      const key = await verifyPin(pin, ks.salt, ks.pinCheck)
      setKey(key)
      broadcastUnlock()
      onUnlocked()
    } catch {
      setError('Wrong PIN. Try again.')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  function handleDigit(d: string) {
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length >= 4) setError('')
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1))
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="app-shell flex flex-col items-center justify-center px-6 gap-8 safe-top safe-bottom">
      <div className="flex flex-col items-center gap-3">
        <Logo variant="mark" size={52} />
        <p className="text-sm text-[var(--color-text-secondary)]">Enter your PIN to unlock</p>
      </div>

      {/* PIN dots — reflect actual length (4–6) */}
      <div className="flex gap-4">
        {Array.from({ length: 6 }, (_, i) => `dot-${i}`).map((id, i) => (
          <div
            key={id}
            className={`w-3.5 h-3.5 rounded-full transition-all ${
              i < pin.length ? 'bg-[var(--color-accent)] scale-110' : 'bg-[var(--color-border)]'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)] -mt-4">{error}</p>}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {digits.map((d) => (
          <button
            key={d === '' ? 'empty' : d}
            type="button"
            onClick={() => {
              if (d === '⌫') handleDelete()
              else if (d !== '') handleDigit(d)
            }}
            disabled={loading || d === ''}
            className={`
              h-16 rounded-2xl text-xl font-semibold transition-colors
              ${d === '' ? 'invisible' : ''}
              ${
                d === '⌫'
                  ? 'bg-transparent text-[var(--color-text-secondary)] active:bg-[var(--color-surface-2)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-primary)] active:bg-[var(--color-surface-2)]'
              }
            `}
          >
            {d}
          </button>
        ))}
      </div>

      {
        <Button
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          className="w-full max-w-[280px] h-14 rounded-2xl bg-[var(--color-accent)]
                     text-black font-semibold text-base hover:bg-[var(--color-accent-hover)]
                     disabled:opacity-50"
        >
          {loading ? 'Unlocking…' : 'Unlock'}
        </Button>
      }
    </div>
  )
}
