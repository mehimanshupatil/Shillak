/**
 * Apply a received SyncDelta to the local DB.
 * Conflict strategy per entity type (see CLAUDE.md):
 *   - Transaction (own)       → no conflict, owner-scoped
 *   - Transaction (edited)    → LWW by updatedAt
 *   - Transaction (delete/edit conflict) → ConflictLog → user
 *   - Budget / SavingsGoal    → ConflictLog → user
 *   - Category / GroupMember  → LWW by updatedAt + admin invariant
 */
import { db } from '@/db/db'
import type { ConflictLog, SyncEvent } from '@/db/schema'
import type { SyncDelta } from './vector-clock'
import { mergeClock } from './vector-clock'

interface ApplyResult {
  recordsApplied: number
  conflictsFound: number
  syncEvent: SyncEvent
}

export async function applyDelta(
  delta: SyncDelta,
  groupId: string,
  syncId: string,
  method: 'webrtc' | 'qr' | 'json',
  initiatedBy: string,
): Promise<ApplyResult> {
  let applied = 0
  let conflicts = 0

  // ── Transactions ──────────────────────────────────────────────────────────
  for (const incoming of delta.transactions) {
    const existing = await db.transactions.get(incoming.txnId)

    if (!existing) {
      await db.transactions.put(incoming)
      applied++
      continue
    }

    // Delete/edit conflict: one side deleted, other edited
    if (
      (existing.deletedAt !== null && incoming.deletedAt === null) ||
      (existing.deletedAt === null && incoming.deletedAt !== null)
    ) {
      await logConflict(
        groupId,
        syncId,
        'transaction',
        incoming.txnId,
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
      )
      conflicts++
      continue
    }

    // LWW by updatedAt
    if (incoming.updatedAt > existing.updatedAt) {
      await db.transactions.put(incoming)
      applied++
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  // Only write if not already present — never overwrite the local user's own profile.
  // Remote user profiles are accepted as-is (they own their own name/avatar).
  for (const incoming of delta.users ?? []) {
    const existing = await db.users.get(incoming.userId)
    if (!existing) {
      await db.users.put(incoming)
      applied++
    }
    // If exists: the owner of that userId is the authoritative source — skip overwrite.
    // They'll send their own updated profile next time they edit it (future: add updatedAt to User).
  }

  // ── Categories ────────────────────────────────────────────────────────────
  for (const incoming of delta.categories) {
    const existing = await db.categories.get(incoming.categoryId)
    if (!existing || incoming.createdAt >= existing.createdAt) {
      await db.categories.put(incoming)
      applied++
    }
  }

  // ── Members ───────────────────────────────────────────────────────────────
  for (const incoming of delta.members) {
    const existing = await db.members.get(incoming.id)
    if (!existing || incoming.updatedAt > existing.updatedAt) {
      await db.members.put(incoming)
      applied++
    }
  }

  // ── Budgets ───────────────────────────────────────────────────────────────
  for (const incoming of delta.budgets) {
    const existing = await db.budgets.get(incoming.budgetId)
    if (!existing) {
      await db.budgets.put(incoming)
      applied++
      continue
    }
    if (incoming.updatedAt > existing.updatedAt) {
      // Conflict: both sides modified the same budget
      await logConflict(
        groupId,
        syncId,
        'budget',
        incoming.budgetId,
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
      )
      conflicts++
    }
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  for (const incoming of delta.goals) {
    const existing = await db.goals.get(incoming.goalId)
    if (!existing) {
      await db.goals.put(incoming)
      applied++
      continue
    }
    if (incoming.updatedAt > existing.updatedAt) {
      await logConflict(
        groupId,
        syncId,
        'goal',
        incoming.goalId,
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
      )
      conflicts++
    }
  }

  // ── Splits ────────────────────────────────────────────────────────────────
  for (const incoming of delta.splits) {
    const existing = await db.splits.get(incoming.splitId)
    if (!existing) {
      await db.splits.put(incoming)
      applied++
    }
    // Splits are immutable once created — skip if exists
  }

  // ── Recurrences ───────────────────────────────────────────────────────────
  for (const incoming of delta.recurrences) {
    const existing = await db.recurrences.get(incoming.recurrenceId)
    if (!existing) {
      await db.recurrences.put(incoming)
      applied++
    } else if (incoming.createdAt >= existing.createdAt) {
      await db.recurrences.put(incoming)
      applied++
    }
  }

  // ── Merge vector clocks ───────────────────────────────────────────────────
  const group = await db.groups.get(groupId)
  if (group) {
    const merged = mergeClock(group.vectorClock, delta.vectorClock)
    await db.groups.update(groupId, { vectorClock: merged, updatedAt: Date.now() })
  }

  // ── Admin invariant ───────────────────────────────────────────────────────
  await enforceAdminInvariant(groupId)

  // ── Log SyncEvent ─────────────────────────────────────────────────────────
  const syncEvent: SyncEvent = {
    syncId,
    groupId,
    initiatedBy,
    method,
    syncedWith: delta.fromUserId,
    recordsSent: 0, // caller fills this in after the fact
    recordsReceived: delta.transactions.length + delta.categories.length + delta.members.length,
    conflictsFound: conflicts,
    status: conflicts > 0 ? 'partial' : 'ok',
    syncedAt: Date.now(),
  }
  await db.syncEvents.put(syncEvent)

  return { recordsApplied: applied, conflictsFound: conflicts, syncEvent }
}

async function logConflict(
  groupId: string,
  syncId: string,
  entityType: 'transaction' | 'budget' | 'goal',
  entityId: string,
  localValue: Record<string, unknown>,
  remoteValue: Record<string, unknown>,
): Promise<void> {
  const conflict: ConflictLog = {
    conflictId: crypto.randomUUID(),
    groupId,
    syncId,
    entityType,
    entityId,
    localValue,
    remoteValue,
    resolvedBy: null,
    resolution: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
  }
  await db.conflicts.put(conflict)
}

/**
 * Admin invariant: after every sync apply, ensure exactly one admin per group.
 * 0 admins → promote member with oldest joinedAt
 * 2+ admins → keep the one with newest updatedAt, demote rest
 */
async function enforceAdminInvariant(groupId: string): Promise<void> {
  const members = await db.members.where((m) => m.groupId === groupId && m.status === 'active')
  const admins = members.filter((m) => m.role === 'admin')

  if (admins.length === 0 && members.length > 0) {
    // Promote oldest member
    const oldest = members.sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (!oldest) return
    await db.members.update(oldest.id, { role: 'admin', updatedAt: Date.now() })
  } else if (admins.length > 1) {
    // Keep newest updatedAt, demote rest
    const sorted = admins.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const admin of sorted.slice(1)) {
      await db.members.update(admin.id, { role: 'member', updatedAt: Date.now() })
    }
  }
}
