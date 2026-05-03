import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import BudgetSheet from '@/components/budget/BudgetSheet'
import GoalSheet from '@/components/budget/GoalSheet'
import GoalProgress from '@/components/charts/GoalProgress'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { db } from '@/db/db'
import type { Budget, SavingsGoal } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
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

export default function BudgetsPage() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | undefined>(undefined)
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<SavingsGoal | undefined>(undefined)

  const startOfMonth = Date.UTC(year, month, 1)
  const endOfMonth = Date.UTC(year, month + 1, 1) - 1

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const categories = useLiveQuery(
    () => (activeGroupId ? db.categories.where((c) => c.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const budgets = useLiveQuery(
    () => (activeGroupId ? db.budgets.where((b) => b.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const goals = useLiveQuery(
    () => (activeGroupId ? db.goals.where((g) => g.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const transactions = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where(
            (t) =>
              t.groupId === activeGroupId &&
              t.deletedAt === null &&
              t.type === 'expense' &&
              t.date >= startOfMonth &&
              t.date <= endOfMonth,
          )
        : [],
    [activeGroupId, startOfMonth, endOfMonth],
  )

  // 6-month history for sparklines
  const sixMonthsAgo = Date.UTC(year, month - 5, 1)
  const historicTxns = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where(
            (t) =>
              t.groupId === activeGroupId &&
              t.deletedAt === null &&
              t.type === 'expense' &&
              t.date >= sixMonthsAgo,
          )
        : [],
    [activeGroupId, sixMonthsAgo],
  )

  const catMap = useMemo(() => {
    const m: Record<string, { name: string; color: string; icon: string }> = {}
    ;(categories ?? []).forEach((c) => {
      m[c.categoryId] = { name: c.name, color: c.color, icon: c.icon }
    })
    return m
  }, [categories])

  const categorySpend = useMemo(() => {
    const spend: Record<string, number> = {}
    ;(transactions ?? []).forEach((t) => {
      spend[t.categoryId] = (spend[t.categoryId] ?? 0) + t.amount
    })
    return spend
  }, [transactions])

  const totalBudget = useMemo(
    () => (budgets ?? []).filter((b) => b.period === 'monthly').reduce((s, b) => s + b.limit, 0),
    [budgets],
  )
  const totalSpend = useMemo(
    () => Object.values(categorySpend).reduce((s, v) => s + v, 0),
    [categorySpend],
  )

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

  async function handleDeleteBudget(budgetId: string) {
    await db.budgets.delete(budgetId)
  }

  async function handleDeleteGoal(goalId: string) {
    await db.goals.delete(goalId)
  }

  const currency = group?.currency ?? 'INR'
  const isCurrent = year === now.getFullYear() && month === now.getMonth()
  const overallPct = totalBudget > 0 ? Math.min((totalSpend / totalBudget) * 100, 100) : 0

  // Per-category spend per month over last 6 months [oldest → newest]
  const sparkData = useMemo(() => {
    const data: Record<string, number[]> = {}
    for (let i = 0; i < 6; i++) {
      const mMonth = (((month - 5 + i) % 12) + 12) % 12
      const mYear = year + Math.floor((month - 5 + i) / 12)
      const mStart = Date.UTC(mYear, mMonth, 1)
      const mEnd = Date.UTC(mYear, mMonth + 1, 1) - 1
      for (const t of historicTxns ?? []) {
        if (t.date < mStart || t.date > mEnd) continue
        if (!data[t.categoryId]) data[t.categoryId] = Array(6).fill(0)
        const row = data[t.categoryId]
        if (row) row[i] = (row[i] ?? 0) + t.amount
      }
    }
    return data
  }, [historicTxns, month, year])

  const alerts = useMemo(() => {
    return (budgets ?? [])
      .filter((b) => b.period === 'monthly')
      .map((b) => {
        const spent = categorySpend[b.categoryId] ?? 0
        const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0
        return { budget: b, spent, pct }
      })
      .filter(({ pct }) => pct >= 80)
      .sort((a, b) => b.pct - a.pct)
  }, [budgets, categorySpend])

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-bold text-text-primary">Budgets</h1>
        {/* Month selector */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={prevMonth}
            className="text-text-secondary"
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="flex-1 text-center text-sm font-medium text-text-primary">
            {MONTHS_SHORT[month]} {year}
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

      {/* Overall summary */}
      {totalBudget > 0 && (
        <div className="mx-4 p-4 rounded-2xl bg-surface border border-border">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-sm text-text-secondary">Overall</span>
            <span
              className={`text-sm font-mono ${totalSpend > totalBudget ? 'text-danger' : 'text-text-primary'}`}
            >
              {formatCurrency(totalSpend, currency)} / {formatCurrency(totalBudget, currency)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${overallPct}%`,
                backgroundColor:
                  overallPct >= 100
                    ? 'var(--color-danger)'
                    : overallPct >= 80
                      ? 'var(--color-warning)'
                      : 'var(--color-accent)',
              }}
            />
          </div>
        </div>
      )}

      {/* Budget overrun alerts */}
      {isCurrent && alerts.length > 0 && (
        <div className="mx-4 mt-3 flex flex-col gap-2">
          {alerts.map(({ budget, spent, pct }) => {
            const cat = catMap[budget.categoryId]
            const over = pct >= 100
            return (
              <div
                key={budget.budgetId}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                  over ? 'bg-danger/10' : 'bg-warning/10'
                }`}
              >
                <AlertTriangle size={13} className={over ? 'text-danger' : 'text-warning'} />
                <span className={`text-xs flex-1 ${over ? 'text-danger' : 'text-warning'}`}>
                  {cat?.name ?? 'Unknown'} —{' '}
                  {over
                    ? `over by ${formatCurrency(spent - budget.limit, currency)}`
                    : `${Math.round(pct)}% used`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Budget list */}
      <div className="mt-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Monthly budgets
          </p>
          <Button
            onClick={() => {
              setEditBudget(undefined)
              setBudgetSheetOpen(true)
            }}
            className="h-7 px-3 rounded-full text-xs bg-surface-2 text-text-secondary
                       hover:bg-surface-3 gap-1"
          >
            <Plus size={12} />
            Add
          </Button>
        </div>

        {(budgets ?? []).filter((b) => b.period === 'monthly').length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-tertiary">No budgets set.</p>
            <p className="text-xs text-text-tertiary mt-1">Tap + to add a budget for a category.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(budgets ?? [])
              .filter((b) => b.period === 'monthly')
              .map((budget) => {
                const cat = catMap[budget.categoryId]
                const spent = categorySpend[budget.categoryId] ?? 0
                const bpct = Math.min((spent / budget.limit) * 100, 100)
                const over = spent > budget.limit
                return (
                  <div
                    key={budget.budgetId}
                    className="p-3 rounded-xl bg-surface border border-border"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CategoryIcon
                        icon={cat?.icon ?? 'CircleDot'}
                        color={cat?.color ?? '#888'}
                        size={14}
                        containerSize={28}
                      />
                      <span className="flex-1 text-sm font-medium text-text-primary">
                        {cat?.name ?? 'Unknown'}
                      </span>
                      <span
                        className={`text-xs font-mono ${over ? 'text-danger' : 'text-text-secondary'}`}
                      >
                        {formatCurrency(spent, currency)} / {formatCurrency(budget.limit, currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditBudget(budget)
                          setBudgetSheetOpen(true)
                        }}
                        className="text-text-tertiary hover:text-text-primary"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteBudget(budget.budgetId)}
                        className="text-text-tertiary hover:text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={13} />
                      </Button>
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
                    {over && (
                      <p className="text-[10px] text-danger mt-1">
                        Over by {formatCurrency(spent - budget.limit, currency)}
                      </p>
                    )}
                    {sparkData[budget.categoryId] && (
                      <BudgetSparkline
                        months={sparkData[budget.categoryId] ?? []}
                        limit={budget.limit}
                        color={cat?.color ?? 'var(--color-accent)'}
                      />
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Savings goals */}
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Savings goals
          </p>
          <Button
            onClick={() => {
              setEditGoal(undefined)
              setGoalSheetOpen(true)
            }}
            className="h-7 px-3 rounded-full text-xs bg-surface-2 text-text-secondary
                       hover:bg-surface-3 gap-1"
          >
            <Plus size={12} />
            Add
          </Button>
        </div>

        {(goals ?? []).length > 0 && (
          <div className="mb-4">
            <GoalProgress goals={goals ?? []} currency={currency} />
          </div>
        )}

        {(goals ?? []).length === 0 ? (
          <div className="py-8 text-center">
            <Target size={32} className="mx-auto text-text-tertiary mb-2" />
            <p className="text-sm text-text-tertiary">No savings goals yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Set a target and track your progress.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(goals ?? []).map((goal) => {
              const gpct = goal.target > 0 ? Math.min((goal.saved / goal.target) * 100, 100) : 0
              const done = goal.saved >= goal.target
              return (
                <div key={goal.goalId} className="p-4 rounded-xl bg-surface border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{goal.name}</p>
                      {goal.deadline && (
                        <p className="text-xs text-text-tertiary mt-0.5">
                          by{' '}
                          {new Date(goal.deadline).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditGoal(goal)
                          setGoalSheetOpen(true)
                        }}
                        className="text-text-tertiary hover:text-text-primary"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteGoal(goal.goalId)}
                        className="text-text-tertiary hover:text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 mb-2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${gpct}%`,
                        backgroundColor: done ? 'var(--color-success)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className={done ? 'text-success' : 'text-text-secondary'}>
                      {formatCurrency(goal.saved, currency)}
                    </span>
                    <span className="text-text-tertiary">
                      {formatCurrency(goal.target, currency)} · {Math.round(gpct)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sheets */}
      <BudgetSheet
        open={budgetSheetOpen}
        onClose={() => setBudgetSheetOpen(false)}
        groupId={activeGroupId ?? ''}
        currency={currency}
        categories={categories ?? []}
        budget={editBudget}
      />
      <GoalSheet
        open={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        groupId={activeGroupId ?? ''}
        currency={currency}
        goal={editGoal}
      />
    </div>
  )
}

// ─── BudgetSparkline ──────────────────────────────────────────────────────────
// 6-bar mini chart showing month-over-month spend vs limit.

function BudgetSparkline({
  months,
  limit,
  color,
}: {
  months: number[] // length 6, oldest → newest, paise
  limit: number // paise
  color: string
}) {
  const hasData = months.some((v) => v > 0)
  if (!hasData) return null

  const W = 72
  const H = 24
  const barW = 8
  const gap = (W - barW * 6) / 5
  const maxVal = Math.max(...months, limit)

  return (
    <div className="mt-2 flex items-end gap-1">
      <svg width={W} height={H} className="shrink-0" aria-label="6-month spend sparkline">
        {/* Budget limit line */}
        {limit > 0 && (
          <line
            x1={0}
            y1={H - (limit / maxVal) * H}
            x2={W}
            y2={H - (limit / maxVal) * H}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
        {months.map((v, i) => {
          const h = maxVal > 0 ? Math.max((v / maxVal) * H, v > 0 ? 2 : 0) : 0
          const over = v > limit && limit > 0
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: stable 6-element array
              key={i}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={2}
              fill={over ? 'var(--color-danger)' : color}
              opacity={i === 5 ? 1 : 0.45}
            />
          )
        })}
      </svg>
      <span className="text-[9px] text-text-tertiary leading-none pb-0.5">6mo</span>
    </div>
  )
}
