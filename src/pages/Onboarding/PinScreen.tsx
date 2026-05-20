import { FingerprintIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import Logo from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { unlockWithBiometric } from '@/crypto/biometric'
import { broadcastUnlock, verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'
import type { KeystoreRecord } from '@/db/schema'
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

  const hasBiometric = !!(ks?.biometricCredentialId && ks.biometricIv && ks.biometricEncryptedPin)

  async function handleSubmit() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    setLoading(true)
    setError('')
    try {
      const k = ks ?? (await db.keystoreTable.get(1))
      if (!k) throw new Error('No keystore found')
      const key = await verifyPin(pin, k.salt, k.pinCheck)
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

  async function handleBiometric() {
    if (!ks) return
    setLoading(true)
    setError('')
    try {
      const key = await unlockWithBiometric(ks)
      setKey(key)
      broadcastUnlock()
      onUnlocked()
    } catch (e) {
      setError(String(e).replace('Error: ', ''))
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
        <p className="text-sm text-text-secondary">Enter your PIN to unlock</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-4">
        {Array.from({ length: 6 }, (_, i) => `dot-${i}`).map((id, i) => (
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
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          className="w-full h-14 rounded-2xl bg-accent
                     text-black font-semibold text-base hover:bg-accent-hover
                     disabled:opacity-50"
        >
          {loading ? 'Unlocking…' : 'Unlock'}
        </Button>

        {hasBiometric && (
          <button
            type="button"
            onClick={handleBiometric}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl
                       text-sm text-text-secondary active:bg-surface-2
                       transition-colors disabled:opacity-50"
          >
            <FingerprintIcon size={18} className="text-accent" />
            Use biometric
          </button>
        )}
      </div>
    </div>
  )
}
