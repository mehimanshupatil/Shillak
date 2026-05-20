/**
 * Vector clock management and delta computation.
 * Rule: only ever increment your own userId entry.
 */
import { db } from '@/db/db'
import type {
  Account,
  Budget,
  Category,
  Group,
  GroupMember,
  Recurrence,
  SavingsGoal,
  Transaction,
  User,
} from '@/db/schema'
import useAppStore from '@/stores/app.store'

export interface SyncDelta {
  fromUserId: string
  vectorClock: Record<string, number>
  group?: Group // space settings — LWW by updatedAt
  transactions: Transaction[]
  categories: Category[]
  members: GroupMember[]
  users: User[]
  budgets: Budget[]
  goals: SavingsGoal[]
  recurrences: Recurrence[]
  accounts: Account[]
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
 * Compute the max updatedAt/createdAt timestamp across all non-transaction
 * entities for a group. Used as `since` in computeDelta to let the peer skip
 * records they already have.
 */
export async function computeSince(groupId: string): Promise<number> {
  const [cats, mems, buds, gls, recs] = await Promise.all([
    db.categories.where((c) => c.groupId === groupId),
    db.members.where((m) => m.groupId === groupId),
    db.budgets.where((b) => b.groupId === groupId),
    db.goals.where((g) => g.groupId === groupId),
    db.recurrences.where((r) => r.groupId === groupId),
  ])
  return Math.max(
    0,
    ...cats.map((c) => c.createdAt),
    ...mems.map((m) => m.updatedAt),
    ...buds.map((b) => b.updatedAt),
    ...gls.map((g) => g.updatedAt),
    ...recs.map((r) => r.createdAt),
  )
}

/**
 * Compute what to send to a peer.
 *
 * @param theirClock  - peer's vector clock (filters transactions by authorSeq)
 * @param fromUserId  - this device's userId
 * @param since       - optional unix-ms timestamp; skip non-transaction entities whose
 *                      creation/update timestamp is ≤ this value. Pass the peer's max
 *                      entity timestamp so we only send genuinely new/changed records.
 *                      Absent = send all (first sync or unknown state).
 */
export async function computeDelta(
  groupId: string,
  theirClock: Record<string, number>,
  fromUserId: string,
  since?: number,
): Promise<SyncDelta> {
  const group = await db.groups.get(groupId)
  if (!group) throw new Error('Group not found')

  // Transactions: primary filter by authorSeq (owner-scoped clock).
  // Fallback: include if updatedAt > since to catch edits/deletes by non-owners
  // where authorSeq was stamped with the editor's clock, not the owner's.
  const allTxns = await db.transactions.where((t) => t.groupId === groupId)
  const ts = since ?? 0
  const transactions = allTxns.filter((t) => {
    const knownSeq = theirClock[t.ownerId] ?? 0
    if (t.authorSeq > knownSeq) return true
    return ts > 0 && t.updatedAt > ts
  })

  // Non-transaction entities: skip anything the peer already has (timestamp ≤ since).
  // Category has no updatedAt so we use createdAt; members/budgets/goals use updatedAt.
  const [allCategories, allMembers, allBudgets, allGoals, allRecurrences, allAccounts] =
    await Promise.all([
      db.categories.where((c) => c.groupId === groupId),
      db.members.where((m) => m.groupId === groupId),
      db.budgets.where((b) => b.groupId === groupId),
      db.goals.where((g) => g.groupId === groupId),
      db.recurrences.where((r) => r.groupId === groupId),
      db.accounts.where((a) => a.groupId === groupId),
    ])

  const categories = ts > 0 ? allCategories.filter((c) => c.createdAt > ts) : allCategories
  const members = ts > 0 ? allMembers.filter((m) => m.updatedAt > ts) : allMembers
  const budgets = ts > 0 ? allBudgets.filter((b) => b.updatedAt > ts) : allBudgets
  const goals = ts > 0 ? allGoals.filter((g) => g.updatedAt > ts) : allGoals
  const recurrences = ts > 0 ? allRecurrences.filter((r) => r.createdAt > ts) : allRecurrences
  const accounts = ts > 0 ? allAccounts.filter((a) => a.updatedAt > ts) : allAccounts

  // Users: only send profiles that are new to the peer
  const memberUserIds = allMembers.map((m) => m.userId)
  const userRecords = await db.users.bulkGet(memberUserIds)
  const allUsers = userRecords.filter((u): u is NonNullable<typeof u> => u !== undefined)
  const users = ts > 0 ? allUsers.filter((u) => u.createdAt > ts) : allUsers

  return {
    fromUserId,
    vectorClock: group.vectorClock,
    group,
    transactions,
    categories,
    members,
    users,
    budgets,
    goals,
    recurrences,
    accounts,
  }
}
