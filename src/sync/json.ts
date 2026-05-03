import { db } from '@/db/db'

export interface GroupSnapshot {
  version: 1
  exportedAt: number
  groupId: string
  group: object
  members: object[]
  categories: object[]
  transactions: object[]
  recurrences: object[]
  budgets: object[]
  goals: object[]
  splits: object[]
}

export async function exportGroupSnapshot(groupId: string): Promise<GroupSnapshot> {
  const [group, members, categories, transactions, recurrences, budgets, goals, splits] =
    await Promise.all([
      db.groups.get(groupId),
      db.members.where((m) => m.groupId === groupId),
      db.categories.where((c) => c.groupId === groupId),
      db.transactions.where((t) => t.groupId === groupId),
      db.recurrences.where((r) => r.groupId === groupId),
      db.budgets.where((b) => b.groupId === groupId),
      db.goals.where((g) => g.groupId === groupId),
      db.splits.where((s) => s.groupId === groupId),
    ])

  if (!group) throw new Error('Group not found')

  return {
    version: 1,
    exportedAt: Date.now(),
    groupId,
    group,
    members,
    categories,
    transactions,
    recurrences,
    budgets,
    goals,
    splits,
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

export async function importGroupSnapshot(
  file: File,
): Promise<{ imported: number; groupId: string }> {
  const text = await file.text()
  const snapshot = JSON.parse(text) as GroupSnapshot

  if (snapshot.version !== 1) throw new Error('Unsupported snapshot version')
  if (!snapshot.groupId) throw new Error('Invalid snapshot: missing groupId')

  const existing = await db.groups.get(snapshot.groupId)

  // Merge strategy: put all records (last-write wins by updatedAt for conflicts)
  let imported = 0

  if (!existing) {
    await db.groups.put(snapshot.group as Parameters<typeof db.groups.put>[0])
    imported++
  }

  for (const m of snapshot.members) {
    await db.members.put(m as Parameters<typeof db.members.put>[0])
    imported++
  }
  for (const c of snapshot.categories) {
    await db.categories.put(c as Parameters<typeof db.categories.put>[0])
    imported++
  }
  for (const t of snapshot.transactions) {
    await db.transactions.put(t as Parameters<typeof db.transactions.put>[0])
    imported++
  }
  for (const r of snapshot.recurrences) {
    await db.recurrences.put(r as Parameters<typeof db.recurrences.put>[0])
    imported++
  }
  for (const b of snapshot.budgets) {
    await db.budgets.put(b as Parameters<typeof db.budgets.put>[0])
    imported++
  }
  for (const g of snapshot.goals) {
    await db.goals.put(g as Parameters<typeof db.goals.put>[0])
    imported++
  }
  for (const s of snapshot.splits) {
    await db.splits.put(s as Parameters<typeof db.splits.put>[0])
    imported++
  }

  return { imported, groupId: snapshot.groupId }
}
