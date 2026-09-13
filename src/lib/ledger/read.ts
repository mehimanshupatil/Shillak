import { db } from '@/db/db'
import type { Account, Category, GroupMember, Transaction, TransactionType } from '@/db/schema'
import { dateOnly, toBaseCurrency, toDateOnly } from '@/lib/utils'

/**
 * A Space's live Ledger, decrypted once. Every question below reads this array
 * rather than going back to storage, because `EncryptedTable.where()` decrypts
 * the whole table to run a predicate — asking eleven questions used to mean
 * eleven full decrypts.
 */
export interface Ledger {
  /** Transactions that have not been voided, in no particular order. */
  transactions: Transaction[]
  /** The Space's Base currency — every figure below is expressed in it. */
  currency: string
}

/** Inclusive bounds, in midnight-UTC unix ms. Either end may be open. */
export interface DateRange {
  from?: number
  to?: number
}

/**
 * Builds a Ledger from raw rows, dropping anything voided. Voiding is a soft
 * delete — the row stays so peers can learn it was withdrawn — so this is the
 * one place that decides what counts as still being in the Ledger.
 */
export function ledgerFrom(transactions: Transaction[], currency: string): Ledger {
  return { transactions: transactions.filter((t) => t.deletedAt === null), currency }
}

/** The one read. Everything else is a pure question over the result. */
export async function loadLedger(groupId: string, currency: string): Promise<Ledger> {
  const rows = await db.transactions.where((t) => t.groupId === groupId)
  return ledgerFrom(rows, currency)
}

// ─── Internals ────────────────────────────────────────────────────────────────

function inRange(date: number, range: DateRange): boolean {
  if (range.from !== undefined && date < range.from) return false
  if (range.to !== undefined && date > range.to) return false
  return true
}

/**
 * A Transfer moves money between the household's own accounts, so it is neither
 * spending nor earning and never counts toward either figure.
 */
function isSpendOrEarning(txn: Transaction): boolean {
  return txn.type !== 'transfer'
}

function amountOf(txn: Transaction, ledger: Ledger): number {
  return toBaseCurrency(txn, ledger.currency)
}

// ─── Totals ───────────────────────────────────────────────────────────────────

export interface Totals {
  income: number
  expense: number
  /** income − expense. Negative means the household spent more than it earned. */
  net: number
}

/** What the household earned and spent over a period. Transfers excluded. */
export function totals(ledger: Ledger, range: DateRange = {}): Totals {
  let income = 0
  let expense = 0

  for (const txn of ledger.transactions) {
    if (!isSpendOrEarning(txn) || !inRange(txn.date, range)) continue
    if (txn.type === 'income') income += amountOf(txn, ledger)
    else expense += amountOf(txn, ledger)
  }

  return { income, expense, net: income - expense }
}

// ─── Spending by category ─────────────────────────────────────────────────────

export interface CategoryTotal {
  categoryId: string
  amount: number
}

/** Expense per category over a period, largest first. */
export function spendByCategory(ledger: Ledger, range: DateRange = {}): CategoryTotal[] {
  const byCategory = new Map<string, number>()

  for (const txn of ledger.transactions) {
    if (txn.type !== 'expense' || !inRange(txn.date, range)) continue
    byCategory.set(txn.categoryId, (byCategory.get(txn.categoryId) ?? 0) + amountOf(txn, ledger))
  }

  return Array.from(byCategory, ([categoryId, amount]) => ({ categoryId, amount })).sort(
    (a, b) => b.amount - a.amount,
  )
}

/** Expense within one category over a period — what a Budget is measured against. */
export function spendInCategory(ledger: Ledger, categoryId: string, range: DateRange = {}): number {
  let total = 0
  for (const txn of ledger.transactions) {
    if (txn.type !== 'expense' || txn.categoryId !== categoryId) continue
    if (!inRange(txn.date, range)) continue
    total += amountOf(txn, ledger)
  }
  return total
}

