import type { Budget, Category, Recurrence, Transaction } from '@/db/schema'
import { toBaseCurrency } from '@/lib/utils'

export interface DonutSlice {
  name: string
  color: string
  amount: number
  breakdown?: { name: string; amount: number }[]
}

export interface FixedItem {
  recurrenceId: string
  categoryId: string
  amount: number
  note: string
  frequency: Recurrence['frequency']
}

export interface DashboardMetrics {
  totalExpense: number
  totalIncome: number
  categorySpend: Record<string, number>
  fixedExpense: number
  fixedItems: FixedItem[]
  totalBudget: number
  donutSlices: DonutSlice[]
}

/** Aggregates one month's worth of already-fetched data for the Dashboard. */
export function computeDashboardMetrics(
  transactions: Transaction[],
  recurrences: Recurrence[],
  budgets: Budget[],
  categories: Category[],
  currency: string,
): DashboardMetrics {
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseCurrency(t, currency), 0)
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + toBaseCurrency(t, currency), 0)

  const categorySpend: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    categorySpend[t.categoryId] = (categorySpend[t.categoryId] ?? 0) + toBaseCurrency(t, currency)
  }

  const fixedRecurrences = recurrences.filter((r) => r.isFixed && r.template.type === 'expense')
  const fixedIds = new Set(fixedRecurrences.map((r) => r.recurrenceId))
  const fixedTxns = transactions.filter(
    (t) => t.type === 'expense' && t.recurrenceId !== null && fixedIds.has(t.recurrenceId),
  )
  const fixedExpense = fixedTxns.reduce((s, t) => s + toBaseCurrency(t, currency), 0)
  // Per-recurrence: use actual transaction amount this month (falls back to template if not yet generated)
  const txnByRecurrence = new Map(fixedTxns.map((t) => [t.recurrenceId, t]))
  const fixedItems: FixedItem[] = fixedRecurrences.map((r) => {
    const actualTxn = txnByRecurrence.get(r.recurrenceId)
    return {
      recurrenceId: r.recurrenceId,
      categoryId: r.template.categoryId,
      amount: actualTxn ? toBaseCurrency(actualTxn, currency) : r.template.amount,
      note: r.template.note,
      frequency: r.frequency,
    }
  })

  const totalBudget = budgets.filter((b) => b.period === 'monthly').reduce((s, b) => s + b.limit, 0)

  const catNameColor: Record<string, { name: string; color: string }> = {}
  for (const c of categories) catNameColor[c.categoryId] = { name: c.name, color: c.color }

  // Build donut slices: top 5 categories + "Other" bucket
  const entries = Object.entries(categorySpend)
    .map(([catId, amount]) => ({
      name: catNameColor[catId]?.name ?? 'Unknown',
      color: catNameColor[catId]?.color ?? '#888',
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  let donutSlices: DonutSlice[] = entries
  if (entries.length > 5) {
    const top = entries.slice(0, 5)
    const rest = entries.slice(5)
    donutSlices = [
      ...top,
      {
        name: 'Other',
        color: '#64748b',
        amount: rest.reduce((s, e) => s + e.amount, 0),
        breakdown: rest.map((e) => ({ name: e.name, amount: e.amount })),
      },
    ]
  }

  return {
    totalExpense,
    totalIncome,
    categorySpend,
    fixedExpense,
    fixedItems,
    totalBudget,
    donutSlices,
  }
}
