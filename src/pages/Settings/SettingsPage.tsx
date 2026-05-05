import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Crown, Download, MonitorDown, Pencil, Plus, Upload, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import EditSpaceSheet from '@/components/space/EditSpaceSheet'
import EditProfileSheet from '@/components/space/EditProfileSheet'
import InviteSheet from '@/components/space/InviteSheet'
import ChangePinSheet from '@/components/security/ChangePinSheet'
import SyncSheet from '@/components/sync/SyncSheet'
import { Button } from '@/components/ui/button'
import { broadcastLock } from '@/crypto/keystore'
import { db } from '@/db/db'
import useAppStore from '@/stores/app.store'
import useKeyStore from '@/stores/key.store'
import { exportIdentityBackup } from '@/sync/identity'
import { downloadSnapshot, exportGroupSnapshot, importGroupSnapshot } from '@/sync/json'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { canInstall, install } = useInstallPrompt()
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const clearKey = useKeyStore((s) => s.clearKey)

  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [changePinOpen, setChangePinOpen] = useState(false)
  const [syncSheetOpen, setSyncSheetOpen] = useState(false)
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)
  const [storageUsedPct, setStorageUsedPct] = useState<number | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const user = useLiveQuery(
    () => (currentUserId ? db.users.get(currentUserId) : undefined),
    [currentUserId],
  )

  const members = useLiveQuery(
    () =>
      activeGroupId
        ? db.members.where((m) => m.groupId === activeGroupId && m.status === 'active')
        : [],
    [activeGroupId],
  )

  const memberUsers = useLiveQuery(
    async () => {
      if (!members?.length) return {}
      const userIds = members.map((m) => m.userId)
      const users = await db.users.bulkGet(userIds)
      return Object.fromEntries(
        users.filter((u): u is NonNullable<typeof u> => u !== undefined).map((u) => [u.userId, u]),
      )
    },
    [members],
  )

  async function handleExport() {
    if (!activeGroupId || !group) return
    setExportLoading(true)
    try {
      const snapshot = await exportGroupSnapshot(activeGroupId)
      downloadSnapshot(snapshot, group.name)
    } catch (e) {
      alert(`Export failed: ${String(e)}`)
    } finally {
      setExportLoading(false)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const { imported } = await importGroupSnapshot(file)
      setImportMsg(`Imported ${imported} records.`)
      setTimeout(() => setImportMsg(''), 4000)
    } catch (err) {
      alert(`Import failed: ${String(err)}`)
    }
  }

  useEffect(() => {
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (quota && quota > 0) {
        setStorageUsedPct(((usage ?? 0) / quota) * 100)
      }
    })
  }, [])

  function handleLock() {
    clearKey()
    broadcastLock()
  }

  return (
    <div className="px-4 pt-6 pb-24 flex flex-col gap-6">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>

      {/* ── Group ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Space</p>
          {group && (
            <Button variant="link" onClick={() => setGroupSheetOpen(true)}>
              <Pencil size={11} />
              Edit
            </Button>
          )}
        </div>
        {group ? (
          <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
            <div className="p-4 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl shrink-0"
                style={{ backgroundColor: group.avatarColor }}
              />
              <div>
                <p className="text-base font-semibold text-text-primary">{group.name}</p>
                <p className="text-xs text-text-tertiary">
                  {group.currency} · Fiscal yr starts{' '}
                  {new Date(2000, group.fiscalYearStart - 1).toLocaleString('en-IN', {
                    month: 'long',
                  })}
                </p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">Split bills</span>
              <span
                className={`text-xs font-medium ${group.splitEnabled ? 'text-success' : 'text-text-tertiary'}`}
              >
                {group.splitEnabled ? 'On' : 'Off'}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">Income tracking</span>
              <span
                className={`text-xs font-medium ${group.incomeTracking ? 'text-success' : 'text-text-tertiary'}`}
              >
                {group.incomeTracking ? 'On' : 'Off'}
              </span>
            </div>
          </div>
        ) : (
          <div className="h-20 rounded-2xl bg-surface border border-border animate-pulse" />
        )}
      </section>

      {/* ── Categories ── */}
      <section>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Categories
        </p>
        <div className="rounded-2xl bg-surface border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => navigate('/settings/categories')}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Manage categories</span>
            <ChevronRight size={16} className="text-text-tertiary" />
          </button>
        </div>
      </section>

      {/* ── Members ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Members
          </p>
          {activeGroupId && currentUserId && (
            <Button variant="link" onClick={() => setInviteSheetOpen(true)}>
              <Plus size={12} />
              Invite
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {(members ?? []).map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: memberUsers?.[member.userId]?.avatarColor ?? '#888' }}
              >
                <User size={14} className="text-black" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {member.userId === currentUserId
                    ? (user?.displayName ?? 'You')
                    : (memberUsers?.[member.userId]?.displayName ?? member.userId)}
                  {member.userId === currentUserId && (
                    <span className="text-text-tertiary"> (you)</span>
                  )}
                </p>
              </div>
              {member.role === 'admin' && <Crown size={13} className="text-accent" />}
              <span className="text-xs text-text-tertiary capitalize">{member.role}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Profile ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Profile
          </p>
          {user && (
            <Button variant="link" onClick={() => setProfileSheetOpen(true)}>
              <Pencil size={11} />
              Edit
            </Button>
          )}
        </div>
        {user ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border">
            <div
              className="w-11 h-11 rounded-full shrink-0"
              style={{ backgroundColor: user.avatarColor }}
            />
            <div>
              <p className="text-base font-semibold text-text-primary">{user.displayName}</p>
              <p className="text-xs text-text-tertiary">Local profile · this device only</p>
            </div>
          </div>
        ) : (
          <div className="h-16 rounded-2xl bg-surface border border-border animate-pulse" />
        )}
      </section>

      {/* ── Data ── */}
      <section>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Data
        </p>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border overflow-hidden">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportLoading || !activeGroupId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-sm text-text-primary">
              {exportLoading ? 'Exporting…' : 'Export snapshot'}
            </span>
            <Download size={16} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Import snapshot</span>
            <Upload size={16} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() => setSyncSheetOpen(true)}
            disabled={!activeGroupId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-sm text-text-primary">Sync with another device</span>
            <ChevronRight size={16} className="text-text-tertiary" />
          </button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".shillak,application/json"
          onChange={handleImport}
          className="hidden"
        />
        {importMsg && <p className="text-xs text-success px-1 mt-1">{importMsg}</p>}

        {storageUsedPct !== null && (
          <div className="mt-3 px-1">
            <div className="flex justify-between text-xs text-text-tertiary mb-1">
              <span>Storage used</span>
              <span className={storageUsedPct >= 80 ? 'text-warning' : 'text-text-tertiary'}>
                {Math.round(storageUsedPct)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(storageUsedPct, 100)}%`,
                  backgroundColor:
                    storageUsedPct >= 90
                      ? 'var(--color-danger)'
                      : storageUsedPct >= 80
                        ? 'var(--color-warning)'
                        : 'var(--color-accent)',
                }}
              />
            </div>
            {storageUsedPct >= 80 && (
              <p className="text-xs text-warning mt-1">
                {storageUsedPct >= 90
                  ? 'Storage almost full — attachment uploads blocked.'
                  : 'Storage above 80% — consider exporting and clearing old data.'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Security ── */}
      <section>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Security
        </p>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border overflow-hidden">
          <button
            type="button"
            onClick={() => setChangePinOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Change PIN</span>
            <ChevronRight size={16} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() =>
              currentUserId && exportIdentityBackup(currentUserId).catch((e) => alert(String(e)))
            }
            disabled={!currentUserId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-sm text-text-primary">Export identity backup</span>
            <Download size={16} className="text-text-tertiary" />
          </button>
        </div>
      </section>

      {/* ── Install ── */}
      {canInstall && (
        <Button
          variant="secondary"
          size="lg"
          onClick={install}
          className="w-full rounded-2xl gap-2"
        >
          <MonitorDown size={16} />
          Install app
        </Button>
      )}

      {/* ── Lock ── */}
      <Button variant="destructive" size="lg" onClick={handleLock} className="w-full rounded-2xl">
        Lock app
      </Button>

      {/* Sheets */}
      {group && (
        <EditSpaceSheet
          open={groupSheetOpen}
          onClose={() => setGroupSheetOpen(false)}
          group={group}
        />
      )}
      {user && (
        <EditProfileSheet
          open={profileSheetOpen}
          onClose={() => setProfileSheetOpen(false)}
          user={user}
        />
      )}
      <ChangePinSheet open={changePinOpen} onClose={() => setChangePinOpen(false)} />
      <SyncSheet open={syncSheetOpen} onClose={() => setSyncSheetOpen(false)} />
      {activeGroupId && currentUserId && (
        <InviteSheet
          open={inviteSheetOpen}
          onClose={() => setInviteSheetOpen(false)}
          groupId={activeGroupId}
          userId={currentUserId}
        />
      )}
    </div>
  )
}
