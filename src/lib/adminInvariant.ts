import type { GroupMember } from '@/db/schema'

/**
 * Active admins among a group's members. Shared fact behind two different
 * policies: conflict.ts's enforceAdminInvariant self-heals a violation after a
 * sync merge (corrective); spaceLifecycle's changeMemberRole/removeMember
 * refuse an action that would create one (preventive). Neither wraps the
 * other — they just agree on what "how many admins" means.
 */
export function activeAdmins(members: GroupMember[]): GroupMember[] {
  return members.filter((m) => m.status === 'active' && m.role === 'admin')
}
