import { db } from '@/db/db'
import { toBaseCurrency } from '@/lib/utils'

export interface RecapBudgetItem {
  categoryId: string
  spent: number
  limit: number
}

export interface RecapCategoryItem {
  categoryId: string
  amount: number
}

export interface RecapGoalItem {
  goalId: string
  name: string
  delta: number // this month's contribution — only meaningful for categoryId-linked goals
  saved: number // cumulative total
  target: number
  isAutoTracked: boolean
}

export interface MonthlyRecapResult {
  income: number
  expense: number
  netSaved: number
  hasPreviousMonth: boolean
  expenseDeltaPct: number | null
  budgets: RecapBudgetItem[]
  topCategories: RecapCategoryItem[]
  goals: RecapGoalItem[]
}

function monthRange(year: number, month: number): { start: number; end: number } {
  return { start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) - 1 }
}

/**
 * Household-aggregate recap for one closed month: totals, budget adherence,
 * top categories, month-over-month comparison, savings goal progress.
 * Applies the group's current budget limits against that month's spend —
 * budgets aren't historized in this app, matching how BudgetsPage already
 * treats past periods.
 */
export async function computeMonthlyRecap(
  groupId: string,
  currency: string,
  year: number,
  month: number,
): Promise<MonthlyRecapResult> {
  const { start, end } = monthRange(year, month)
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const { start: prevStart, end: prevEnd } = monthRange(prevYear, prevMonth)

  const [txns, prevTxns, budgets, goals] = await Promise.all([
    db.transactions.where(
      (t) => t.groupId === groupId && t.deletedAt === null && t.date >= start && t.date <= end,
    ),
    db.transactions.where(
      (t) =>
        t.groupId === groupId && t.deletedAt === null && t.date >= prevStart && t.date <= prevEnd,
    ),
    db.budgets.where((b) => b.groupId === groupId && b.period === 'monthly'),
    db.goals.where((g) => g.groupId === groupId),
  ])

  const income = txns
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + toBaseCurrency(t, currency), 0)
  const expense = txns
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseCurrency(t, currency), 0)
  const prevExpense = prevTxns
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseCurrency(t, currency), 0)

  // No valid baseline (first month, or previous month had no spend) — hide the
  // comparison rather than show a misleading 0%/Infinity% delta.
  const hasPreviousMonth = prevExpense > 0
  const expenseDeltaPct = hasPreviousMonth
    ? Math.round(((expense - prevExpense) / prevExpense) * 100)
    : null

  const categorySpend: Record<string, number> = {}
  for (const t of txns) {
    if (t.type !== 'expense') continue
    categorySpend[t.categoryId] = (categorySpend[t.categoryId] ?? 0) + toBaseCurrency(t, currency)
  }

  const budgetItems: RecapBudgetItem[] = budgets.map((b) => ({
    categoryId: b.categoryId,
    spent: categorySpend[b.categoryId] ?? 0,
    limit: b.limit,
  }))

  const topCategories: RecapCategoryItem[] = Object.entries(categorySpend)
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const goalItems: RecapGoalItem[] = goals.map((g) => {
    if (!g.categoryId) {
      return {
        goalId: g.goalId,
        name: g.name,
        delta: 0,
        saved: g.saved,
        target: g.target,
        isAutoTracked: false,
      }
    }
    const delta = txns
      .filter((t) => t.type === 'income' && t.categoryId === g.categoryId)
      .reduce((s, t) => s + toBaseCurrency(t, currency), 0)
    return {
      goalId: g.goalId,
      name: g.name,
      delta,
      saved: g.saved,
      target: g.target,
      isAutoTracked: true,
    }
  })

  return {
    income,
    expense,
    netSaved: income - expense,
    hasPreviousMonth,
    expenseDeltaPct,
    budgets: budgetItems,
    topCategories,
    goals: goalItems,
  }
}