/** Income within one category over a period — how a Goal linked to a category grows. */
export function earnedInCategory(
  ledger: Ledger,
  categoryId: string,
  range: DateRange = {},
): number {
  let total = 0
  for (const txn of ledger.transactions) {
    if (txn.type !== 'income' || txn.categoryId !== categoryId) continue
    if (!inRange(txn.date, range)) continue
    total += amountOf(txn, ledger)
  }
  return total
}

// ─── Month by month ───────────────────────────────────────────────────────────

export interface MonthTotals extends Totals {
  year: number
  /** 0-indexed, like Date's UTC month. */
  month: number
}

/**
 * The trailing `months` calendar months ending with the one containing `today`,
 * oldest first. `today` is a parameter so every caller is testable at any date
 * and nothing here reads the clock.
 */
export function monthlyTotals(
  ledger: Ledger,
  options: { today: number; months: number },
): MonthTotals[] {
  const anchor = new Date(options.today)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  const buckets: MonthTotals[] = []
  const indexByKey = new Map<string, number>()

  for (let i = options.months - 1; i >= 0; i--) {
    const start = new Date(dateOnly(year, month - i, 1))
    const y = start.getUTCFullYear()
    const m = start.getUTCMonth()
    indexByKey.set(`${y}-${m}`, buckets.length)
    buckets.push({ year: y, month: m, income: 0, expense: 0, net: 0 })
  }

  for (const txn of ledger.transactions) {
    if (!isSpendOrEarning(txn)) continue
    const d = new Date(txn.date)
    const index = indexByKey.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
    if (index === undefined) continue
    const bucket = buckets[index] as MonthTotals
    if (txn.type === 'income') bucket.income += amountOf(txn, ledger)
    else bucket.expense += amountOf(txn, ledger)
  }

  for (const bucket of buckets) bucket.net = bucket.income - bucket.expense
  return buckets
}

/**
 * Expense per category across the trailing `months`, each value oldest-first —
 * the shape a row of sparklines wants. Categories with no spending are absent.
 */
export function monthlySpendByCategory(
  ledger: Ledger,
  options: { today: number; months: number },
): Record<string, number[]> {
  const anchor = new Date(options.today)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  const indexByKey = new Map<string, number>()
  for (let i = options.months - 1; i >= 0; i--) {
    const start = new Date(dateOnly(year, month - i, 1))
    indexByKey.set(`${start.getUTCFullYear()}-${start.getUTCMonth()}`, options.months - 1 - i)
  }

  const byCategory: Record<string, number[]> = {}
  for (const txn of ledger.transactions) {
    if (txn.type !== 'expense') continue
    const d = new Date(txn.date)
    const index = indexByKey.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
    if (index === undefined) continue
    const row = byCategory[txn.categoryId] ?? new Array<number>(options.months).fill(0)
    row[index] = (row[index] ?? 0) + amountOf(txn, ledger)
    byCategory[txn.categoryId] = row
  }
  return byCategory
}

/** Start and end of the calendar month containing `date`, as an inclusive range. */
export function monthRange(date: number): Required<DateRange> {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  return { from: dateOnly(year, month, 1), to: dateOnly(year, month + 1, 0) }
}

// ─── Account balances ─────────────────────────────────────────────────────────

/**
 * Signed contribution of one transaction to one account's running balance.
 * A credit account tracks what is *owed*, so its sign is flipped: a charge
 * increases the balance, a payment into it decreases it.
 */
export function balanceDelta(txn: Transaction, account: Account, ledger: Ledger): number {
  const amount = amountOf(txn, ledger)
  let delta = 0

  if (txn.accountId === account.accountId) {
    delta = txn.type === 'income' ? amount : -amount // expense or transfer out
  } else if (txn.toAccountId === account.accountId && txn.type === 'transfer') {
    delta = amount
  }

  return account.type === 'credit' ? -delta : delta
}

