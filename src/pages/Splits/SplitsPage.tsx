import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, Plus, Users2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import AddSplitSheet from '@/components/splits/AddSplitSheet'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { Split } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

function computeNetBalances(splits: Split[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const split of splits) {
    for (const share of split.shares.filter((s) => !s.settled)) {
      if (share.userId === split.paidBy) continue
      balances.set(split.paidBy, (balances.get(split.paidBy) ?? 0) + share.amount)
      balances.set(share.userId, (balances.get(share.userId) ?? 0) - share.amount)
    }
  }
  return balances
}

function minimizeTransfers(
  balances: Map<string, number>,
): Array<{ from: string; to: string; amount: number }> {
  const creditors = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]) as [string, number][]
  const debtors = [...balances.entries()].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]) as [
    string,
    number,
  ][]
  const result: Array<{ from: string; to: string; amount: number }> = []
  let i = 0
  let j = 0
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i]
    const debt = debtors[j]
    if (!cred || !debt) break
    const amount = Math.min(cred[1], -debt[1])
    result.push({ from: debt[0], to: cred[0], amount })
    cred[1] -= amount
    debt[1] += amount
    if (cred[1] === 0) i++
    if (debt[1] === 0) j++
  }
  return result
}

export default function SplitsPage() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const [addSheetOpen, setAddSheetOpen] = useState(false)

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const splits = useLiveQuery(
    () => (activeGroupId ? db.splits.where((s) => s.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const members = useLiveQuery(
    () =>
      activeGroupId
        ? db.members.where((m) => m.groupId === activeGroupId && m.status === 'active')
        : [],
    [activeGroupId],
  )

  const users = useLiveQuery(async () => {
    if (!members?.length) return {} as Record<string, { displayName: string; avatarColor: string }>
    const userIds = members.map((m) => m.userId)
    const userList = await db.users.bulkGet(userIds)
    const map: Record<string, { displayName: string; avatarColor: string }> = {}
    for (const u of userList) {
      if (u) map[u.userId] = { displayName: u.displayName, avatarColor: u.avatarColor }
    }
    return map
  }, [members])

  const { settlements, unsettledSplits } = useMemo(() => {
    const all = splits ?? []
    const active = all.filter((s) => s.shares.some((sh) => !sh.settled))
    const balances = computeNetBalances(active)
    return { settlements: minimizeTransfers(balances), unsettledSplits: active }
  }, [splits])

  const currency = group?.currency ?? 'INR'
  const allSplits = splits ?? []

  function userName(userId: string): string {
    if (userId === currentUserId) return 'You'
    return users?.[userId]?.displayName ?? 'Member'
  }

  async function handleSettleAll(fromUserId: string, toUserId: string) {
    const relevant = (splits ?? []).filter(
      (s) =>
        s.paidBy === toUserId && s.shares.some((sh) => sh.userId === fromUserId && !sh.settled),
    )
    for (const split of relevant) {
      const updatedShares = split.shares.map((sh) =>
        sh.userId === fromUserId ? { ...sh, settled: true, settledAt: Date.now() } : sh,
      )
      await db.splits.update(split.splitId, { shares: updatedShares })
    }
  }

  async function handleMarkShareSettled(splitId: string, userId: string) {
    const split = await db.splits.get(splitId)
    if (!split) return
    const updatedShares = split.shares.map((sh) =>
      sh.userId === userId ? { ...sh, settled: true, settledAt: Date.now() } : sh,
    )
    await db.splits.update(splitId, { shares: updatedShares })
  }

  return (
    <div className="flex flex-col pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-text-primary">Splits</h1>
      </div>

      {/* All settled banner */}
      {allSplits.length > 0 && unsettledSplits.length === 0 && (
        <div className="mx-4 mb-4 p-4 rounded-xl bg-surface border border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
            <Check size={16} className="text-success" />
          </div>
          <p className="text-sm font-medium text-success">All settled up!</p>
        </div>
      )}

      {/* Settlements needed */}
      {settlements.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            Settlements needed
          </p>
          <div className="flex flex-col gap-2">
            {settlements.map((s, i) => {
              const youInvolved = s.from === currentUserId || s.to === currentUserId
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable order from algorithm
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border"
                >
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span
                      className={`text-sm font-medium truncate ${
                        s.from === currentUserId ? 'text-danger' : 'text-text-primary'
                      }`}
                    >
                      {userName(s.from)}
                    </span>
                    <ArrowRight size={13} className="text-text-tertiary shrink-0" />
                    <span
                      className={`text-sm font-medium truncate ${
                        s.to === currentUserId ? 'text-success' : 'text-text-primary'
                      }`}
                    >
                      {userName(s.to)}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-text-primary shrink-0">
                    {formatCurrency(s.amount, currency)}
                  </span>
                  {youInvolved && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => handleSettleAll(s.from, s.to)}
                      className="gap-1 shrink-0"
                    >
                      <Check size={11} />
                      Settle
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unsettled splits */}
      {unsettledSplits.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            Unsettled expenses
          </p>
          <div className="flex flex-col gap-2">
            {unsettledSplits.map((split) => (
              <div key={split.splitId} className="p-3 rounded-xl bg-surface border border-border">
                <div className="mb-2">
                  <p className="text-sm font-medium text-text-primary">
                    {split.note || 'Shared expense'}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Paid by {userName(split.paidBy)} · {formatCurrency(split.total, currency)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {split.shares
                    .filter((sh) => !sh.settled && sh.userId !== split.paidBy)
                    .map((sh) => (
                      <div key={sh.userId} className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">
                          {userName(sh.userId)} owes{' '}
                          <span className="font-mono font-medium text-text-primary">
                            {formatCurrency(sh.amount, currency)}
                          </span>
                        </span>
                        {(sh.userId === currentUserId || split.paidBy === currentUserId) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleMarkShareSettled(split.splitId, sh.userId)}
                            className="text-text-tertiary hover:text-success hover:bg-success/10"
                          >
                            <Check size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {allSplits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <Users2 size={40} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-tertiary">No shared expenses yet.</p>
          <p className="text-xs text-text-tertiary mt-1">Tap + to add a shared expense.</p>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setAddSheetOpen(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-accent
                   flex items-center justify-center shadow-lg z-30
                   active:scale-95 transition-transform"
        aria-label="Add shared expense"
      >
        <Plus size={24} className="text-black" strokeWidth={2.5} />
      </button>

      <AddSplitSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        groupId={activeGroupId ?? ''}
        currency={currency}
        members={members ?? []}
        users={users ?? {}}
      />
    </div>
  )
}
