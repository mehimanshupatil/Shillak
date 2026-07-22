import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createKeystore, verifyPin } from '@/crypto/keystore'
import { db } from '@/db/db'
import { PIN_LENGTH } from '@/lib/constants'
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
    if (newPin.length !== PIN_LENGTH) {
      setError(`New PIN must be ${PIN_LENGTH} digits`)
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
    let oldKey: CryptoKey | undefined
    try {
      // 1. Verify current PIN — keep the derived key so we can restore it if
      // anything below fails.
      setProgress('Verifying current PIN…')
      const ks = await db.keystoreTable.get(1)
      if (!ks) throw new Error('Keystore not found')
      oldKey = await verifyPin(currentPin, ks.salt, ks.pinCheck)

      // 2. Generate new keystore data
      setProgress('Generating new key…')
      const { key: newKey, salt: newSalt, pinCheck: newPinCheck } = await createKeystore(newPin)

      // 3. Durable checkpoint — old salt/pinCheck stay primary (still fully
      // valid) but the pending new ones are persisted now, before
      // re-encryption starts. If the app crashes anywhere after this point,
      // resolveUnlock() (crypto/keystore.ts) can find both candidates and
      // figure out — by testing against real data, not just pinCheck —
      // which one the data actually ended up under.
      await db.keystoreTable.put({
        ...ks,
        pinChangeInProgress: true,
        pendingSalt: newSalt,
        pendingPinCheck: newPinCheck,
      })

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

      // 6. Write all records back with new key — atomic: either every table
      // re-encrypts or none does, even though each write is async over Web
      // Crypto (see db.atomically()'s doc comment and docs/adr/0001).
      await db.atomically(async () => {
        if (users.length > 0) await db.users.bulkPut(users)
        if (groups.length > 0) await db.groups.bulkPut(groups)
        if (members.length > 0) await db.members.bulkPut(members)
        if (invites.length > 0) await db.invites.bulkPut(invites)
        if (categories.length > 0) await db.categories.bulkPut(categories)
        if (transactions.length > 0) await db.transactions.bulkPut(transactions)
        if (recurrences.length > 0) await db.recurrences.bulkPut(recurrences)
        if (attachments.length > 0) await db.attachments.bulkPut(attachments)
        if (budgets.length > 0) await db.budgets.bulkPut(budgets)
        if (goals.length > 0) await db.goals.bulkPut(goals)
        if (syncEvents.length > 0) await db.syncEvents.bulkPut(syncEvents)
        if (conflicts.length > 0) await db.conflicts.bulkPut(conflicts)
        if (accounts.length > 0) await db.accounts.bulkPut(accounts)
      })

      // 7. Commit new keystore, clearing the pending checkpoint
      await db.keystoreTable.put({
        id: 1,
        salt: newSalt,
        pinCheck: newPinCheck,
        pinChangeInProgress: false,
        userId: ks.userId,
        pendingSalt: null,
        pendingPinCheck: null,
      })

      setProgress('')
      onClose()
      reset()
    } catch (e) {
      // Re-encryption is atomic (db.atomically()), so if we got past step 3
      // the data itself is still fully under the old key regardless of where
      // this failed — safe to just restore the old key and revert the
      // checkpoint rather than leave pinChangeInProgress set.
      if (oldKey) {
        setKey(oldKey)
        const ks = await db.keystoreTable.get(1)
        if (ks?.pinChangeInProgress) {
          await db.keystoreTable.put({
            ...ks,
            pinChangeInProgress: false,
            pendingSalt: null,
            pendingPinCheck: null,
          })
        }
      }
      setError(String(e).replace('Error: ', ''))
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) {
          reset()
          onClose()
        }
      }}
    >
      <DrawerContent
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-base font-semibold text-text-primary">
              Change PIN
            </DrawerTitle>
          </DrawerHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Current PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
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
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder={`${PIN_LENGTH} digits`}
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
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
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
      </DrawerContent>
    </Drawer>
  )
}