/** Current balance of each account, keyed by id, including its opening balance. */
export function accountBalances(ledger: Ledger, accounts: Account[]): Record<string, number> {
  const balances: Record<string, number> = {}

  for (const account of accounts) {
    let balance = account.openingBalance ?? 0
    for (const txn of ledger.transactions) balance += balanceDelta(txn, account, ledger)
    balances[account.accountId] = balance
  }

  return balances
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

export interface RowFilter {
  /** Matches a transaction's note or its category name. */
  search?: string
  type?: TransactionType
  categoryId?: string
  /** Matches ownerId — who entered it, not who paid. */
  ownerId?: string
  tag?: string
  range?: DateRange
  /**
   * A Space set to totals-only hides other Members' rows. Pass the viewing
   * Member's id to apply it; omit when the Space shows everything.
   */
  onlyOwnedBy?: string
}

/**
 * The escape hatch: actual rows, newest first, for the list view. Every other
 * question returns figures — reach for this only when the rows themselves are
 * what's being shown.
 */
export function rowsMatching(
  ledger: Ledger,
  filter: RowFilter = {},
  categories: Category[] = [],
): Transaction[] {
  const search = filter.search?.trim().toLowerCase()
  const tag = filter.tag?.trim().toLowerCase()
  const categoryNames = new Map(categories.map((c) => [c.categoryId, c.name.toLowerCase()]))

  return ledger.transactions
    .filter((txn) => {
      if (filter.onlyOwnedBy !== undefined && txn.ownerId !== filter.onlyOwnedBy) return false
      if (filter.type !== undefined && txn.type !== filter.type) return false
      if (filter.categoryId !== undefined && txn.categoryId !== filter.categoryId) return false
      if (filter.ownerId !== undefined && txn.ownerId !== filter.ownerId) return false
      if (tag && !txn.tags.includes(tag)) return false
      if (filter.range && !inRange(txn.date, filter.range)) return false
      if (search) {
        const name = categoryNames.get(txn.categoryId) ?? ''
        if (!txn.note.toLowerCase().includes(search) && !name.includes(search)) return false
      }
      return true
    })
    .sort((a, b) => b.date - a.date)
}

/** The most recent `count` transactions. */
export function recentRows(ledger: Ledger, count: number): Transaction[] {
  return rowsMatching(ledger).slice(0, count)
}

// ─── Parsing a user-supplied bound ────────────────────────────────────────────

/**
 * A date a person typed or picked, as an inclusive range bound. Returns
 * undefined for anything unparseable, which reads as "no bound" rather than
 * silently becoming an epoch-0 cutoff.
 */
export function boundFromInput(dateStr: string): number | undefined {
  if (!dateStr.trim()) return undefined
  const parts = dateStr.split('-')
  const y = Number(parts[0])
  const mo = Number(parts[1])
  const d = Number(parts[2])
  if (!y || !mo || !d) return undefined
  return toDateOnly(dateOnly(y, mo - 1, d))
}

// ─── Stated income ────────────────────────────────────────────────────────────

export interface IncomeBaseline {
  /** Total stated monthly income, in the Base currency. */
  amount: number
  /**
   * Members whose stated income is in some other currency. A Member's income
   * carries no exchange rate the way a transaction does, so there is nothing to
   * convert with — they are left out rather than added as if the number were
   * already in the Base currency.
   */
  excludedMembers: number
}

/** What the household says it earns each month, used when no income has been logged. */
export function statedIncomeBaseline(members: GroupMember[], currency: string): IncomeBaseline {
  let amount = 0
  let excludedMembers = 0

  for (const member of members) {
    if (member.monthlyIncome == null) continue
    if (member.incomeCurrency !== null && member.incomeCurrency !== currency) {
      excludedMembers += 1
      continue
    }
    amount += member.monthlyIncome
  }

  return { amount, excludedMembers }
}
