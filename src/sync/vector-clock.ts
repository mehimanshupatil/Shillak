/**
 * Vector clock management and delta computation.
 * Rule: only ever increment your own userId entry.
 */
import { db } from '@/db/db'
import type {
  Budget,
  Category,
  GroupMember,
  Recurrence,
  SavingsGoal,
  Split,
  Transaction,
} from '@/db/schema'
import useAppStore from '@/stores/app.store'

export interface SyncDelta {
  fromUserId: string
  vectorClock: Record<string, number>
  transactions: Transaction[]
  categories: Category[]
  members: GroupMember[]
  budgets: Budget[]
  goals: SavingsGoal[]
  splits: Split[]
  recurrences: Recurrence[]
}

/**
 * Increment this user's entry in the group vector clock.
 * Throws if userId !== currentUserId — never increment another user's clock.
 * Returns the new sequence number.
 */
export async function incrementVectorClock(groupId: string, userId: string): Promise<number> {
  const currentUserId = useAppStore.getState().currentUserId
  if (userId !== currentUserId) {
    throw new Error(`incrementVectorClock: userId ${userId} !== currentUserId ${currentUserId}`)
  }

  const group = await db.groups.get(groupId)
  if (!group) throw new Error('Group not found')

  const newSeq = (group.vectorClock[userId] ?? 0) + 1
  await db.groups.update(groupId, {
    vectorClock: { ...group.vectorClock, [userId]: newSeq },
    updatedAt: Date.now(),
  })
  return newSeq
}

/**
 * Merge two vector clocks — take max of each entry.
 */
export function mergeClock(
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...local }
  for (const [userId, seq] of Object.entries(remote)) {
    merged[userId] = Math.max(merged[userId] ?? 0, seq)
  }
  return merged
}

/**
 * Compute what to send to a peer, given what they already know (theirClock).
 * Sends all records where authorSeq > theirClock[ownerId] for that owner.
 * Transactions are owner-scoped. Other entities (categories, budgets, goals) are always included
 * if their updatedAt is newer than what peer might have seen.
 */
export async function computeDelta(
  groupId: string,
  theirClock: Record<string, number>,
  fromUserId: string,
): Promise<SyncDelta> {
  const group = await db.groups.get(groupId)
  if (!group) throw new Error('Group not found')

  // Transactions: include all where authorSeq > theirClock[ownerId]
  const allTxns = await db.transactions.where((t) => t.groupId === groupId)
  const transactions = allTxns.filter((t) => {
    const knownSeq = theirClock[t.ownerId] ?? 0
    return t.authorSeq > knownSeq
  })

  // Categories, members, budgets, goals, splits, recurrences:
  // Always send all — peer applies with LWW by updatedAt.
  // This is simpler and safe since these tables are small.
  const [categories, members, budgets, goals, splits, recurrences] = await Promise.all([
    db.categories.where((c) => c.groupId === groupId),
    db.members.where((m) => m.groupId === groupId),
    db.budgets.where((b) => b.groupId === groupId),
    db.goals.where((g) => g.groupId === groupId),
    db.splits.where((s) => s.groupId === groupId),
    db.recurrences.where((r) => r.groupId === groupId),
  ])

  return {
    fromUserId,
    vectorClock: group.vectorClock,
    transactions,
    categories,
    members,
    budgets,
    goals,
    splits,
    recurrences,
  }
}
