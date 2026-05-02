import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { db } from '@/db/db'
import { formatCurrency, relativeDate } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

export default function Dashboard() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed

  const startOfMonth = Date.UTC(year, month, 1)
  const endOfMonth = Date.UTC(year, month + 1, 1) - 1

  // Live queries
  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const allTransactions = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where(
            (t) =>
              t.groupId === activeGroupId &&
              t.deletedAt === null &&
              t.date >= startOfMonth &&
              t.date <= endOfMonth,
          )
        : [],
    [activeGroupId, startOfMonth, endOfMonth],
  )

  const budgets = useLiveQuery(
    () => (activeGroupId ? db.budgets.where((b) => b.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const categories = useLiveQuery(
    () => (activeGroupId ? db.categories.where((c) => c.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const recentTransactions = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions
            .where((t) => t.groupId === activeGroupId && t.deletedAt === null)
            .then((txns) => txns.sort((a, b) => b.date - a.date).slice(0, 5))
        : [],
    [activeGroupId],
  )

  // Derived calculations
  const { totalExpense, categorySpend } = useMemo(() => {
    const txns = allTransactions ?? []
    const totalExpense = txns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    const categorySpend: Record<string, number> = {}
    txns
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        categorySpend[t.categoryId] = (categorySpend[t.categoryId] ?? 0) + t.amount
      })

    return { totalExpense, categorySpend }
  }, [allTransactions])

  const totalBudget = useMemo(
    () => (budgets ?? []).filter((b) => b.period === 'monthly').reduce((s, b) => s + b.limit, 0),
    [budgets],
  )

  const catMap = useMemo(() => {
    const m: Record<string, { name: string; color: string; icon: string }> = {}
    ;(categories ?? []).forEach((c) => {
      m[c.categoryId] = { name: c.name, color: c.color, icon: c.icon }
    })
    return m
  }, [categories])

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  function nextMonth() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    if (isCurrentMonth) return
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const monthLabel = new Date(year, month).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
  const currency = group?.currency ?? 'INR'
  const pct = totalBudget > 0 ? Math.min((totalExpense / totalBudget) * 100, 100) : 0
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="flex flex-col gap-0 pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{group?.name ?? '…'}</h1>

        {/* Month selector */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1 text-[var(--color-text-secondary)]"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="flex-1 text-center text-sm font-medium text-[var(--color-text-primary)]">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-1 text-[var(--color-text-secondary)] disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary card */}
      <div className="mx-4 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total spent</p>
        <p className="text-3xl font-bold font-mono text-[var(--color-text-primary)]">
          {formatCurrency(totalExpense, currency)}
        </p>
        {totalBudget > 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            of {formatCurrency(totalBudget, currency)} budget
          </p>
        )}

        {/* Budget progress bar */}
        {totalBudget > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor:
                  pct >= 100
                    ? 'var(--color-budget-over, var(--color-danger))'
                    : pct >= 80
                      ? 'var(--color-budget-warn, var(--color-warning))'
                      : 'var(--color-accent)',
              }}
            />
          </div>
        )}
      </div>

      {/* Budget bars per category */}
      {(budgets ?? []).length > 0 && (
        <div className="mt-4 px-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
            Budgets
          </p>
          <div className="flex flex-col gap-3">
            {(budgets ?? [])
              .filter((b) => b.period === 'monthly')
              .map((budget) => {
                const cat = catMap[budget.categoryId]
                const spent = categorySpend[budget.categoryId] ?? 0
                const bpct = Math.min((spent / budget.limit) * 100, 100)
                const over = spent > budget.limit
                return (
                  <div key={budget.budgetId}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {cat?.name ?? 'Unknown'}
                      </span>
                      <span
                        className={`text-xs font-mono ${over ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'}`}
                      >
                        {formatCurrency(spent, currency)} / {formatCurrency(budget.limit, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${bpct}%`,
                          backgroundColor: over
                            ? 'var(--color-danger)'
                            : bpct >= 80
                              ? 'var(--color-warning)'
                              : (cat?.color ?? 'var(--color-accent)'),
                        }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="mt-6 px-4">
        <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
          Recent
        </p>
        {(recentTransactions ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">
            No transactions yet. Tap + to add one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(recentTransactions ?? []).map((txn) => {
              const cat = catMap[txn.categoryId]
              return (
                <div
                  key={txn.txnId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)]"
                >
                  <CategoryIcon
                    icon={cat?.icon ?? 'CircleDot'}
                    color={cat?.color ?? '#888'}
                    size={16}
                    containerSize={36}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {cat?.name ?? 'Unknown'}
                      {txn.note ? ` · ${txn.note}` : ''}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {relativeDate(txn.date)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-mono font-medium flex-shrink-0 ${
                      txn.type === 'income'
                        ? 'text-[var(--color-income)]'
                        : 'text-[var(--color-text-primary)]'
                    }`}
                  >
                    {txn.type === 'income' ? '+' : '-'}
                    {formatCurrency(txn.amount, currency)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <QuickAddFAB />
    </div>
  )
}
