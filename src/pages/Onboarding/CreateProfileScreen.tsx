import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createKeystore } from '@/crypto/keystore'
import { db } from '@/db/db'
import { GROUP_COLORS, generateId, groupColor } from '@/lib/utils'
import useKeyStore from '@/stores/key.store'

interface Props {
  onNext: (profile: { userId: string; displayName: string; avatarColor: string }) => void
}

export default function CreateProfileScreen({ onNext }: Props) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [colorIdx, setColorIdx] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setKey = useKeyStore((s) => s.setKey)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    setLoading(true)
    try {
      const { key, salt, pinCheck } = await createKeystore(pin)
      setKey(key)

      const userId = generateId()
      await db.keystoreTable.put({ id: 1, salt, pinCheck, pinChangeInProgress: false, userId })

      await db.users.put({
        userId,
        displayName: name.trim(),
        avatarColor: groupColor(colorIdx),
        identityBackupHint: '',
        createdAt: Date.now(),
      })

      onNext({ userId, displayName: name.trim(), avatarColor: groupColor(colorIdx) })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full px-6 py-8 gap-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Create profile</h2>
        <p className="text-sm text-text-secondary mt-1">Your identity stays on this device.</p>
      </div>

      {/* Avatar color */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Avatar colour
        </p>
        <div className="flex gap-3 flex-wrap">
          {GROUP_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setColorIdx(i)}
              className={`w-9 h-9 rounded-full transition-transform ${colorIdx === i ? 'scale-125 ring-2 ring-offset-2 ring-offset-bg' : ''}`}
              style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
            />
          ))}
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label
          htmlFor="profile-name"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Your name
        </Label>
        <Input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Himanshu"
          className="h-12 rounded-xl bg-surface border-border
                     text-text-primary placeholder:text-text-tertiary
                     focus-visible:border-accent focus-visible:ring-accent/20"
        />
      </div>

      {/* PIN */}
      <div className="space-y-2">
        <Label
          htmlFor="profile-pin"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          PIN (4–6 digits)
        </Label>
        <Input
          id="profile-pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="····"
          className="h-12 rounded-xl bg-surface border-border
                     text-text-primary placeholder:text-text-tertiary
                     focus-visible:border-accent focus-visible:ring-accent/20
                     tracking-widest"
        />
      </div>

      {/* Confirm PIN */}
      <div className="space-y-2">
        <Label
          htmlFor="profile-pin-confirm"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Confirm PIN
        </Label>
        <Input
          id="profile-pin-confirm"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="····"
          className="h-12 rounded-xl bg-surface border-border
                     text-text-primary placeholder:text-text-tertiary
                     focus-visible:border-accent focus-visible:ring-accent/20
                     tracking-widest"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="mt-auto">
        <Button
          type="submit"
          size="xl"
          disabled={loading}
          className="w-full rounded-2xl font-semibold"
        >
          {loading ? 'Setting up…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
