import { db } from '@/db/db'
import { buildLedgerRow } from '@/lib/ledger/write'
import { advanceDate, generateId, today } from '@/lib/utils'
import { incrementVectorClock } from '@/sync/vector-clock'

export async function processRecurrences(groupId: string, userId: string): Promise<void> {
  const now = today()

  await db.atomically(async () => {
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

          await db.transactions.put(
            buildLedgerRow(
              generateId(),
              { ...rec.template, date: dueDate, recurrenceId: rec.recurrenceId },
              newSeq,
            ),
          )
        }

        dueDate = advanceDate(dueDate, rec.frequency, rec.interval)
        if (rec.endDate && dueDate > rec.endDate) break
      }

      await db.recurrences.update(rec.recurrenceId, {
        nextDue: dueDate,
        lastGeneratedAt: Date.now(),
        // Advancing past endDate exhausts the recurrence — retire it so it stops
        // surfacing as an active rule with a meaningless nextDue.
        active: rec.endDate === null || dueDate <= rec.endDate,
      })
    }
  })
}
