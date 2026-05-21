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

  // ── Users ─────────────────────────────────────────────────────────────────
  // Each user is authoritative about their own profile — always accept remote
  // updates for other users. Never overwrite this device's own profile
  // (initiatedBy = currentUserId) since the local copy is always more current.
  // Use keystore.userId as authoritative local identity — never let sync overwrite own profile.
  // Falls back to initiatedBy if keystore has no userId (pre-fix installs).
  const ks = await db.keystoreTable.get(1)
  const localUserId = ks?.userId ?? initiatedBy
  for (const incoming of delta.users ?? []) {
    if (incoming.userId !== localUserId) {
      await db.users.put(incoming)
      applied++
    }
  }

  // ── Categories (MUST run before transactions) ─────────────────────────────
  // Categories are applied first so that when transactions are written and
  // useLiveQuery fires, every categoryId is already resolvable.
  //
  // When both devices seeded defaults they have different UUIDs for the same
  // category (e.g. "Food/expense"). The dedup skip must record a remap so
  // incoming transactions that reference the remote UUID can be rewritten to
  // the local UUID — otherwise those transactions permanently show "Unknown".
  const existingCats = await db.categories.where((c) => c.groupId === groupId)
  const existingByNameType = new Map(existingCats.map((c) => [`${c.name}|${c.type}`, c.categoryId]))
  // incomingCategoryId → localCategoryId for any skipped-duplicate categories
  const categoryIdRemap = new Map<string, string>()

  for (const incoming of delta.categories) {
    const existing = await db.categories.get(incoming.categoryId)
    if (!existing) {
      const localId = existingByNameType.get(`${incoming.name}|${incoming.type}`)
      if (localId) {
        // Duplicate seed — record remap so incoming transactions can resolve
        categoryIdRemap.set(incoming.categoryId, localId)
        continue
      }
      await db.categories.put(incoming)
      existingByNameType.set(`${incoming.name}|${incoming.type}`, incoming.categoryId)
      applied++
    } else if (incoming.createdAt >= existing.createdAt) {
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

  // ── Transactions (after categories so useLiveQuery sees resolved IDs) ─────
  for (const incoming of delta.transactions) {
    // Remap categoryId if it was a deduped category on this device
    const txn =
      categoryIdRemap.size > 0 && categoryIdRemap.has(incoming.categoryId)
        ? {
            ...incoming,
            categoryId: categoryIdRemap.get(incoming.categoryId) ?? incoming.categoryId,
          }
        : incoming

    const existing = await db.transactions.get(txn.txnId)

    if (!existing) {
      await db.transactions.put(txn)
      applied++
      continue
    }

    // Delete/edit conflict: one side deleted, other edited.
    // If incoming is clearly newer it may be a propagated resolution — apply LWW.
    // Only raise a conflict when local is newer or same age (ambiguous intent).
    if (
      (existing.deletedAt !== null && txn.deletedAt === null) ||
      (existing.deletedAt === null && txn.deletedAt !== null)
    ) {
      if (txn.updatedAt > existing.updatedAt) {
        await db.transactions.put(txn)
        applied++
      } else {
        await logConflict(
          groupId,
          syncId,
          'transaction',
          txn.txnId,
          existing as unknown as Record<string, unknown>,
          txn as unknown as Record<string, unknown>,
        )
        conflicts++
      }
      continue
    }

    // LWW by updatedAt
    if (txn.updatedAt > existing.updatedAt) {
      await db.transactions.put(txn)
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

  // ── Accounts ──────────────────────────────────────────────────────────────
  for (const incoming of delta.accounts ?? []) {
    const existing = await db.accounts.get(incoming.accountId)
    if (!existing) {
      await db.accounts.put(incoming)
      applied++
    } else if (incoming.updatedAt > existing.updatedAt) {
      await db.accounts.put(incoming)
      applied++
    }
  }

  // ── Merge vector clocks + apply space settings ────────────────────────────
  const group = await db.groups.get(groupId)
  if (group) {
    const merged = mergeClock(group.vectorClock, delta.vectorClock)
    if (delta.group && delta.group.updatedAt > group.updatedAt) {
      // Accept remote space settings (LWW), but keep local secrets and clocks
      await db.groups.update(groupId, {
        name: delta.group.name,
        avatarColor: delta.group.avatarColor,
        avatarIcon: delta.group.avatarIcon,
        currency: delta.group.currency,
        fiscalYearStart: delta.group.fiscalYearStart,
        visibility: delta.group.visibility,
        status: delta.group.status,
        vectorClock: merged,
        updatedAt: delta.group.updatedAt,
      })
    } else {
      await db.groups.update(groupId, { vectorClock: merged, updatedAt: Date.now() })
    }
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
