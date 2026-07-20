// PROTOTYPE — throwaway UI exploration for wayfinder ticket #9
// (Monthly recap: visual & layout design). Three structurally different takes
// on fitting five metrics (totals, budget adherence, top categories,
// month-over-month comparison, savings goal progress) into one Dashboard card.
// Mock data only — not wired to real Dexie/TanStack Query.
//
// Mounted on the existing Dashboard route, gated by ?recap=a|b|c.

import { CaretLeftIcon, CaretRightIcon, TrendUpIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { formatCurrency } from '@/lib/utils'

const CURRENCY = 'INR'

const MOCK = {
  income: 12000000,
  expense: 8450000,
  prevExpense: 9100000, // for comparison delta
  budgets: [
    { name: 'Groceries', color: '#22c55e', spent: 1200000, limit: 1500000 },
    { name: 'Dining', color: '#f59e0b', spent: 980000, limit: 800000 }, // over
    { name: 'Transport', color: '#06b6d4', spent: 400000, limit: 600000 },
  ],
  topCategories: [
    { name: 'Rent', color: '#f59e0b', icon: 'Home', amount: 2500000 },
    { name: 'Groceries', color: '#22c55e', icon: 'ShoppingCart', amount: 1200000 },
    { name: 'Dining', color: '#ef4444', icon: 'ForkKnife', amount: 980000 },
  ],
  goals: [
    { name: 'Emergency fund', saved: 4500000, target: 10000000 },
    { name: 'Goa trip', saved: 1800000, target: 3000000 },
  ],
}

const netSaved = MOCK.income - MOCK.expense
const expenseDeltaPct = Math.round(((MOCK.expense - MOCK.prevExpense) / MOCK.prevExpense) * 100)

// ─── Variant A — swipeable carousel, one metric-panel per screen ─────────────
// Each metric gets its own full-width panel; dot indicator + swipe/tap to page
// through. Card stays a fixed compact height regardless of how much content a
// panel has.

const PANELS_A = ['Overview', 'Budgets', 'Top categories', 'Goals'] as const

export function RecapVariantA() {
  const [page, setPage] = useState(0)

  return (
    <div className="mt-4 mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Last month recap
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => (p - 1 + PANELS_A.length) % PANELS_A.length)}
            className="p-1 text-text-tertiary"
          >
            <CaretLeftIcon size={14} />
          </button>
          <span className="text-[10px] text-text-tertiary w-20 text-center">{PANELS_A[page]}</span>
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1) % PANELS_A.length)}
            className="p-1 text-text-tertiary"
          >
            <CaretRightIcon size={14} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 min-h-[132px]">
        {page === 0 && (
          <div>
            <p className="text-2xl font-bold font-mono text-text-primary">
              {formatCurrency(netSaved, CURRENCY)}
            </p>
            <p className="text-xs text-text-tertiary mb-3">saved this month</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-income">+{formatCurrency(MOCK.income, CURRENCY)} in</span>
              <span className="text-expense">-{formatCurrency(MOCK.expense, CURRENCY)} out</span>
              <span
                className={`flex items-center gap-1 ${expenseDeltaPct <= 0 ? 'text-income' : 'text-danger'}`}
              >
                <TrendUpIcon size={11} className={expenseDeltaPct <= 0 ? 'rotate-180' : ''} />
                {Math.abs(expenseDeltaPct)}% vs last month
              </span>
            </div>
          </div>
        )}

        {page === 1 && (
          <div className="flex flex-col gap-2.5">
            {MOCK.budgets.map((b) => {
              const pct = Math.min((b.spent / b.limit) * 100, 100)
              const over = b.spent > b.limit
              return (
                <div key={b.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-primary">{b.name}</span>
                    <span className={over ? 'text-danger' : 'text-text-tertiary'}>
                      {formatCurrency(b.spent, CURRENCY)} / {formatCurrency(b.limit, CURRENCY)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-danger)' : b.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {page === 2 && (
          <div className="flex flex-col gap-2">
            {MOCK.topCategories.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <CategoryIcon icon={c.icon} color={c.color} size={13} containerSize={28} />
                <span className="flex-1 text-sm text-text-primary">{c.name}</span>
                <span className="text-sm font-mono text-text-primary">
                  {formatCurrency(c.amount, CURRENCY)}
                </span>
              </div>
            ))}
          </div>
        )}

        {page === 3 && (
          <div className="flex flex-col gap-2.5">
            {MOCK.goals.map((g) => {
              const pct = Math.min((g.saved / g.target) * 100, 100)
              return (
                <div key={g.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-primary">{g.name}</span>
                    <span className="text-text-tertiary">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3">
        {PANELS_A.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setPage(i)}
            className={`w-1.5 h-1.5 rounded-full ${i === page ? 'bg-accent' : 'bg-border'}`}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Variant B — stat grid up front, expandable details ───────────────────────
// A 2x2 grid of headline stat tiles (income, expense, net saved, vs last month)
// always visible. Tapping "View details" expands budget bars + top categories +
// goals below, all at once.

export function RecapVariantB() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Last month recap
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border px-4 pb-3 pt-2">
        <StatTile label="Income" value={formatCurrency(MOCK.income, CURRENCY)} tone="income" />
        <StatTile label="Expense" value={formatCurrency(MOCK.expense, CURRENCY)} tone="expense" />
        <StatTile label="Net saved" value={formatCurrency(netSaved, CURRENCY)} />
        <StatTile
          label="vs last month"
          value={`${expenseDeltaPct > 0 ? '+' : ''}${expenseDeltaPct}%`}
          tone={expenseDeltaPct <= 0 ? 'income' : 'expense'}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full py-2 text-xs font-medium text-accent border-t border-border"
      >
        {expanded ? 'Hide details' : 'View details'}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-4 border-t border-border">
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Budgets</p>
            <div className="flex flex-col gap-2">
              {MOCK.budgets.map((b) => {
                const pct = Math.min((b.spent / b.limit) * 100, 100)
                const over = b.spent > b.limit
                return (
                  <div key={b.name} className="h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-danger)' : b.color }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
              Top categories
            </p>
            <div className="flex flex-col gap-1.5">
              {MOCK.topCategories.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <CategoryIcon icon={c.icon} color={c.color} size={11} containerSize={22} />
                  <span className="flex-1 text-text-primary">{c.name}</span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(c.amount, CURRENCY)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Goals</p>
            <div className="flex flex-col gap-2">
              {MOCK.goals.map((g) => {
                const pct = Math.min((g.saved / g.target) * 100, 100)
                return (
                  <div key={g.name} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-text-primary">{g.name}</span>
                    <span className="text-text-tertiary">{Math.round(pct)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatTile({
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
          tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Variant C — static vertical stack, everything visible at once ───────────
// No paging, no expand/collapse. Headline net-saved number, then compact rows
// for every metric stacked continuously. Taller card, zero interaction to see
// everything.

export function RecapVariantC() {
  return (
    <div className="mt-4 mx-4 rounded-2xl bg-surface border border-border p-4 flex flex-col gap-4">
      <div>
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Last month recap
        </span>
        <p className="text-2xl font-bold font-mono text-text-primary mt-2">
          {formatCurrency(netSaved, CURRENCY)}
        </p>
        <p className="text-xs text-text-tertiary">
          saved ·{' '}
          <span className={expenseDeltaPct <= 0 ? 'text-income' : 'text-danger'}>
            {expenseDeltaPct > 0 ? '+' : ''}
            {expenseDeltaPct}% spend vs last month
          </span>
        </p>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Budgets</p>
        <div className="flex flex-col gap-2">
          {MOCK.budgets.map((b) => {
            const pct = Math.min((b.spent / b.limit) * 100, 100)
            const over = b.spent > b.limit
            return (
              <div key={b.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-primary">{b.name}</span>
                  <span className={over ? 'text-danger' : 'text-text-tertiary'}>
                    {formatCurrency(b.spent, CURRENCY)} / {formatCurrency(b.limit, CURRENCY)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-danger)' : b.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
          Top categories
        </p>
        <div className="flex flex-col gap-1.5">
          {MOCK.topCategories.map((c) => (
            <div key={c.name} className="flex items-center gap-2">
              <CategoryIcon icon={c.icon} color={c.color} size={12} containerSize={26} />
              <span className="flex-1 text-sm text-text-primary">{c.name}</span>
              <span className="text-sm font-mono text-text-primary">
                {formatCurrency(c.amount, CURRENCY)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Goals</p>
        <div className="flex flex-col gap-2">
          {MOCK.goals.map((g) => {
            const pct = Math.min((g.saved / g.target) * 100, 100)
            return (
              <div key={g.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-primary">{g.name}</span>
                  <span className="text-text-tertiary">{Math.round(pct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Switcher (dev-only, hidden in production builds) ────────────────────────

const VARIANTS = [
  { key: 'a', name: 'Swipeable carousel', Component: RecapVariantA },
  { key: 'b', name: 'Stat grid + expand', Component: RecapVariantB },
  { key: 'c', name: 'Static vertical stack', Component: RecapVariantC },
] as const

export function MonthlyRecapPrototypeSection() {
  const [searchParams] = useSearchParams()
  const variantKey = searchParams.get('recap') ?? 'a'
  const active = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]
  const { Component } = active
  return <Component />
}

export function RecapPrototypeSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const variantKey = searchParams.get('recap') ?? 'a'
  const idx = VARIANTS.findIndex((v) => v.key === variantKey)
  const current = VARIANTS[idx] ?? VARIANTS[0]

  function go(delta: number) {
    const nextIdx = (idx + delta + VARIANTS.length) % VARIANTS.length
    const next = VARIANTS[nextIdx]
    if (!next) return
    const params = new URLSearchParams(searchParams)
    params.set('recap', next.key)
    setSearchParams(params)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (import.meta.env.PROD) return null

  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full bg-black/90 border border-white/20 shadow-lg">
      <button type="button" onClick={() => go(-1)} className="text-white/70 px-1">
        ←
      </button>
      <span className="text-xs font-mono text-white">
        {current.key.toUpperCase()} — {current.name}
      </span>
      <button type="button" onClick={() => go(1)} className="text-white/70 px-1">
        →
      </button>
      <button
        type="button"
        onClick={() => navigate({ search: '' })}
        className="text-[10px] text-white/40 ml-2"
      >
        exit
      </button>
    </div>
  )
}
