/**
 * Displays pending ConflictLog entries and lets the user resolve them.
 * Shown as a sheet or inline section when conflicts > 0.
 */

import { WarningIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { ConflictLog } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import useAppStore from '@/stores/app.store'
import { incrementVectorClock } from '@/sync/vector-clock'

interface Props {
  groupId: string
}

export default function ConflictResolver({ groupId }: Props) {
  const currentUserId = useAppStore((s) => s.currentUserId)

  const pending = useLiveQuery(
    () => db.conflicts.where((c) => c.groupId === groupId && c.resolution === 'pending'),
    [groupId],
  )

  if (!pending || pending.length === 0) return null

  async function resolve(conflict: ConflictLog, resolution: 'local' | 'remote') {
    if (!currentUserId) return

    // Stamp resolution time so this version is unambiguously newest.
    // On next sync the other device receives it and applies via LWW without re-raising conflict.
    const resolvedAt = Date.now()
    const chosen = {
      ...(resolution === 'local' ? conflict.localValue : conflict.remoteValue),
      updatedAt: resolvedAt,
    }

    if (conflict.entityType === 'transaction') {
      if (groupId) {
        const newSeq = await incrementVectorClock(groupId, currentUserId)
        ;(chosen as Record<string, unknown>).authorSeq = newSeq
      }
      await db.transactions.put(chosen as unknown as Parameters<typeof db.transactions.put>[0])
    } else if (conflict.entityType === 'budget') {
      await db.budgets.put(chosen as unknown as Parameters<typeof db.budgets.put>[0])
    } else if (conflict.entityType === 'goal') {
      await db.goals.put(chosen as unknown as Parameters<typeof db.goals.put>[0])
    }

    await db.conflicts.update(conflict.conflictId, {
      resolution,
      resolvedBy: currentUserId,
      resolvedAt,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <WarningIcon size={14} className="text-warning" />
        <p className="text-xs font-medium text-warning uppercase tracking-wider">
          {pending.length} conflict{pending.length > 1 ? 's' : ''} need your review
        </p>
      </div>

      {pending.map((conflict) => (
        <ConflictCard key={conflict.conflictId} conflict={conflict} onResolve={resolve} />
      ))}
    </div>
  )
}

function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: ConflictLog
  onResolve: (c: ConflictLog, r: 'local' | 'remote') => void
}) {
  const local = conflict.localValue
  const remote = conflict.remoteValue

  function label(val: Record<string, unknown>): string {
    if (conflict.entityType === 'transaction') {
      const amount = typeof val.amount === 'number' ? formatCurrency(val.amount) : '?'
      const note = typeof val.note === 'string' && val.note ? ` · ${val.note}` : ''
      const deleted = val.deletedAt != null ? ' [deleted]' : ''
      return `${amount}${note}${deleted}`
    }
    if (conflict.entityType === 'budget') {
      const limit = typeof val.limit === 'number' ? formatCurrency(val.limit) : '?'
      return `Limit: ${limit}`
    }
    if (conflict.entityType === 'goal') {
      const saved = typeof val.saved === 'number' ? formatCurrency(val.saved) : '?'
      const target = typeof val.target === 'number' ? formatCurrency(val.target) : '?'
      return `${saved} / ${target}`
    }
    return JSON.stringify(val).slice(0, 60)
  }

  return (
    <div className="p-3 rounded-xl bg-surface border border-border">
      <p className="text-xs font-medium text-text-secondary mb-2 capitalize">
        {conflict.entityType} conflict
      </p>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 p-2 rounded-lg bg-surface-2">
          <p className="text-[10px] text-text-tertiary mb-0.5">Your version</p>
          <p className="text-xs text-text-primary">{label(local)}</p>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-surface-2">
          <p className="text-[10px] text-text-tertiary mb-0.5">Their version</p>
          <p className="text-xs text-text-primary">{label(remote)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onResolve(conflict, 'local')}
          className="flex-1"
        >
          Keep mine
        </Button>
        <Button size="sm" onClick={() => onResolve(conflict, 'remote')} className="flex-1">
          Keep theirs
        </Button>
      </div>
    </div>
  )
}
