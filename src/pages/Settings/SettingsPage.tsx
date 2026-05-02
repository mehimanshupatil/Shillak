import { useLiveQuery } from 'dexie-react-hooks'
import { broadcastLock } from '@/crypto/keystore'
import { db } from '@/db/db'
import { Button } from '@/components/ui/button'
import useAppStore from '@/stores/app.store'
import useKeyStore from '@/stores/key.store'

export default function SettingsPage() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const clearKey = useKeyStore((s) => s.clearKey)

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  function handleLock() {
    clearKey()
    broadcastLock()
    // AppBootstrap will detect key=null and show PinScreen
  }

  return (
    <div className="px-4 pt-6 flex flex-col gap-6">
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Settings</h1>

      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        <div className="p-4">
          <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
            Group
          </p>
          <p className="text-base font-medium text-[var(--color-text-primary)] mt-0.5">
            {group?.name ?? '…'}
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {group?.currency} · Fiscal yr starts month {group?.fiscalYearStart}
          </p>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Split bills</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {group?.splitEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Income tracking</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {group?.incomeTracking ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleLock}
        className="w-full h-12 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
                   text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]"
      >
        Lock app
      </Button>

      <p className="text-xs text-[var(--color-text-tertiary)] text-center">
        Sync, categories, members — coming in Phase 2 & 3.
      </p>
    </div>
  )
}
