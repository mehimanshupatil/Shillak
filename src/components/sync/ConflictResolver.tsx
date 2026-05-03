/**
 * Displays pending ConflictLog entries and lets the user resolve them.
 * Shown as a sheet or inline section when conflicts > 0.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { ConflictLog } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

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

    // Apply chosen value to the DB
    const chosen = resolution === 'local' ? conflict.localValue : conflict.remoteValue

    if (conflict.entityType === 'transaction') {
      await db.transactions.put(chosen as unknown as Parameters<typeof db.transactions.put>[0])
    } else if (conflict.entityType === 'budget') {
      await db.budgets.put(chosen as unknown as Parameters<typeof db.budgets.put>[0])
    } else if (conflict.entityType === 'goal') {
      await db.goals.put(chosen as unknown as Parameters<typeof db.goals.put>[0])
    }

    await db.conflicts.update(conflict.conflictId, {
      resolution,
      resolvedBy: currentUserId,
      resolvedAt: Date.now(),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-[var(--color-warning)]" />
        <p className="text-xs font-medium text-[var(--color-warning)] uppercase tracking-wider">
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
    <div className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2 capitalize">
        {conflict.entityType} conflict
      </p>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 p-2 rounded-lg bg-[var(--color-surface-2)]">
          <p className="text-[10px] text-[var(--color-text-tertiary)] mb-0.5">Your version</p>
          <p className="text-xs text-[var(--color-text-primary)]">{label(local)}</p>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-[var(--color-surface-2)]">
          <p className="text-[10px] text-[var(--color-text-tertiary)] mb-0.5">Their version</p>
          <p className="text-xs text-[var(--color-text-primary)]">{label(remote)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => onResolve(conflict, 'local')}
          className="flex-1 h-8 text-xs rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]
                     hover:bg-[var(--color-surface-3)]"
        >
          Keep mine
        </Button>
        <Button
          onClick={() => onResolve(conflict, 'remote')}
          className="flex-1 h-8 text-xs rounded-lg bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)]"
        >
          Keep theirs
        </Button>
      </div>
    </div>
  )
}
