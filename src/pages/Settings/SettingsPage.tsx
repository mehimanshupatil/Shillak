import {
  ArrowCircleDownIcon,
  CaretRightIcon,
  CrownIcon,
  DownloadSimpleIcon,
  FingerprintIcon,
  PencilIcon,
  PlusIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConflictSeeder from '@/components/dev/ConflictSeeder'
import BiometricSheet from '@/components/security/BiometricSheet'
import ChangePinSheet from '@/components/security/ChangePinSheet'
import EditProfileSheet from '@/components/space/EditProfileSheet'
import EditSpaceSheet from '@/components/space/EditSpaceSheet'
import InviteSheet from '@/components/space/InviteSheet'
import MemberIncomeSheet from '@/components/space/MemberIncomeSheet'
import SyncSheet from '@/components/sync/SyncSheet'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/button'
import { disableBiometric, isBiometricAvailable } from '@/crypto/biometric'
import { broadcastLock } from '@/crypto/keystore'
import { db } from '@/db/db'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
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
  const [biometricSheetOpen, setBiometricSheetOpen] = useState(false)
  const [syncSheetOpen, setSyncSheetOpen] = useState(false)
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const [memberActionsFor, setMemberActionsFor] = useState<string | null>(null)
  const [storageUsedPct, setStorageUsedPct] = useState<number | null>(null)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
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

  const memberUsers = useLiveQuery(async () => {
    if (!members?.length) return {}
    const userIds = members.map((m) => m.userId)
    const users = await db.users.bulkGet(userIds)
    return Object.fromEntries(
      users.filter((u): u is NonNullable<typeof u> => u !== undefined).map((u) => [u.userId, u]),
    )
  }, [members])

  const isAdmin = members?.some((m) => m.userId === currentUserId && m.role === 'admin') ?? false

  const lastSync = useLiveQuery(async () => {
    if (!activeGroupId) return null
    const events = await db.syncEvents.where(
      (e) => e.groupId === activeGroupId && e.status === 'ok',
    )
    return events.sort((a, b) => b.syncedAt - a.syncedAt)[0] ?? null
  }, [activeGroupId])

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
    isBiometricAvailable().then(setBiometricAvailable)
    db.keystoreTable.get(1).then((ks) => {
      setBiometricEnrolled(!!ks?.biometricCredentialId)
    })
  }, [])

  async function handlePromote(memberId: string, _userId: string) {
    if (!activeGroupId) return
    await db.members.update(memberId, { role: 'admin', updatedAt: Date.now() })
    setMemberActionsFor(null)
  }

  async function handleDemote(memberId: string, _userId: string) {
    if (!activeGroupId) return
    const admins = (members ?? []).filter((m) => m.role === 'admin')
    if (admins.length <= 1) {
      alert('Cannot demote — space must have at least one admin.')
      return
    }
    await db.members.update(memberId, { role: 'member', updatedAt: Date.now() })
    setMemberActionsFor(null)
  }

  async function handleRemoveMember(memberId: string, _userId: string) {
    if (!activeGroupId) return
    const target = (members ?? []).find((m) => m.id === memberId)
    if (!target) return
    if (target.role === 'admin') {
      const admins = (members ?? []).filter((m) => m.role === 'admin')
      if (admins.length <= 1) {
        alert('Cannot remove last admin. Promote another member first.')
        return
      }
    }
    if (!confirm(`Remove this member from the space? They will lose access.`)) return
    await db.members.update(memberId, { status: 'left', leftAt: Date.now(), updatedAt: Date.now() })
    setMemberActionsFor(null)
  }

  function handleLock() {
    clearKey()
    broadcastLock()
  }

  async function handleClearSpaceData() {
    if (!activeGroupId) return
    if (
      !confirm(
        'Delete all transactions, budgets, and goals in this space?\nSpace settings, categories, and members are kept.',
      )
    )
      return
    if (!confirm('This cannot be undone. Continue?')) return

    const [txns, budgets, goals, attachments, recurrences, syncEvents, conflicts] =
      await Promise.all([
        db.transactions.where((t) => t.groupId === activeGroupId),
        db.budgets.where((b) => b.groupId === activeGroupId),
        db.goals.where((g) => g.groupId === activeGroupId),
        db.attachments.where((a) => a.groupId === activeGroupId),
        db.recurrences.where((r) => r.groupId === activeGroupId),
        db.syncEvents.where((e) => e.groupId === activeGroupId),
        db.conflicts.where((c) => c.groupId === activeGroupId),
      ])

    await Promise.all([
      ...txns.map((t) => db.transactions.delete(t.txnId)),
      ...budgets.map((b) => db.budgets.delete(b.budgetId)),
      ...goals.map((g) => db.goals.delete(g.goalId)),
      ...attachments.map((a) => db.attachments.delete(a.attachmentId)),
      ...recurrences.map((r) => db.recurrences.delete(r.recurrenceId)),
      ...syncEvents.map((e) => db.syncEvents.delete(e.syncId)),
      ...conflicts.map((c) => db.conflicts.delete(c.conflictId)),
    ])
  }

  async function handleDeleteSpace() {
    if (!activeGroupId) return
    const spaceName = group?.name ?? 'this space'
    if (!confirm(`Delete "${spaceName}" and all its data?\nThis cannot be undone.`)) return
    if (!confirm(`Last chance — permanently delete "${spaceName}"?`)) return

    const [
      txns,
      budgets,
      goals,
      attachments,
      recurrences,
      syncEvents,
      conflicts,
      mems,
      cats,
      accs,
      invitesList,
    ] = await Promise.all([
      db.transactions.where((t) => t.groupId === activeGroupId),
      db.budgets.where((b) => b.groupId === activeGroupId),
      db.goals.where((g) => g.groupId === activeGroupId),
      db.attachments.where((a) => a.groupId === activeGroupId),
      db.recurrences.where((r) => r.groupId === activeGroupId),
      db.syncEvents.where((e) => e.groupId === activeGroupId),
      db.conflicts.where((c) => c.groupId === activeGroupId),
      db.members.where((m) => m.groupId === activeGroupId),
      db.categories.where((c) => c.groupId === activeGroupId),
      db.accounts.where((a) => a.groupId === activeGroupId),
      db.invites.where((i) => i.groupId === activeGroupId),
    ])

    await Promise.all([
      ...txns.map((t) => db.transactions.delete(t.txnId)),
      ...budgets.map((b) => db.budgets.delete(b.budgetId)),
      ...goals.map((g) => db.goals.delete(g.goalId)),
      ...attachments.map((a) => db.attachments.delete(a.attachmentId)),
      ...recurrences.map((r) => db.recurrences.delete(r.recurrenceId)),
      ...syncEvents.map((e) => db.syncEvents.delete(e.syncId)),
      ...conflicts.map((c) => db.conflicts.delete(c.conflictId)),
      ...mems.map((m) => db.members.delete(m.id)),
      ...cats.map((c) => db.categories.delete(c.categoryId)),
      ...accs.map((a) => db.accounts.delete(a.accountId)),
      ...invitesList.map((i) => db.invites.delete(i.inviteId)),
    ])
    await db.groups.delete(activeGroupId)

    const remaining = await db.groups.toArray()
    if (remaining.length > 0) {
      useAppStore.getState().setActiveGroupId(remaining[0]!.groupId)
    } else {
      localStorage.removeItem('shillak_group_id')
      useAppStore.setState({ activeGroupId: null })
    }
    navigate('/')
  }

  return (
    <div className="px-4 pt-6 pb-24 flex flex-col gap-6">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>

      {/* ── Group ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Space</p>
          {group && isAdmin && (
            <Button variant="link" onClick={() => setGroupSheetOpen(true)}>
              <PencilIcon size={11} />
              Edit
            </Button>
          )}
        </div>
        {group ? (
          <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
            <div className="p-4 flex items-center gap-3">
              <Avatar
                color={group.avatarColor}
                name={group.name}
                icon={group.avatarIcon}
                size={36}
                rounded="xl"
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
          </div>
        ) : (
          <div className="h-20 rounded-2xl bg-surface border border-border animate-pulse" />
        )}
      </section>

      {/* ── Categories & Accounts ── */}
      <section>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Customise
        </p>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border overflow-hidden">
          <button
            type="button"
            onClick={() => navigate('/settings/categories')}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Manage categories</span>
            <CaretRightIcon size={16} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings/accounts')}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Manage accounts</span>
            <CaretRightIcon size={16} className="text-text-tertiary" />
          </button>
        </div>
      </section>

      {/* ── Members ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Household Members
          </p>
          {activeGroupId && currentUserId && isAdmin && (
            <Button variant="link" onClick={() => setInviteSheetOpen(true)}>
              <PlusIcon size={12} />
              Invite
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {(members ?? []).map((member) => {
            const isMe = member.userId === currentUserId
            const actionsOpen = memberActionsFor === member.id
            return (
              <div
                key={member.id}
                className="flex flex-col rounded-xl bg-surface border border-border overflow-hidden"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar
                    color={memberUsers?.[member.userId]?.avatarColor ?? '#888'}
                    name={memberUsers?.[member.userId]?.displayName ?? member.userId}
                    icon={memberUsers?.[member.userId]?.avatarIcon}
                    size={32}
                    rounded="full"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {isMe
                        ? (user?.displayName ?? 'You')
                        : (memberUsers?.[member.userId]?.displayName ?? member.userId)}
                      {isMe && <span className="text-text-tertiary"> (you)</span>}
                    </p>
                    {member.monthlyIncome != null && member.monthlyIncome > 0 && (
                      <p className="text-xs text-text-tertiary">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: member.incomeCurrency ?? 'INR',
                          maximumFractionDigits: 0,
                        }).format(member.monthlyIncome / 100)}
                        /mo
                      </p>
                    )}
                  </div>
                  {member.role === 'admin' && <CrownIcon size={13} className="text-accent" />}
                  <span className="text-xs text-text-tertiary capitalize">{member.role}</span>
                  {isMe ? (
                    <button
                      type="button"
                      onClick={() => setIncomeSheetOpen(true)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
                      aria-label="Edit income"
                    >
                      <PencilIcon size={12} />
                    </button>
                  ) : isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setMemberActionsFor(actionsOpen ? null : member.id)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
                      aria-label="Member actions"
                    >
                      <CaretRightIcon
                        size={12}
                        className={`transition-transform ${actionsOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                  ) : null}
                </div>
                {actionsOpen && isAdmin && (
                  <div className="flex gap-1.5 px-3 pb-2.5 border-t border-border/50 pt-2">
                    {member.role === 'member' ? (
                      <button
                        type="button"
                        onClick={() => handlePromote(member.id, member.userId)}
                        className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium"
                      >
                        Make admin
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDemote(member.id, member.userId)}
                        className="px-3 py-1.5 rounded-lg bg-surface-2 text-text-secondary text-xs font-medium"
                      >
                        Remove admin
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id, member.userId)}
                      className="px-3 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-medium"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )
          })}
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
              <PencilIcon size={11} />
              Edit
            </Button>
          )}
        </div>
        {user ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border">
            <Avatar
              color={user.avatarColor}
              name={user.displayName}
              icon={user.avatarIcon}
              size={44}
              rounded="full"
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
            <DownloadSimpleIcon size={16} className="text-text-tertiary" />
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-surface-2"
          >
            <span className="text-sm text-text-primary">Import snapshot</span>
            <UploadSimpleIcon size={16} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() => setSyncSheetOpen(true)}
            disabled={!activeGroupId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-surface-2 disabled:opacity-50"
          >
            <div className="flex flex-col items-baseline">
              <span className="text-sm text-text-primary">Sync with another device</span>
              {lastSync ? (
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Last synced{' '}
                  {new Date(lastSync.syncedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {lastSync.method}
                </p>
              ) : (
                <p className="text-[11px] text-text-tertiary mt-0.5">Never synced</p>
              )}
            </div>
            <CaretRightIcon size={16} className="text-text-tertiary" />
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
            <CaretRightIcon size={16} className="text-text-tertiary" />
          </button>
          {biometricAvailable && (
            <button
              type="button"
              onClick={async () => {
                if (biometricEnrolled) {
                  await disableBiometric()
                  setBiometricEnrolled(false)
                } else {
                  setBiometricSheetOpen(true)
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="text-sm text-text-primary flex items-center gap-2">
                <FingerprintIcon
                  size={15}
                  className={biometricEnrolled ? 'text-success' : 'text-text-tertiary'}
                />
                {biometricEnrolled ? 'Disable biometric unlock' : 'Enable biometric unlock'}
              </span>
              <CaretRightIcon size={16} className="text-text-tertiary" />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              currentUserId && exportIdentityBackup(currentUserId).catch((e) => alert(String(e)))
            }
            disabled={!currentUserId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-sm text-text-primary">Export identity backup</span>
            <DownloadSimpleIcon size={16} className="text-text-tertiary" />
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
          <ArrowCircleDownIcon size={16} />
          Install app
        </Button>
      )}

      {/* ── Danger zone ── */}
      <section>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Danger zone
        </p>
        <div className="rounded-2xl bg-surface border border-danger/30 divide-y divide-danger/20 overflow-hidden">
          <button
            type="button"
            onClick={handleClearSpaceData}
            disabled={!activeGroupId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-danger/5 disabled:opacity-50"
          >
            <div className="flex flex-col items-start">
              <span className="text-sm text-danger">Clear space data</span>
              <span className="text-xs text-text-tertiary mt-0.5 ">
                Deletes all transactions, budgets & goals. Keeps space settings.
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={handleDeleteSpace}
            disabled={!activeGroupId}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors
                       hover:bg-danger/5 disabled:opacity-50"
          >
            <div className="flex flex-col items-start">
              <span className="text-sm text-danger">Delete this space</span>
              <span className="text-xs text-text-tertiary mt-0.5">
                Permanently removes all data for this space.
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* ── Dev tools ── */}
      {import.meta.env.DEV && <ConflictSeeder />}

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
      {currentUserId && (
        <BiometricSheet
          open={biometricSheetOpen}
          onClose={() => {
            setBiometricSheetOpen(false)
            db.keystoreTable.get(1).then((ks) => setBiometricEnrolled(!!ks?.biometricCredentialId))
          }}
          userId={currentUserId}
        />
      )}
      <SyncSheet open={syncSheetOpen} onClose={() => setSyncSheetOpen(false)} />
      {activeGroupId && currentUserId && (
        <InviteSheet
          open={inviteSheetOpen}
          onClose={() => setInviteSheetOpen(false)}
          groupId={activeGroupId}
          userId={currentUserId}
        />
      )}
      {(() => {
        const myMember = (members ?? []).find((m) => m.userId === currentUserId)
        return myMember && group ? (
          <MemberIncomeSheet
            open={incomeSheetOpen}
            onClose={() => setIncomeSheetOpen(false)}
            member={myMember}
            defaultCurrency={group.currency}
          />
        ) : null
      })()}
    </div>
  )
}
