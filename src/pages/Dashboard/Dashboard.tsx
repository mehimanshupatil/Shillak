import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import MonthlyBar from '@/components/charts/MonthlyBar'
import SpendingDonut from '@/components/charts/SpendingDonut'
import GroupSwitcher from '@/components/layout/GroupSwitcher'
import Logo from '@/components/layout/Logo'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { db } from '@/db/db'
import { formatCurrency, relativeDate, today } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export default function Dashboard() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed

  const startOfMonth = Date.UTC(year, month, 1)
  const endOfMonth = Date.UTC(year, month + 1, 1) - 1

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

  const upcomingRecurrences = useLiveQuery(() => {
    if (!activeGroupId || !currentUserId) return []
    const sevenDaysFromNow = today() + 7 * 86_400_000
    return db.recurrences.where(
      (r) =>
        r.groupId === activeGroupId &&
        r.ownerId === currentUserId &&
        r.active &&
        r.nextDue <= sevenDaysFromNow,
    )
  }, [activeGroupId, currentUserId])

  const { totalExpense, totalIncome, categorySpend } = useMemo(() => {
    const txns = allTransactions ?? []
    const totalExpense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const totalIncome = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const categorySpend: Record<string, number> = {}
    txns
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        categorySpend[t.categoryId] = (categorySpend[t.categoryId] ?? 0) + t.amount
      })
    return { totalExpense, totalIncome, categorySpend }
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

  // Build donut slices: top 5 categories + "Other" bucket
  const donutSlices = useMemo(() => {
    const entries = Object.entries(categorySpend)
      .map(([catId, amount]) => ({
        name: catMap[catId]?.name ?? 'Unknown',
        color: catMap[catId]?.color ?? '#888',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)

    if (entries.length <= 5) return entries

    const top = entries.slice(0, 5)
    const otherAmount = entries.slice(5).reduce((s, e) => s + e.amount, 0)
    return [...top, { name: 'Other', color: '#64748b', amount: otherAmount }]
  }, [categorySpend, catMap])

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  function nextMonth() {
    const isCurrent = year === now.getFullYear() && month === now.getMonth()
    if (isCurrent) return
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const monthLabel = `${MONTHS_SHORT[month]} ${year}`
  const currency = group?.currency ?? 'INR'
  const pct = totalBudget > 0 ? Math.min((totalExpense / totalBudget) * 100, 100) : 0
  const isCurrent = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="flex flex-col gap-0 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Logo variant="full" size={28} />
        </div>
        <GroupSwitcher />
        {/* Month selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={prevMonth}
            className="text-[var(--color-text-secondary)]"
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="flex-1 text-center text-sm font-medium text-[var(--color-text-primary)]">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={nextMonth}
            disabled={isCurrent}
            className="text-[var(--color-text-secondary)]"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <div className="mx-4 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)] mb-0.5">Total spent</p>
            <p className="text-3xl font-bold font-mono text-[var(--color-text-primary)]">
              {formatCurrency(totalExpense, currency)}
            </p>
            {totalBudget > 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                of {formatCurrency(totalBudget, currency)} budget
              </p>
            )}
          </div>
          {group?.incomeTracking && totalIncome > 0 && (
            <div className="text-right">
              <p className="text-xs text-[var(--color-text-secondary)] mb-0.5">Income</p>
              <p className="text-lg font-mono font-semibold text-[var(--color-income)]">
                +{formatCurrency(totalIncome, currency)}
              </p>
            </div>
          )}
        </div>

        {totalBudget > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor:
                  pct >= 100
                    ? 'var(--color-danger)'
                    : pct >= 80
                      ? 'var(--color-warning)'
                      : 'var(--color-accent)',
              }}
            />
          </div>
        )}
      </div>

      {/* Spending donut */}
      {totalExpense > 0 && donutSlices.length > 0 && (
        <div className="mt-4 mx-4 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            By category
          </p>
          <SpendingDonut slices={donutSlices} total={totalExpense} currency={currency} />
        </div>
      )}

      {/* Monthly spend trend — card wrapper lives inside MonthlyBar */}
      {activeGroupId && <MonthlyBar groupId={activeGroupId} currency={currency} />}

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

      {/* Upcoming recurrences */}
      {(upcomingRecurrences ?? []).length > 0 && (
        <div className="mt-6 px-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
            Upcoming
          </p>
          <div className="flex flex-col gap-2">
            {(upcomingRecurrences ?? [])
              .sort((a, b) => a.nextDue - b.nextDue)
              .map((rec) => {
                const cat = catMap[rec.template.categoryId]
                const daysUntil = Math.round((rec.nextDue - today()) / 86_400_000)
                return (
                  <div
                    key={rec.recurrenceId}
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
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {rec.frequency} · {daysUntil === 0 ? 'today' : `in ${daysUntil}d`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <RefreshCw size={10} className="text-[var(--color-text-tertiary)]" />
                      <span className="text-sm font-mono font-medium text-[var(--color-text-primary)]">
                        {formatCurrency(rec.template.amount, currency)}
                      </span>
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
