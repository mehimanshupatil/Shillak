import type { Account, Transaction } from '@/db/schema'
import type { Ledger } from '@/lib/ledger/read'
import { balanceDelta } from '@/lib/ledger/read'
import { dateOnly } from '@/lib/utils'

const WINDOW_MONTHS = 12

export interface NetWorthPoint {
  year: number
  month: number // 0-indexed
  netWorth: number
}

export interface NetWorthTrendResult {
  points: NetWorthPoint[]
}

function monthBuckets(now: number): Array<{ year: number; month: number; cutoff: number }> {
  const anchor = new Date(now)
  const nowYear = anchor.getUTCFullYear()
  const nowMonth = anchor.getUTCMonth()

  const buckets: Array<{ year: number; month: number; cutoff: number }> = []
  for (let i = WINDOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(dateOnly(nowYear, nowMonth - i, 1))
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    const isCurrentMonth = i === 0
    const cutoff = isCurrentMonth ? now : dateOnly(year, month + 1, 1) - 1
    buckets.push({ year, month, cutoff })
  }
  return buckets
}

/**
 * Household net worth (asset accounts minus credit-account liabilities) at
 * each month-end for the trailing 12 months. Single running-balance pass per
 * account. An account contributes nothing to months before its createdAt —
 * omitted, not zeroed, so it doesn't show as a phantom $0 account.
 *
 * `now` is a midnight-UTC date supplied by the caller; nothing here reads the clock.
 */
export function computeNetWorthTrend(
  ledger: Ledger,
  accounts: Account[],
  now: number,
): NetWorthTrendResult {
  const buckets = monthBuckets(now)
  const transactions = ledger.transactions

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
        running += balanceDelta(relevant[idx] as Transaction, account, ledger)
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
