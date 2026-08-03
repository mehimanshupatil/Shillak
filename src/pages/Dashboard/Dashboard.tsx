import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  EyeSlashIcon,
  PencilIcon,
  PushPinIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MonthlyBar from '@/components/charts/MonthlyBar'
import SpendingDonut from '@/components/charts/SpendingDonut'
import ThisMonthSummary from '@/components/charts/ThisMonthSummary'
import Logo from '@/components/layout/Logo'
import SpaceSwitcher from '@/components/layout/SpaceSwitcher'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import RecurrenceSheet from '@/components/transaction/RecurrenceSheet'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Progress } from '@/components/ui/progress'
import { db } from '@/db/db'
import type { Recurrence } from '@/db/schema'
import { useMonthlyRecap } from '@/hooks/useMonthlyRecap'
import { useUpcomingBills } from '@/hooks/useUpcomingBills'
import type { RecapBudgetItem, RecapCategoryItem, RecapGoalItem } from '@/lib/monthlyRecap'
import type { UpcomingBillItem } from '@/lib/upcomingBills'
import {
  formatCurrency,
  monthShort,
  ordinal,
  relativeDate,
  toBaseCurrency,
  today,
  weekdayLabel,
} from '@/lib/utils'
import useAppStore from '@/stores/app.store'

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
            .where(
              (t) =>
                t.groupId === activeGroupId &&
                t.deletedAt === null &&
                t.date >= startOfMonth &&
                t.date <= endOfMonth,
            )
            .then((txns) => txns.sort((a, b) => b.date - a.date).slice(0, 5))
        : [],
    [activeGroupId, startOfMonth, endOfMonth],
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

  const currency = group?.currency ?? 'INR'

  const { data: upcomingBills } = useUpcomingBills(activeGroupId, currency)

  // Active recurrences (any type, any due date) not already surfaced by the 30-day
  // bill projection above — e.g. income recurrences, or an expense recurrence whose
  // next occurrence is further out than the window (a quarterly bill due in 75 days).
  const otherRecurring = useMemo(() => {
    const shown = new Set(
      [...(upcomingBills?.overdue ?? []), ...(upcomingBills?.upcoming ?? [])].map(
        (b) => b.recurrenceId,
      ),
    )
    return (allRecurrences ?? []).filter((r) => !shown.has(r.recurrenceId))
  }, [allRecurrences, upcomingBills])

  // Monthly recap always refers to the most recently closed calendar month,
  // independent of whichever month the user is browsing above.
  const recapYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const recapMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const { data: monthlyRecap } = useMonthlyRecap(activeGroupId, currency, recapYear, recapMonth)
  const recapKey = activeGroupId
    ? `shillak_recap_dismissed_${activeGroupId}_${recapYear}-${recapMonth}`
    : null
  const [recapDismissed, setRecapDismissed] = useState(false)
  useEffect(() => {
    if (!recapKey) return
    setRecapDismissed(localStorage.getItem(recapKey) === '1')
  }, [recapKey])
  const [searchParams] = useSearchParams()
  const forceRecap = import.meta.env.DEV && searchParams.has('forceRecap')
  const withinRecapWindow = now.getDate() <= 7 || forceRecap

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

  const [editRecurrence, setEditRecurrence] = useState<Recurrence | null>(null)
  const [recurrenceSheetOpen, setRecurrenceSheetOpen] = useState(false)

  const monthLabel = `${monthShort(month)} ${year}`
  const isCurrent = year === now.getFullYear() && month === now.getMonth()
  const totalsOnly = group?.visibility === 'totals_only'

  const recapIsEmpty = !!monthlyRecap && monthlyRecap.income === 0 && monthlyRecap.expense === 0
  // DEV-only: forceRecap preview with no real data falls back to mock numbers
  // (using real category ids so names/icons still resolve) so the layout is
  // still inspectable on a fresh/empty group. Never used outside forceRecap.
  const catIds = Object.keys(catMap)
  const mockRecapPreview = {
    income: 8500000,
    expense: 6200000,
    netSaved: 2300000,
    hasPreviousMonth: true,
    expenseDeltaPct: -8,
    budgets: catIds.slice(0, 2).map((categoryId, i) => ({
      categoryId,
      spent: 300000 + i * 100000,
      limit: 500000,
    })),
    topCategories: catIds.slice(0, 3).map((categoryId, i) => ({
      categoryId,
      amount: 400000 - i * 100000,
    })),
    goals: [] as RecapGoalItem[],
  }
  const effectiveRecap = forceRecap && recapIsEmpty ? mockRecapPreview : monthlyRecap
  const showRecap =
    withinRecapWindow &&
    !recapDismissed &&
    !!effectiveRecap &&
    (effectiveRecap.income > 0 || effectiveRecap.expense > 0)

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
            <CaretLeftIcon size={18} />
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
            <CaretRightIcon size={18} />
          </Button>
        </div>
      </div>

      {/* Last month recap — visible for the first 7 days of a new month, dismissible */}
      {showRecap && effectiveRecap && recapKey && (
        <MonthlyRecapCard
          recap={effectiveRecap}
          currency={currency}
          catMap={catMap}
          monthLabel={`${monthShort(recapMonth)} ${recapYear}`}
          onDismiss={() => {
            localStorage.setItem(recapKey, '1')
            setRecapDismissed(true)
          }}
        />
      )}

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
      {totalExpense > 0 &&
        (categories === undefined ? (
          <div className="mt-4 mx-4 h-64 rounded-2xl bg-surface border border-border animate-pulse" />
        ) : (
          donutSlices.length > 0 && (
            <div className="mt-4 mx-4 p-4 rounded-2xl bg-surface border border-border">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-4">
                By category
              </p>
              <SpendingDonut slices={donutSlices} total={totalExpense} currency={currency} />
            </div>
          )
        ))}

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
                    <Progress
                      value={bpct}
                      indicatorStyle={{
                        backgroundColor: over
                          ? 'var(--color-danger)'
                          : bpct >= 80
                            ? 'var(--color-warning)'
                            : (cat?.color ?? 'var(--color-accent)'),
                      }}
                    />
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Upcoming bills (expense recurrences due in 30 days) + every other active recurrence */}
      {((upcomingBills &&
        (upcomingBills.overdue.length > 0 || upcomingBills.upcoming.length > 0)) ||
        otherRecurring.length > 0) && (
        <UpcomingBillsSection
          overdue={upcomingBills?.overdue ?? []}
          upcoming={upcomingBills?.upcoming ?? []}
          upcomingTotal={upcomingBills?.upcomingTotal ?? 0}
          otherRecurring={otherRecurring}
          currency={currency}
          catMap={catMap}
          onSelect={(recurrenceId) => {
            const rec = (allRecurrences ?? []).find((r) => r.recurrenceId === recurrenceId)
            if (!rec) return
            setEditRecurrence(rec)
            setRecurrenceSheetOpen(true)
          }}
        />
      )}

      {/* Recent transactions */}
      <div className="mt-6 px-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider flex-1">
            Recent
          </p>
          {totalsOnly && (
            <div className="flex items-center gap-1">
              <EyeSlashIcon size={11} className="text-text-tertiary" />
              <span className="text-[10px] text-text-tertiary">yours only</span>
            </div>
          )}
        </div>
        {(totalsOnly
          ? (recentTransactions ?? []).filter((t) => t.ownerId === currentUserId)
          : (recentTransactions ?? [])
        ).length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-8">
            No transactions yet. Tap + to add one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(totalsOnly
              ? (recentTransactions ?? []).filter((t) => t.ownerId === currentUserId)
              : (recentTransactions ?? [])
            ).map((txn) => {
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

      <RecurrenceSheet
        open={recurrenceSheetOpen}
        onClose={() => {
          setRecurrenceSheetOpen(false)
          setEditRecurrence(null)
        }}
        recurrence={editRecurrence}
        currency={currency}
      />
    </div>
  )
}

// ─── Upcoming Bills Section ───────────────────────────────────────────────────

function daysLabel(dueDate: number): string {
  const daysUntil = Math.round((dueDate - today()) / 86_400_000)
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`
  if (daysUntil === 0) return 'today'
  return `in ${daysUntil}d`
}

function UpcomingBillsSection({
  overdue,
  upcoming,
  upcomingTotal,
  otherRecurring,
  currency,
  catMap,
  onSelect,
}: {
  overdue: UpcomingBillItem[]
  upcoming: UpcomingBillItem[]
  upcomingTotal: number
  otherRecurring: Recurrence[]
  currency: string
  catMap: Record<string, { name: string; color: string; icon: string }>
  onSelect: (recurrenceId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [showAllOther, setShowAllOther] = useState(false)
  const visible = showAll ? upcoming : upcoming.slice(0, 5)
  const visibleOther = showAllOther ? otherRecurring : otherRecurring.slice(0, 3)
  const hasBills = overdue.length > 0 || upcoming.length > 0

  return (
    <div className="mt-6 px-4">
      {hasBills && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Upcoming bills
            </p>
            <span className="text-xs font-mono text-text-tertiary">
              {formatCurrency(upcomingTotal, currency)} / 30d
            </span>
          </div>

          {overdue.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {overdue.map((bill) => (
                <UpcomingBillRow
                  key={bill.recurrenceId}
                  bill={bill}
                  currency={currency}
                  catMap={catMap}
                  overdue
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {visible.map((bill) => (
              <UpcomingBillRow
                key={`${bill.recurrenceId}-${bill.date}`}
                bill={bill}
                currency={currency}
                catMap={catMap}
                onSelect={onSelect}
              />
            ))}
          </div>

          {!showAll && upcoming.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full mt-2 py-2 text-xs font-medium text-accent text-center"
            >
              See all {upcoming.length} upcoming
            </button>
          )}
        </>
      )}

      {otherRecurring.length > 0 && (
        <>
          <p
            className={`text-xs font-medium text-text-secondary uppercase tracking-wider mb-3 ${hasBills ? 'mt-4' : ''}`}
          >
            Other recurring
          </p>
          <div className="flex flex-col gap-2">
            {visibleOther.map((rec) => (
              <RecurringRow
                key={rec.recurrenceId}
                rec={rec}
                currency={currency}
                catMap={catMap}
                onSelect={onSelect}
              />
            ))}
          </div>
          {!showAllOther && otherRecurring.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllOther(true)}
              className="w-full mt-2 py-2 text-xs font-medium text-accent text-center"
            >
              See all {otherRecurring.length} recurring
            </button>
          )}
        </>
      )}
    </div>
  )
}

function describeRecurrence(rec: Recurrence): string {
  switch (rec.frequency) {
    case 'daily':
      return 'Daily'
    case 'weekly':
      return `Weekly, ${weekdayLabel(rec.dayOfWeek ?? new Date(rec.nextDue).getUTCDay(), 'long')}`
    case 'monthly':
      return `Monthly, on the ${ordinal(new Date(rec.nextDue).getUTCDate())}`
    case 'quarterly':
      return 'Quarterly'
  }
}

function RecurringRow({
  rec,
  currency,
  catMap,
  onSelect,
}: {
  rec: Recurrence
  currency: string
  catMap: Record<string, { name: string; color: string; icon: string }>
  onSelect: (recurrenceId: string) => void
}) {
  const cat = catMap[rec.template.categoryId]
  const amount = toBaseCurrency(rec.template, currency)
  return (
    <button
      type="button"
      onClick={() => onSelect(rec.recurrenceId)}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-transparent bg-surface text-left transition-opacity active:opacity-80"
    >
      <CategoryIcon
        icon={cat?.icon ?? 'CircleDot'}
        color={cat?.color ?? '#888'}
        size={16}
        containerSize={36}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {rec.template.note || cat?.name || 'Unknown'}
        </p>
        <p className="text-xs text-text-tertiary">{describeRecurrence(rec)}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`text-sm font-mono font-medium ${
            rec.template.type === 'income' ? 'text-income' : 'text-text-primary'
          }`}
        >
          {rec.template.type === 'income' ? '+' : '-'}
          {formatCurrency(amount, currency)}
        </span>
        <PencilIcon size={11} className="text-text-tertiary" />
      </div>
    </button>
  )
}

function UpcomingBillRow({
  bill,
  currency,
  catMap,
  overdue = false,
  onSelect,
}: {
  bill: UpcomingBillItem
  currency: string
  catMap: Record<string, { name: string; color: string; icon: string }>
  overdue?: boolean
  onSelect: (recurrenceId: string) => void
}) {
  const cat = catMap[bill.categoryId]
  return (
    <button
      type="button"
      onClick={() => onSelect(bill.recurrenceId)}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-opacity active:opacity-80 ${
        overdue ? 'bg-danger/5 border-danger/30' : 'bg-surface border-transparent'
      }`}
    >
      <CategoryIcon
        icon={cat?.icon ?? 'CircleDot'}
        color={cat?.color ?? '#888'}
        size={16}
        containerSize={36}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {bill.note || cat?.name || 'Unknown'}
        </p>
        <p className={`text-xs ${overdue ? 'text-danger' : 'text-text-tertiary'}`}>
          {daysLabel(bill.date)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <ArrowClockwiseIcon size={10} className="text-text-tertiary" />
        <span className="text-sm font-mono font-medium text-text-primary">
          {formatCurrency(bill.amount, currency)}
        </span>
        <PencilIcon size={11} className="text-text-tertiary" />
      </div>
    </button>
  )
}

