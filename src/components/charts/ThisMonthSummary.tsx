import { formatCompact, formatCurrency } from '@/lib/utils'

interface Props {
  income: number // paise — from actual income transactions this month
  expenses: number // paise
  currency: string
  totalBudget: number // paise, 0 = no budgets set
  incomeBaseline?: number // paise — sum of member stated monthly incomes (profile)
}

export default function ThisMonthSummary({
  income,
  expenses,
  currency,
  totalBudget,
  incomeBaseline = 0,
}: Props) {
  // Use logged income if available, fall back to profile baseline
  const effectiveIncome = income > 0 ? income : incomeBaseline
  const isBaseline = income === 0 && incomeBaseline > 0

  const saved = effectiveIncome - expenses
  const savingsRate = effectiveIncome > 0 ? Math.round((saved / effectiveIncome) * 100) : null
  const spendPct = effectiveIncome > 0 ? Math.round((expenses / effectiveIncome) * 100) : null
  const budgetPct = totalBudget > 0 ? Math.min((expenses / totalBudget) * 100, 100) : 0

  // ── No income data at all: single-column fallback ─────────────────────────
  if (effectiveIncome === 0) {
    return (
      <div className="mx-4 p-4 rounded-2xl bg-surface border border-border">
        <p className="text-xs text-text-secondary mb-0.5">Spent this month</p>
        <p className="text-3xl font-bold font-mono text-text-primary">
          {formatCurrency(expenses, currency)}
        </p>
        {totalBudget > 0 && (
          <>
            <p className="text-xs text-text-tertiary mt-0.5">
              of {formatCurrency(totalBudget, currency)} budget
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${budgetPct}%`,
                  backgroundColor:
                    budgetPct >= 100
                      ? 'var(--color-danger)'
                      : budgetPct >= 80
                        ? 'var(--color-warning)'
                        : 'var(--color-accent)',
                }}
              />
            </div>
          </>
        )}
        <p className="text-[10px] text-text-tertiary mt-2">
          Add income transactions to see savings rate
        </p>
      </div>
    )
  }

  // ── 3-column layout when income is known ─────────────────────────────────
  const expenseColor =
    spendPct != null && spendPct >= 100
      ? 'text-danger'
      : spendPct != null && spendPct >= 80
        ? 'text-warning'
        : 'text-text-primary'

  const incomeSubLabel = isBaseline ? 'declared salary · log income transactions' : null

  const savedColor = saved >= 0 ? 'text-success' : 'text-danger'
  const savedLabel = saved >= 0 ? 'Saved' : 'Over'

  return (
    <div className="mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      {/* 3-column summary */}
      <div className="grid grid-cols-3 divide-x divide-border px-0">
        {/* Income */}
        <div className="px-3 py-4 min-w-0 overflow-hidden">
          <p className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mb-1">
            Income
          </p>
          <p className="text-base font-bold font-mono text-income leading-tight">
            {formatCompact(effectiveIncome, currency)}
          </p>
          {incomeSubLabel && (
            <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{incomeSubLabel}</p>
          )}
        </div>

        {/* Expenses */}
        <div className="px-3 py-4 min-w-0 overflow-hidden">
          <p className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mb-1">
            Spent
          </p>
          <p className={`text-base font-bold font-mono leading-tight ${expenseColor}`}>
            {formatCompact(expenses, currency)}
          </p>
          {spendPct !== null && (
            <p className="text-[10px] text-text-tertiary mt-0.5">{spendPct}% of income</p>
          )}
        </div>

        {/* Saved */}
        <div className="px-3 py-4 min-w-0 overflow-hidden">
          <p className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mb-1">
            {savedLabel}
          </p>
          <p className={`text-base font-bold font-mono leading-tight ${savedColor}`}>
            {formatCompact(Math.abs(saved), currency)}
          </p>
          {savingsRate !== null && (
            <p className={`text-[10px] mt-0.5 font-medium ${savedColor}`}>{savingsRate}% rate</p>
          )}
        </div>
      </div>

      {/* Budget bar — only when budgets exist */}
      {totalBudget > 0 && (
        <div className="px-4 pb-3 border-t border-border pt-2.5">
          <div className="flex justify-between text-[10px] text-text-tertiary mb-1.5">
            <span>Budget</span>
            <span
              className={budgetPct >= 100 ? 'text-danger' : budgetPct >= 80 ? 'text-warning' : ''}
            >
              {formatCurrency(expenses, currency)} / {formatCurrency(totalBudget, currency)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${budgetPct}%`,
                backgroundColor:
                  budgetPct >= 100
                    ? 'var(--color-danger)'
                    : budgetPct >= 80
                      ? 'var(--color-warning)'
                      : 'var(--color-accent)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
