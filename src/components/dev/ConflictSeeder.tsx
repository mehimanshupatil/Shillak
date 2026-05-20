/**
 * Dev-only tool to seed ConflictLog entries for testing the ConflictResolver UI.
 * Only rendered when import.meta.env.DEV is true.
 */

import { FlaskIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { Budget, ConflictLog, SavingsGoal, Transaction } from '@/db/schema'
import useAppStore from '@/stores/app.store'

export default function ConflictSeeder() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const [status, setStatus] = useState('')

  if (!activeGroupId || !currentUserId) return null

  async function seedAll() {
    if (!activeGroupId || !currentUserId) return
    setStatus('Seeding…')
    try {
      const now = Date.now()
      const syncId = 'dev-seed-sync'

      // ── Txn: delete/edit conflict ─────────────────────────────────────────
      const txnBase: Transaction = {
        txnId: 'dev-txn-conflict',
        groupId: activeGroupId,
        ownerId: currentUserId,
        authorSeq: 1,
        categoryId: '',
        type: 'expense',
        amount: 84900,
        currency: 'INR',
        fxRate: null,
        originalAmount: null,
        note: 'Dinner at Suzette',
        tags: [],
        date: Date.UTC(2025, 4, 15),
        attachmentIds: [],
        recurrenceId: null,
        accountId: null,
        paidBy: currentUserId,
        createdAt: now - 7200_000,
        updatedAt: now - 3600_000,
        deletedAt: null,
      }
      // Ensure transaction exists in DB so ConflictResolver can resolve to it
      await db.transactions.put(txnBase)
      const txnConflict: ConflictLog = {
        conflictId: 'dev-conflict-txn',
        groupId: activeGroupId,
        syncId,
        entityType: 'transaction',
        entityId: 'dev-txn-conflict',
        localValue: { ...txnBase, deletedAt: now - 1800_000 } as unknown as Record<string, unknown>,
        remoteValue: {
          ...txnBase,
          note: 'Dinner at Suzette (edited)',
          updatedAt: now - 1000,
        } as unknown as Record<string, unknown>,
        resolvedBy: null,
        resolution: 'pending',
        createdAt: now,
        resolvedAt: null,
      }
      await db.conflicts.put(txnConflict)

      // ── Budget: both sides modified ───────────────────────────────────────
      const budgetBase: Budget = {
        budgetId: 'dev-budget-conflict',
        groupId: activeGroupId,
        categoryId: '',
        limit: 500000,
        period: 'monthly',
        updatedAt: now - 3600_000,
      }
      await db.budgets.put(budgetBase)
      const budgetConflict: ConflictLog = {
        conflictId: 'dev-conflict-budget',
        groupId: activeGroupId,
        syncId,
        entityType: 'budget',
        entityId: 'dev-budget-conflict',
        localValue: { ...budgetBase, limit: 300000 } as unknown as Record<string, unknown>,
        remoteValue: { ...budgetBase, limit: 750000, updatedAt: now - 1000 } as unknown as Record<
          string,
          unknown
        >,
        resolvedBy: null,
        resolution: 'pending',
        createdAt: now,
        resolvedAt: null,
      }
      await db.conflicts.put(budgetConflict)

      // ── Goal: both sides updated saved amount ─────────────────────────────
      const goalBase: SavingsGoal = {
        goalId: 'dev-goal-conflict',
        groupId: activeGroupId,
        name: 'Emergency fund',
        target: 100000000,
        saved: 50000000,
        deadline: null,
        categoryId: null,
        createdAt: now - 7200_000,
        updatedAt: now - 3600_000,
      }
      await db.goals.put(goalBase)
      const goalConflict: ConflictLog = {
        conflictId: 'dev-conflict-goal',
        groupId: activeGroupId,
        syncId,
        entityType: 'goal',
        entityId: 'dev-goal-conflict',
        localValue: { ...goalBase, saved: 50000000 } as unknown as Record<string, unknown>,
        remoteValue: { ...goalBase, saved: 62500000, updatedAt: now - 1000 } as unknown as Record<
          string,
          unknown
        >,
        resolvedBy: null,
        resolution: 'pending',
        createdAt: now,
        resolvedAt: null,
      }
      await db.conflicts.put(goalConflict)

      setStatus('3 conflicts seeded — open Sync sheet to resolve')
    } catch (e) {
      setStatus(`Error: ${String(e)}`)
    }
  }

  async function clearAll() {
    await db.conflicts.update('dev-conflict-txn', {
      resolution: 'local',
      resolvedBy: currentUserId ?? '',
      resolvedAt: Date.now(),
    })
    await db.conflicts.update('dev-conflict-budget', {
      resolution: 'local',
      resolvedBy: currentUserId ?? '',
      resolvedAt: Date.now(),
    })
    await db.conflicts.update('dev-conflict-goal', {
      resolution: 'local',
      resolvedBy: currentUserId ?? '',
      resolvedAt: Date.now(),
    })
    setStatus('Cleared')
  }

  return (
    <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FlaskIcon size={14} className="text-warning" />
        <p className="text-xs font-medium text-warning uppercase tracking-wider">
          Dev: Conflict Testing
        </p>
      </div>
      <p className="text-xs text-text-secondary">
        Seeds 3 pending conflicts (txn delete/edit, budget, goal) into the DB. Open the Sync sheet
        to see and resolve them.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={seedAll} className="flex-1">
          Seed conflicts
        </Button>
        <Button size="sm" variant="ghost" onClick={clearAll}>
          <TrashIcon size={14} />
        </Button>
      </div>
      {status && <p className="text-[11px] text-text-tertiary">{status}</p>}
    </div>
  )
}
