import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

export function usePendingConflictsCount(groupId: string | null): number {
  return useLiveQuery(
    async () => {
      if (!groupId) return 0
      const all = await db.conflicts.where(
        (c) => c.groupId === groupId && c.resolution === 'pending',
      )
      return all.length
    },
    [groupId],
    0,
  )
}
