import { db } from '@/db/db'
import { advanceDate, generateId, today } from '@/lib/utils'
import { incrementVectorClock } from '@/sync/vector-clock'

export async function processRecurrences(groupId: string, userId: string): Promise<void> {
  const now = today()
  const due = await db.recurrences.where(
    (r) => r.groupId === groupId && r.ownerId === userId && r.active && r.nextDue <= now,
  )

  for (const rec of due) {
    let dueDate = rec.nextDue

    while (dueDate <= now) {
      const existing = await db.transactions.where(
        (t) => t.recurrenceId === rec.recurrenceId && t.date === dueDate,
      )

      if (existing.length === 0) {
        const newSeq = await incrementVectorClock(groupId, userId)

        await db.transactions.put({
          ...rec.template,
          txnId: generateId(),
          date: dueDate,
          recurrenceId: rec.recurrenceId,
          authorSeq: newSeq,
          deletedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }

      dueDate = advanceDate(dueDate, rec.frequency, rec.interval)
      if (rec.endDate && dueDate > rec.endDate) break
    }

    await db.recurrences.update(rec.recurrenceId, {
      nextDue: dueDate,
      lastGeneratedAt: Date.now(),
    })
  }
}
