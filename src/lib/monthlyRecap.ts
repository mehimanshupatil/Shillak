import type { Budget, SavingsGoal } from '@/db/schema'
import type { Ledger } from '@/lib/ledger/read'
import { earnedInCategory, monthRange, spendByCategory, totals } from '@/lib/ledger/read'
import { dateOnly } from '@/lib/utils'

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

/**
 * Household-aggregate recap for one closed month: totals, budget adherence,
 * top categories, month-over-month comparison, savings goal progress.
 * Applies the group's current budget limits against that month's spend —
 * budgets aren't historized in this app, matching how BudgetsPage already
 * treats past periods.
 */
export function computeMonthlyRecap(
  ledger: Ledger,
  budgets: Budget[],
  goals: SavingsGoal[],
  period: { year: number; month: number },
): MonthlyRecapResult {
  const { year, month } = period
  const range = monthRange(dateOnly(year, month, 1))
  const previousRange = monthRange(dateOnly(year, month - 1, 1))

  const { income, expense } = totals(ledger, range)
  const prevExpense = totals(ledger, previousRange).expense

  // No valid baseline (first month, or previous month had no spend) — hide the
  // comparison rather than show a misleading 0%/Infinity% delta.
  const hasPreviousMonth = prevExpense > 0
  const expenseDeltaPct = hasPreviousMonth
    ? Math.round(((expense - prevExpense) / prevExpense) * 100)
    : null

  const byCategory = spendByCategory(ledger, range)
  const categorySpend: Record<string, number> = {}
  for (const entry of byCategory) categorySpend[entry.categoryId] = entry.amount

  const budgetItems: RecapBudgetItem[] = budgets
    .filter((b) => b.period === 'monthly')
    .map((b) => ({
      categoryId: b.categoryId,
      spent: categorySpend[b.categoryId] ?? 0,
      limit: b.limit,
    }))

  const topCategories: RecapCategoryItem[] = byCategory.slice(0, 5)

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
    const delta = earnedInCategory(ledger, g.categoryId, range)
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
