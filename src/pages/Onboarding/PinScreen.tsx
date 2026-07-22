import { useEffect, useState } from 'react'
import Logo from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { broadcastUnlock, resolveUnlock } from '@/crypto/keystore'
import { db } from '@/db/db'
import type { KeystoreRecord } from '@/db/schema'
import { PIN_LENGTH } from '@/lib/constants'
import useKeyStore from '@/stores/key.store'

interface Props {
  onUnlocked: () => void
}

export default function PinScreen({ onUnlocked }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ks, setKs] = useState<KeystoreRecord | null>(null)
  const setKey = useKeyStore((s) => s.setKey)

  useEffect(() => {
    db.keystoreTable.get(1).then((k) => {
      if (k) setKs(k)
    })
  }, [])

  async function handleSubmit(pinOverride?: string) {
    const pinToVerify = pinOverride ?? pin
    if (pinToVerify.length !== PIN_LENGTH) {
      setError(`PIN must be ${PIN_LENGTH} digits`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const k = ks ?? (await db.keystoreTable.get(1))
      if (!k) throw new Error('No keystore found')
      const { key } = await resolveUnlock(pinToVerify, k)
      setKey(key)
      broadcastUnlock()
      onUnlocked()
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      setError(message.startsWith('PIN change') ? message : 'Wrong PIN. Try again.')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // DEV-only convenience — never present in production builds.
  const devPin = import.meta.env.DEV ? import.meta.env.VITE_DEV_PIN : undefined

  function handleDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    if (next.length >= PIN_LENGTH) setError('')
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1))
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="app-shell flex flex-col items-center justify-center px-6 gap-8 safe-top safe-bottom">
      <div className="flex flex-col items-center gap-3">
        <Logo variant="mark" size={52} />
        <p className="text-sm text-text-secondary">Enter your PIN to unlock</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-4">
        {Array.from({ length: PIN_LENGTH }, (_, i) => `dot-${i}`).map((id, i) => (
          <div
            key={id}
            className={`w-3.5 h-3.5 rounded-full transition-all ${
              i < pin.length ? 'bg-accent scale-110' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-danger -mt-4 text-center">{error}</p>}

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
                  ? 'bg-transparent text-text-secondary active:bg-surface-2'
                  : 'bg-surface text-text-primary active:bg-surface-2'
              }
            `}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
        <Button
          onClick={() => handleSubmit()}
          disabled={pin.length !== PIN_LENGTH || loading}
          className="w-full h-14 rounded-2xl bg-accent
                     text-black font-semibold text-base hover:bg-accent-hover
                     disabled:opacity-50"
        >
          {loading ? 'Unlocking…' : 'Unlock'}
        </Button>

        {devPin && (
          <button
            type="button"
            onClick={() => handleSubmit(devPin)}
            disabled={loading}
            className="text-xs text-text-tertiary underline disabled:opacity-50"
          >
            Unlock with dev PIN (VITE_DEV_PIN)
          </button>
        )}
      </div>
    </div>
  )
}