// ─── Monthly Recap Card ───────────────────────────────────────────────────────

function MonthlyRecapCard({
  recap,
  currency,
  catMap,
  monthLabel,
  onDismiss,
}: {
  recap: {
    income: number
    expense: number
    netSaved: number
    hasPreviousMonth: boolean
    expenseDeltaPct: number | null
    budgets: RecapBudgetItem[]
    topCategories: RecapCategoryItem[]
    goals: RecapGoalItem[]
  }
  currency: string
  catMap: Record<string, { name: string; color: string; icon: string }>
  monthLabel: string
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 mb-4 mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          {monthLabel} recap
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -mr-1 text-text-tertiary"
          aria-label="Dismiss recap"
        >
          <XIcon size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border px-4 pb-3 pt-2">
        <RecapStatTile
          label="Income"
          value={formatCurrency(recap.income, currency)}
          tone="income"
        />
        <RecapStatTile
          label="Expense"
          value={formatCurrency(recap.expense, currency)}
          tone="expense"
        />
        <RecapStatTile label="Net saved" value={formatCurrency(recap.netSaved, currency)} />
        {recap.hasPreviousMonth && recap.expenseDeltaPct !== null && (
          <RecapStatTile
            label="vs last month"
            value={`${recap.expenseDeltaPct > 0 ? '+' : ''}${recap.expenseDeltaPct}%`}
            tone={recap.expenseDeltaPct <= 0 ? 'income' : 'expense'}
          />
        )}
      </div>

      {(recap.budgets.length > 0 || recap.topCategories.length > 0 || recap.goals.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full py-2 text-xs font-medium text-accent border-t border-border"
          >
            {expanded ? 'Hide details' : 'View details'}
          </button>

          {expanded && (
            <div className="px-4 pb-4 pt-1 flex flex-col gap-4 border-t border-border">
              {recap.budgets.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
                    Budgets
                  </p>
                  <div className="flex flex-col gap-2">
                    {recap.budgets.map((b) => {
                      const cat = catMap[b.categoryId]
                      const pct = Math.min((b.spent / b.limit) * 100, 100)
                      const over = b.spent > b.limit
                      return (
                        <div key={b.categoryId}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-text-primary">{cat?.name ?? 'Unknown'}</span>
                            <span className={over ? 'text-danger' : 'text-text-tertiary'}>
                              {formatCurrency(b.spent, currency)} /{' '}
                              {formatCurrency(b.limit, currency)}
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            indicatorStyle={{
                              backgroundColor: over
                                ? 'var(--color-danger)'
                                : (cat?.color ?? 'var(--color-accent)'),
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {recap.topCategories.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
                    Top categories
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {recap.topCategories.map((c) => {
                      const cat = catMap[c.categoryId]
                      return (
                        <div key={c.categoryId} className="flex items-center gap-2 text-xs">
                          <CategoryIcon
                            icon={cat?.icon ?? 'CircleDot'}
                            color={cat?.color ?? '#888'}
                            size={11}
                            containerSize={22}
                          />
                          <span className="flex-1 text-text-primary">{cat?.name ?? 'Unknown'}</span>
                          <span className="font-mono text-text-primary">
                            {formatCurrency(c.amount, currency)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {recap.goals.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
                    Goals
                  </p>
                  <div className="flex flex-col gap-2">
                    {recap.goals.map((g) => {
                      const pct = g.target > 0 ? Math.min((g.saved / g.target) * 100, 100) : 0
                      return (
                        <div key={g.goalId} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 text-text-primary">{g.name}</span>
                          {g.isAutoTracked ? (
                            <span className="font-mono text-income">
                              +{formatCurrency(g.delta, currency)}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">{Math.round(pct)}%</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RecapStatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'income' | 'expense'
}) {
  return (
    <div className="bg-surface px-2 py-2">
      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">{label}</p>
      <p
        className={`text-sm font-bold font-mono ${
          tone === 'income'
            ? 'text-income'
            : tone === 'expense'
              ? 'text-expense'
              : 'text-text-primary'
        }`}
      >
        {value}
      </p>
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
          <PushPinIcon size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Fixed outflows
          </span>
        </div>
        {expanded ? (
          <CaretUpIcon size={14} className="text-text-tertiary" />
        ) : (
          <CaretDownIcon size={14} className="text-text-tertiary" />
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
