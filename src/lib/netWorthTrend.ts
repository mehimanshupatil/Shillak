import { db } from '@/db/db'
import type { AccountType, Transaction } from '@/db/schema'
import { toBaseCurrency, today } from '@/lib/utils'

const WINDOW_MONTHS = 12

export interface NetWorthPoint {
  year: number
  month: number // 0-indexed
  netWorth: number
}

export interface NetWorthTrendResult {
  points: NetWorthPoint[]
}

function monthBuckets(now: Date): Array<{ year: number; month: number; cutoff: number }> {
  const buckets: Array<{ year: number; month: number; cutoff: number }> = []
  for (let i = WINDOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const isCurrentMonth = i === 0
    const cutoff = isCurrentMonth ? today() : Date.UTC(year, month + 1, 1) - 1
    buckets.push({ year, month, cutoff })
  }
  return buckets
}

/**
 * Signed delta this transaction contributes to `accountId`'s running balance.
 * For credit accounts the running balance means "amount owed", so the sign is
 * flipped relative to an asset account: a charge increases what's owed, a
 * payment (transfer-in) decreases it.
 */
function deltaFor(
  txn: Transaction,
  accountId: string,
  accountType: AccountType,
  currency: string,
): number {
  const amount = toBaseCurrency(txn, currency)
  let delta = 0
  if (txn.accountId === accountId) {
    delta = txn.type === 'income' ? amount : -amount // expense or transfer-out
  } else if (txn.toAccountId === accountId && txn.type === 'transfer') {
    delta = amount
  }
  return accountType === 'credit' ? -delta : delta
}

/**
 * Household net worth (asset accounts minus credit-account liabilities) at
 * each month-end for the trailing 12 months. Single running-balance pass per
 * account. An account contributes nothing to months before its createdAt —
 * omitted, not zeroed, so it doesn't show as a phantom $0 account.
 */
export async function computeNetWorthTrend(
  groupId: string,
  currency: string,
): Promise<NetWorthTrendResult> {
  const now = new Date()
  const buckets = monthBuckets(now)

  const [accounts, transactions] = await Promise.all([
    db.accounts.where((a) => a.groupId === groupId),
    db.transactions.where((t) => t.groupId === groupId && t.deletedAt === null),
  ])

  const netWorthByBucket = new Array(buckets.length).fill(0) as number[]
  const anyAccountByBucket = new Array(buckets.length).fill(false) as boolean[]

  for (const account of accounts) {
    const sign = account.type === 'credit' ? -1 : 1
    const relevant = transactions
      .filter((t) => t.accountId === account.accountId || t.toAccountId === account.accountId)
      .sort((a, b) => a.date - b.date)

    let running = account.openingBalance ?? 0
    let idx = 0
    for (let b = 0; b < buckets.length; b++) {
      const bucket = buckets[b] as { year: number; month: number; cutoff: number }
      while (idx < relevant.length && (relevant[idx] as Transaction).date <= bucket.cutoff) {
        running += deltaFor(relevant[idx] as Transaction, account.accountId, account.type, currency)
        idx++
      }
      if (bucket.cutoff < account.createdAt) continue // account didn't exist yet — omit
      netWorthByBucket[b] = (netWorthByBucket[b] ?? 0) + sign * running
      anyAccountByBucket[b] = true
    }
  }

  const points: NetWorthPoint[] = buckets
    .map((bucket, b) => ({
      year: bucket.year,
      month: bucket.month,
      netWorth: netWorthByBucket[b] ?? 0,
      hasData: anyAccountByBucket[b],
    }))
    .filter((p) => p.hasData)
    .map(({ year, month, netWorth }) => ({ year, month, netWorth }))

  return { points }
}
