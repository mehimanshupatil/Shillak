/**
 * Group invite QR flow.
 *
 * Invite payload (JSON, ~450 chars → version-10 QR at level M — scannable at full-screen size):
 *   { v, inviteId, groupId, groupName, groupColor, currency, splitEnabled, incomeTracking,
 *     createdByName, memberCount, groupSecret, expiresAt, sig }
 *   sig = HMAC-SHA256(canonical string, key=groupSecret)
 *
 * Canonical string (pipe-delimited, deterministic):
 *   v|inviteId|groupId|groupName|groupColor|currency|splitEnabled|incomeTracking|
 *   createdByName|memberCount|groupSecret|expiresAt
 */

import { fromBase64, toBase64 } from '@/crypto/encrypt'
import { db } from '@/db/db'
import type { Group, GroupMember } from '@/db/schema'
import { createDefaultCategories } from '@/db/seeds'

export interface InvitePayload {
  v: 1
  inviteId: string
  groupId: string
  groupName: string
  groupColor: string
  currency: string
  splitEnabled: boolean
  incomeTracking: boolean
  createdByName: string
  memberCount: number
  groupSecret: string // base64 32 bytes
  expiresAt: number
  sig: string // HMAC-SHA256 base64
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────

async function importHmacKey(groupSecret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(groupSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

function canonicalString(p: Omit<InvitePayload, 'sig'>): string {
  return [
    p.v,
    p.inviteId,
    p.groupId,
    p.groupName,
    p.groupColor,
    p.currency,
    p.splitEnabled ? '1' : '0',
    p.incomeTracking ? '1' : '0',
    p.createdByName,
    p.memberCount,
    p.groupSecret,
    p.expiresAt,
  ].join('|')
}

async function sign(payload: Omit<InvitePayload, 'sig'>): Promise<string> {
  const key = await importHmacKey(payload.groupSecret, 'sign')
  const buf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(canonicalString(payload)),
  )
  return toBase64(new Uint8Array(buf))
}

async function verify(payload: Omit<InvitePayload, 'sig'>, sig: string): Promise<boolean> {
  const key = await importHmacKey(payload.groupSecret, 'verify')
  return crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64(sig),
    new TextEncoder().encode(canonicalString(payload)),
  )
}

// ─── Generate invite ──────────────────────────────────────────────────────────

/** Admin calls this. Returns a JSON string suitable for QR display. */
export async function generateInvite(groupId: string, createdBy: string): Promise<string> {
  const [group, members, creator] = await Promise.all([
    db.groups.get(groupId),
    db.members.where((m) => m.groupId === groupId && m.status === 'active'),
    db.users.get(createdBy),
  ])
  if (!group) throw new Error('Group not found')
  if (!creator) throw new Error('User not found')

  const base: Omit<InvitePayload, 'sig'> = {
    v: 1,
    inviteId: crypto.randomUUID(),
    groupId: group.groupId,
    groupName: group.name,
    groupColor: group.avatarColor,
    currency: group.currency,
    splitEnabled: group.splitEnabled,
    incomeTracking: group.incomeTracking,
    createdByName: creator.displayName,
    memberCount: members.length,
    groupSecret: group.groupSecret,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
  }

  const sig = await sign(base)
  return JSON.stringify({ ...base, sig })
}

// ─── Parse + verify ───────────────────────────────────────────────────────────

export async function parseAndVerifyInvite(qrData: string): Promise<InvitePayload> {
  let parsed: unknown
  try {
    parsed = JSON.parse(qrData)
  } catch {
    throw new Error('Not a valid invite QR')
  }

  const p = parsed as InvitePayload
  if (p.v !== 1) throw new Error('Unsupported invite version')
  if (!p.groupId || !p.groupSecret || !p.sig || !p.inviteId) {
    throw new Error('Invalid invite — missing required fields')
  }
  if (p.expiresAt < Date.now()) {
    throw new Error('Invite has expired — ask the admin to generate a new one')
  }

  const { sig, ...rest } = p
  const valid = await verify(rest, sig)
  if (!valid) throw new Error('Invite signature invalid — QR may be corrupted or tampered')

  return p
}

export function isInvite(qrData: string): boolean {
  try {
    const p = JSON.parse(qrData) as {
      v?: unknown
      groupId?: unknown
      groupSecret?: unknown
      sig?: unknown
    }
    return (
      p.v === 1 &&
      typeof p.groupId === 'string' &&
      typeof p.groupSecret === 'string' &&
      typeof p.sig === 'string'
    )
  } catch {
    return false
  }
}

// ─── Join group ───────────────────────────────────────────────────────────────

/** Called after user confirms join. Creates group + member records. */
export async function joinGroupFromInvite(invite: InvitePayload, userId: string): Promise<void> {
  const existing = await db.groups.get(invite.groupId)

  if (!existing) {
    const group: Group = {
      groupId: invite.groupId,
      name: invite.groupName,
      avatarColor: invite.groupColor,
      createdBy: userId,
      currency: invite.currency,
      fiscalYearStart: 4,
      splitEnabled: invite.splitEnabled,
      incomeTracking: invite.incomeTracking,
      visibility: 'full',
      status: 'active',
      groupSecret: invite.groupSecret,
      vectorClock: { [userId]: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.groups.put(group)

    const cats = createDefaultCategories(invite.groupId, userId)
    await db.categories.bulkAdd(cats)
  }

  const existingMember = await db.members.where(
    (m) => m.groupId === invite.groupId && m.userId === userId,
  )
  if (existingMember.length === 0) {
    const member: GroupMember = {
      id: crypto.randomUUID(),
      groupId: invite.groupId,
      userId,
      role: 'member',
      status: 'active',
      joinedAt: Date.now(),
      leftAt: null,
      nickname: null,
      monthlyIncome: null,
      incomeCurrency: null,
      updatedAt: Date.now(),
    }
    await db.members.put(member)
  }
}
