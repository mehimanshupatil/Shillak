import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pin, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import MonthlyBar from '@/components/charts/MonthlyBar'
import SpendingDonut from '@/components/charts/SpendingDonut'
import ThisMonthSummary from '@/components/charts/ThisMonthSummary'
import Logo from '@/components/layout/Logo'
import SpaceSwitcher from '@/components/layout/SpaceSwitcher'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { db } from '@/db/db'
import { formatCurrency, relativeDate, toBaseCurrency, today } from '@/lib/utils'
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

  const members = useLiveQuery(
    () =>
      activeGroupId
        ? db.members.where((m) => m.groupId === activeGroupId && m.status === 'active')
        : [],
    [activeGroupId],
  )

  const allRecurrences = useLiveQuery(
    () =>
      activeGroupId ? db.recurrences.where((r) => r.groupId === activeGroupId && r.active) : [],
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

  const currency = group?.currency ?? 'INR'

  // Sum of all members' stated monthly income — used as baseline when no income transactions
  const memberIncomeBaseline = useMemo(
    () => (members ?? []).reduce((s, m) => s + (m.monthlyIncome ?? 0), 0),
    [members],
  )

  const { totalExpense, totalIncome, categorySpend } = useMemo(() => {
    const txns = allTransactions ?? []
    const base = currency
    const totalExpense = txns
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + toBaseCurrency(t, base), 0)
    const totalIncome = txns
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + toBaseCurrency(t, base), 0)
    const categorySpend: Record<string, number> = {}
    txns
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        categorySpend[t.categoryId] = (categorySpend[t.categoryId] ?? 0) + toBaseCurrency(t, base)
      })
    return { totalExpense, totalIncome, categorySpend }
  }, [allTransactions, currency])

  const { fixedExpense, fixedItems } = useMemo(() => {
    const fixedRecurrences = (allRecurrences ?? []).filter(
      (r) => r.isFixed && r.template.type === 'expense',
    )
    const fixedIds = new Set(fixedRecurrences.map((r) => r.recurrenceId))
    const fixedTxns = (allTransactions ?? []).filter(
      (t) => t.type === 'expense' && t.recurrenceId !== null && fixedIds.has(t.recurrenceId),
    )
    const fixedExpense = fixedTxns.reduce((s, t) => s + toBaseCurrency(t, currency), 0)
    // Per-recurrence: use actual transaction amount this month (falls back to template if not yet generated)
    const txnByRecurrence = new Map(fixedTxns.map((t) => [t.recurrenceId, t]))
    const fixedItems = fixedRecurrences.map((r) => {
      const actualTxn = txnByRecurrence.get(r.recurrenceId)
      return {
        recurrenceId: r.recurrenceId,
        categoryId: r.template.categoryId,
        amount: actualTxn ? toBaseCurrency(actualTxn, currency) : r.template.amount,
        note: r.template.note,
        frequency: r.frequency,
      }
    })
    return { fixedExpense, fixedItems }
  }, [allRecurrences, allTransactions, currency])

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
  const isCurrent = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="flex flex-col gap-0 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Logo variant="full" size={28} />
        </div>
        <SpaceSwitcher />
        {/* Month selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={prevMonth}
            className="text-text-secondary"
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="flex-1 text-center text-sm font-medium text-text-primary">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={nextMonth}
            disabled={isCurrent}
            className="text-text-secondary"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <ThisMonthSummary
        income={totalIncome}
        expenses={totalExpense}
        currency={currency}
        totalBudget={totalBudget}
        incomeBaseline={memberIncomeBaseline}
      />

      {/* Fixed outflows breakdown */}
      {fixedItems.length > 0 && (
        <FixedOutflowsCard
          fixedItems={fixedItems}
          fixedExpense={fixedExpense}
          discretionaryExpense={totalExpense - fixedExpense}
          currency={currency}
          catMap={catMap}
        />
      )}

      {/* Spending donut */}
      {totalExpense > 0 && donutSlices.length > 0 && (
        <div className="mt-4 mx-4 p-4 rounded-2xl bg-surface border border-border">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-4">
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
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
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
                      <span className="text-sm text-text-primary">{cat?.name ?? 'Unknown'}</span>
                      <span
                        className={`text-xs font-mono ${over ? 'text-danger' : 'text-text-secondary'}`}
                      >
                        {formatCurrency(spent, currency)} / {formatCurrency(budget.limit, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2">
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
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
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
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface"
                  >
                    <CategoryIcon
                      icon={cat?.icon ?? 'CircleDot'}
                      color={cat?.color ?? '#888'}
                      size={16}
                      containerSize={36}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {cat?.name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {rec.frequency} · {daysUntil === 0 ? 'today' : `in ${daysUntil}d`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <RefreshCw size={10} className="text-text-tertiary" />
                      <span className="text-sm font-mono font-medium text-text-primary">
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
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
          Recent
        </p>
        {(recentTransactions ?? []).length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-8">
            No transactions yet. Tap + to add one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(recentTransactions ?? []).map((txn) => {
              const cat = catMap[txn.categoryId]
              return (
                <div key={txn.txnId} className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                  <CategoryIcon
                    icon={cat?.icon ?? 'CircleDot'}
                    color={cat?.color ?? '#888'}
                    size={16}
                    containerSize={36}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {cat?.name ?? 'Unknown'}
                      {txn.note ? ` · ${txn.note}` : ''}
                    </p>
                    <p className="text-xs text-text-tertiary">{relativeDate(txn.date)}</p>
                  </div>
                  <span
                    className={`text-sm font-mono font-medium shrink-0 ${
                      txn.type === 'income' ? 'text-income' : 'text-text-primary'
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

// ─── Fixed Outflows Card ──────────────────────────────────────────────────────

interface FixedItem {
  recurrenceId: string
  categoryId: string
  amount: number
  note: string
  frequency: string
}

function FixedOutflowsCard({
  fixedItems,
  fixedExpense,
  discretionaryExpense,
  currency,
  catMap,
}: {
  fixedItems: FixedItem[]
  fixedExpense: number
  discretionaryExpense: number
  currency: string
  catMap: Record<string, { name: string; color: string; icon: string }>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      {/* Header row — Fixed vs Discretionary */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Pin size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Fixed outflows
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-text-tertiary" />
        ) : (
          <ChevronDown size={14} className="text-text-tertiary" />
        )}
      </button>

      {/* Summary row */}
      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        <div className="px-4 py-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Fixed</p>
          <p className="text-sm font-bold font-mono text-text-primary">
            {formatCurrency(fixedExpense, currency)}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {fixedItems.length} item{fixedItems.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">
            Discretionary
          </p>
          <p className="text-sm font-bold font-mono text-text-primary">
            {formatCurrency(Math.max(0, discretionaryExpense), currency)}
          </p>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {fixedItems.map((item) => {
            const cat = catMap[item.categoryId]
            return (
              <div key={item.recurrenceId} className="flex items-center gap-3 px-4 py-2.5">
                <CategoryIcon
                  icon={cat?.icon ?? 'CircleDot'}
                  color={cat?.color ?? '#888'}
                  size={13}
                  containerSize={30}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {item.note || cat?.name || 'Unknown'}
                  </p>
                  <p className="text-[10px] text-text-tertiary capitalize">{item.frequency}</p>
                </div>
                <span className="text-sm font-mono text-text-primary shrink-0">
                  {formatCurrency(item.amount, currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
