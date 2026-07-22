import { db } from '@/db/db'

/**
 * DEPRECATED — added 2026-07-22, remove after 2026-12-22.
 *
 * The 'upi' AccountType value was renamed to 'wallet' — UPI is a payment
 * rail, not a place money sits, so the old label conflated "how you paid"
 * with "where the money lives". The underlying concept (a prepaid balance
 * like Paytm/PhonePe) is still a real account, just renamed. Existing
 * accounts created with the old value are relabeled the first time their
 * group is opened post-unlock, since this can't run inside Dexie's schema
 * `upgrade()` — that only sees encrypted blobs, not the plaintext `type`.
 *
 * No telemetry in this app to confirm every device has run this — 5 months
 * is a judgment-call buffer for an offline PWA with infrequent opens. Delete
 * this function and its call in AppBootstrap.tsx after the date above.
 */
export async function migrateUpiAccounts(groupId: string): Promise<void> {
  const accounts = await db.accounts.where((a) => a.groupId === groupId)
  const legacyUpiAccounts = accounts.filter((a) => (a.type as string) === 'upi')
  for (const account of legacyUpiAccounts) {
    await db.accounts.update(account.accountId, {
      type: 'wallet',
      color: '#8b5cf6',
      icon: 'DeviceMobileIcon',
      updatedAt: Date.now(),
    })
  }
}
