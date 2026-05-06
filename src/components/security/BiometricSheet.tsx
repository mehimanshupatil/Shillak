import { Fingerprint } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { registerBiometric } from '@/crypto/biometric'
import { verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
}

export default function BiometricSheet({ open, onClose, userId }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() {
    setPin('')
    setError('')
    onClose()
  }

  async function handleEnable() {
    if (pin.length < 4) {
      setError('Enter your current PIN first')
      return
    }
    setLoading(true)
    setError('')
    try {
      const ks = await db.keystoreTable.get(1)
      if (!ks) throw new Error('No keystore')
      // Verify PIN before storing it encrypted
      await verifyPin(pin, ks.salt, ks.pinCheck)
      await registerBiometric(pin, userId)
      handleClose()
    } catch (e) {
      const msg = String(e).replace('Error: ', '')
      if (msg.includes('Wrong') || msg.includes('OperationError')) {
        setError('Wrong PIN')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="bottom"
        className="w-full max-w-[430px] mx-auto rounded-t-2xl bg-surface
                   border-0 border-t border-border px-4 pb-8 gap-0"
      >
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full bg-surface-3" />
        </div>

        <SheetHeader className="mb-6 text-left px-0">
          <SheetTitle className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <Fingerprint size={20} className="text-accent" />
            Enable biometric unlock
          </SheetTitle>
          <p className="text-sm text-text-secondary mt-1">
            Your browser will ask to save a passkey — this is expected. It stays on this device and
            is only used to unlock Shillak, not to log in anywhere.
          </p>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <label
              htmlFor="bio-pin"
              className="text-xs font-medium text-text-secondary uppercase tracking-wider"
            >
              Confirm current PIN
            </label>
            <Input
              id="bio-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              placeholder="····"
              className="h-12 rounded-xl bg-surface-2 border-border
                         text-text-primary tracking-widest
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            onClick={handleEnable}
            disabled={loading || pin.length < 4}
            className="w-full h-12 rounded-xl bg-accent text-black font-semibold"
          >
            {loading ? 'Setting up…' : 'Enable biometric unlock'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
