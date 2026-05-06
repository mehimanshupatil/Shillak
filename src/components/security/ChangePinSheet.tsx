import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { createKeystore, verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'
import useKeyStore from '@/stores/key.store'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChangePinSheet({ open, onClose }: Props) {
  const setKey = useKeyStore((s) => s.setKey)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [progress, setProgress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setProgress('')
    setError('')
    setLoading(false)
  }

  async function handleChange() {
    setError('')
    if (newPin.length < 4) {
      setError('New PIN must be at least 4 digits')
      return
    }
    if (newPin !== confirmPin) {
      setError('New PINs do not match')
      return
    }
    if (newPin === currentPin) {
      setError('New PIN must be different from current PIN')
      return
    }

    setLoading(true)
    try {
      // 1. Verify current PIN
      setProgress('Verifying current PIN…')
      const ks = await db.keystoreTable.get(1)
      if (!ks) throw new Error('Keystore not found')
      await verifyPin(currentPin, ks.salt, ks.pinCheck)

      // 2. Generate new keystore data
      setProgress('Generating new key…')
      const { key: newKey, salt: newSalt, pinCheck: newPinCheck } = await createKeystore(newPin)

      // 3. Mark PIN change in progress
      await db.keystoreTable.put({ ...ks, pinChangeInProgress: true })

      // 4. Read all encrypted records (old key still in store)
      setProgress('Reading records…')
      const [
        users,
        groups,
        members,
        invites,
        categories,
        transactions,
        recurrences,
        attachments,
        budgets,
        goals,
        syncEvents,
        conflicts,
        accounts,
      ] = await Promise.all([
        db.users.toArray(),
        db.groups.toArray(),
        db.members.toArray(),
        db.invites.toArray(),
        db.categories.toArray(),
        db.transactions.toArray(),
        db.recurrences.toArray(),
        db.attachments.toArray(),
        db.budgets.toArray(),
        db.goals.toArray(),
        db.syncEvents.toArray(),
        db.conflicts.toArray(),
        db.accounts.toArray(),
      ])

      // 5. Swap key — all subsequent writes use new key
      setProgress('Re-encrypting…')
      setKey(newKey)

      // 6. Write all records back with new key
      await Promise.all([
        users.length > 0 ? db.users.bulkPut(users) : Promise.resolve(),
        groups.length > 0 ? db.groups.bulkPut(groups) : Promise.resolve(),
        members.length > 0 ? db.members.bulkPut(members) : Promise.resolve(),
        invites.length > 0 ? db.invites.bulkPut(invites) : Promise.resolve(),
        categories.length > 0 ? db.categories.bulkPut(categories) : Promise.resolve(),
        transactions.length > 0 ? db.transactions.bulkPut(transactions) : Promise.resolve(),
        recurrences.length > 0 ? db.recurrences.bulkPut(recurrences) : Promise.resolve(),
        attachments.length > 0 ? db.attachments.bulkPut(attachments) : Promise.resolve(),
        budgets.length > 0 ? db.budgets.bulkPut(budgets) : Promise.resolve(),
        goals.length > 0 ? db.goals.bulkPut(goals) : Promise.resolve(),
        syncEvents.length > 0 ? db.syncEvents.bulkPut(syncEvents) : Promise.resolve(),
        conflicts.length > 0 ? db.conflicts.bulkPut(conflicts) : Promise.resolve(),
        accounts.length > 0 ? db.accounts.bulkPut(accounts) : Promise.resolve(),
      ])

      // 7. Commit new keystore
      await db.keystoreTable.put({
        id: 1,
        salt: newSalt,
        pinCheck: newPinCheck,
        pinChangeInProgress: false,
      })

      setProgress('')
      onClose()
      reset()
    } catch (e) {
      // Restore old key if available
      setError(String(e).replace('Error: ', ''))
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) {
          reset()
          onClose()
        }
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              Change PIN
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Current PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Enter current PIN"
              disabled={loading}
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              New PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="At least 4 digits"
              disabled={loading}
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Confirm new PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Repeat new PIN"
              disabled={loading}
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          {progress && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-text-secondary">{progress}</p>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            size="lg"
            onClick={handleChange}
            disabled={loading || !currentPin || !newPin || !confirmPin}
            className="w-full rounded-2xl font-semibold"
          >
            {loading ? progress || 'Working…' : 'Change PIN'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
