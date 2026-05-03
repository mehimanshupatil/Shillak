import { db } from '@/db/db'
import type { User } from '@/db/schema'

interface IdentityBackup {
  version: 1
  userId: string
  displayName: string
  avatarColor: string
  salt: string // keystore.salt — needed to re-derive key
  pinCheck: string // keystore.pinCheck — verifies PIN on restore
  exportedAt: number
}

export async function exportIdentityBackup(userId: string): Promise<void> {
  const [user, ks] = await Promise.all([db.users.get(userId), db.keystoreTable.get(1)])
  if (!user || !ks) throw new Error('User or keystore not found')

  const backup: IdentityBackup = {
    version: 1,
    userId: user.userId,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    salt: ks.salt,
    pinCheck: ks.pinCheck,
    exportedAt: Date.now(),
  }

  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shillak-identity-${user.displayName.toLowerCase().replace(/\s+/g, '-')}.shillak-id`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importIdentityBackup(file: File): Promise<{ user: User; requiresPin: true }> {
  const text = await file.text()
  const backup = JSON.parse(text) as IdentityBackup

  if (backup.version !== 1) throw new Error('Unsupported backup version')
  if (!backup.userId || !backup.salt || !backup.pinCheck) {
    throw new Error('Invalid backup file — missing required fields')
  }

  // Restore keystore — PIN will be verified on next PinScreen unlock
  await db.keystoreTable.put({
    id: 1,
    salt: backup.salt,
    pinCheck: backup.pinCheck,
    pinChangeInProgress: false,
  })

  // Restore user record
  const user: User = {
    userId: backup.userId,
    displayName: backup.displayName,
    avatarColor: backup.avatarColor,
    identityBackupHint: '',
    createdAt: backup.exportedAt,
  }
  await db.users.put(user)

  return { user, requiresPin: true }
}
