import { db } from '@/db/db'
import { activeAdmins } from '@/lib/adminInvariant'

export type RoleChangeResult = { ok: true } | { ok: false; reason: 'last-admin' }

/**
 * Promotes/demotes a member. Refuses a demotion that would leave the group
 * with zero active admins — promotion is never refused, it can't create the
 * violation. See adminInvariant.ts for why this doesn't call (or get called
 * by) conflict.ts's enforceAdminInvariant.
 */
export async function changeMemberRole(
  groupId: string,
  memberId: string,
  role: 'admin' | 'member',
): Promise<RoleChangeResult> {
  if (role === 'member') {
    const members = await db.members.where((m) => m.groupId === groupId && m.status === 'active')
    const target = members.find((m) => m.id === memberId)
    if (target?.role === 'admin' && activeAdmins(members).length <= 1) {
      return { ok: false, reason: 'last-admin' }
    }
  }
  await db.members.update(memberId, { role, updatedAt: Date.now() })
  return { ok: true }
}

/** Marks a member as left. Refuses removing the group's last active admin. */
export async function removeMember(groupId: string, memberId: string): Promise<RoleChangeResult> {
  const members = await db.members.where((m) => m.groupId === groupId && m.status === 'active')
  const target = members.find((m) => m.id === memberId)
  if (target?.role === 'admin' && activeAdmins(members).length <= 1) {
    return { ok: false, reason: 'last-admin' }
  }
  await db.members.update(memberId, { status: 'left', leftAt: Date.now(), updatedAt: Date.now() })
  return { ok: true }
}

// Tables holding a group's transactional data — deleted by both clearGroupData
// and deleteGroup. Membership/categories/accounts/invites survive a "clear
// data" but not a full "delete space".
async function clearGroupTables(groupId: string): Promise<void> {
  await db.transactions.deleteWhere((t) => t.groupId === groupId)
  await db.budgets.deleteWhere((b) => b.groupId === groupId)
  await db.goals.deleteWhere((g) => g.groupId === groupId)
  await db.attachments.deleteWhere((a) => a.groupId === groupId)
  await db.recurrences.deleteWhere((r) => r.groupId === groupId)
  await db.syncEvents.deleteWhere((e) => e.groupId === groupId)
  await db.conflicts.deleteWhere((c) => c.groupId === groupId)
}

/** Empties a space's transactional data. The group, its members, categories, and accounts survive. */
export async function clearGroupData(groupId: string): Promise<void> {
  await db.atomically(() => clearGroupTables(groupId))
}

/** Deletes a space entirely: every table's rows for this group, then the group itself. */
export async function deleteGroup(groupId: string): Promise<void> {
  await db.atomically(async () => {
    await clearGroupTables(groupId)
    await db.members.deleteWhere((m) => m.groupId === groupId)
    await db.categories.deleteWhere((c) => c.groupId === groupId)
    await db.accounts.deleteWhere((a) => a.groupId === groupId)
    await db.invites.deleteWhere((i) => i.groupId === groupId)
    await db.groups.delete(groupId)
  })
}
