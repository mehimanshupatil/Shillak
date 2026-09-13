import { db } from '@/db/db'
import type { Group } from '@/db/schema'
import { applyDelta } from '@/sync/conflict'
import type { SyncDelta } from '@/sync/vector-clock'

interface GroupSnapshot {
  version: 1
  exportedAt: number
  /** Who took the Snapshot. Absent in files written before this was recorded. */
  exportedBy?: string
  groupId: string
  group: object
  members: object[]
  categories: object[]
  transactions: object[]
  recurrences: object[]
  budgets: object[]
  goals: object[]
  accounts: object[]
}

export async function exportGroupSnapshot(
  groupId: string,
  exportedBy: string,
): Promise<GroupSnapshot> {
  const [group, members, categories, transactions, recurrences, budgets, goals, accounts] =
    await Promise.all([
      db.groups.get(groupId),
      db.members.where((m) => m.groupId === groupId),
      db.categories.where((c) => c.groupId === groupId),
      db.transactions.where((t) => t.groupId === groupId),
      db.recurrences.where((r) => r.groupId === groupId),
      db.budgets.where((b) => b.groupId === groupId),
      db.goals.where((g) => g.groupId === groupId),
      db.accounts.where((a) => a.groupId === groupId),
    ])

  if (!group) throw new Error('Group not found')

  return {
    version: 1,
    exportedAt: Date.now(),
    exportedBy,
    groupId,
    group,
    members,
    categories,
    transactions,
    recurrences,
    budgets,
    goals,
    accounts,
  }
}

export function downloadSnapshot(snapshot: GroupSnapshot, groupName: string): void {
  const json = JSON.stringify(snapshot, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shillak-${groupName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.shillak`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Restores a Snapshot by handing it to the same apply path a Sync session uses.
 *
 * It used to be eight hand-written `put` loops: no clock merge, no conflict
 * detection, no admin invariant, no SyncEvent, and no atomicity — so a
 * half-finished import left a Space in a state nothing else in the app could
 * produce. `applyDelta` already advertised a `'json'` method it had no caller for.
 */
export async function importGroupSnapshot(
  file: File,
  currentUserId: string,
): Promise<{ imported: number; groupId: string }> {
  const text = await file.text()
  const snapshot = JSON.parse(text) as GroupSnapshot

  if (snapshot.version !== 1) throw new Error('Unsupported snapshot version')
  if (!snapshot.groupId) throw new Error('Invalid snapshot: missing groupId')

  const incomingGroup = snapshot.group as Group | undefined

  // Restoring onto a device that has never seen this Space: the group row has to
  // exist before the apply, which merges clocks into it and enforces the admin
  // invariant against it. See ADR-0002 for why a Snapshot can carry it at all.
  const existing = await db.groups.get(snapshot.groupId)
  if (!existing) {
    if (!incomingGroup) throw new Error('Invalid snapshot: missing space')
    await db.groups.put(incomingGroup)
  }

  const delta: SyncDelta = {
    fromUserId: snapshot.exportedBy ?? '',
    vectorClock: incomingGroup?.vectorClock ?? {},
    ...(incomingGroup && { group: incomingGroup }),
    transactions: (snapshot.transactions ?? []) as SyncDelta['transactions'],
    categories: (snapshot.categories ?? []) as SyncDelta['categories'],
    members: (snapshot.members ?? []) as SyncDelta['members'],
    users: [],
    budgets: (snapshot.budgets ?? []) as SyncDelta['budgets'],
    goals: (snapshot.goals ?? []) as SyncDelta['goals'],
    recurrences: (snapshot.recurrences ?? []) as SyncDelta['recurrences'],
    accounts: (snapshot.accounts ?? []) as SyncDelta['accounts'],
  }

  const result = await applyDelta(
    delta,
    snapshot.groupId,
    crypto.randomUUID(),
    'json',
    currentUserId,
  )

  return { imported: result.recordsApplied, groupId: snapshot.groupId }
}
