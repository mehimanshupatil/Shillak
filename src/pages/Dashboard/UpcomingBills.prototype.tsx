// PROTOTYPE — throwaway UI exploration for wayfinder ticket #4
// (Upcoming bills list: visual & layout design). Three structurally different
// takes on the same mock data. Not wired to real Dexie queries — this only
// answers "what should it look like", not "how is the data computed".
//
// Mounted on the existing Dashboard route, gated by ?variant=a|b|c.
// See PrototypeSwitcher at the bottom for the floating dev-only switch bar.

import { ArrowClockwiseIcon, CaretRightIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { formatCurrency } from '@/lib/utils'

// ─── Mock data ────────────────────────────────────────────────────────────────

interface MockBill {
  id: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  note: string
  amount: number
  daysUntil: number // negative = overdue
  frequency: string
}

const CURRENCY = 'INR'

const MOCK_BILLS: MockBill[] = [
  {
    id: '1',
    categoryName: 'Rent',
    categoryIcon: 'Home',
    categoryColor: '#f59e0b',
    note: 'House rent',
    amount: 2500000,
    daysUntil: -3,
    frequency: 'monthly',
  },
  {
    id: '2',
    categoryName: 'EMI',
    categoryIcon: 'Bank',
    categoryColor: '#ef4444',
    note: 'Car loan',
    amount: 1450000,
    daysUntil: 2,
    frequency: 'monthly',
  },
  {
    id: '3',
    categoryName: 'Utilities',
    categoryIcon: 'Lightning',
    categoryColor: '#06b6d4',
    note: 'Electricity',
    amount: 320000,
    daysUntil: 5,
    frequency: 'monthly',
  },
  {
    id: '4',
    categoryName: 'Entertainment',
    categoryIcon: 'Play',
    categoryColor: '#8b5cf6',
    note: 'Netflix',
    amount: 64900,
    daysUntil: 9,
    frequency: 'monthly',
  },
  {
    id: '5',
    categoryName: 'Insurance',
    categoryIcon: 'ShieldCheck',
    categoryColor: '#14b8a6',
    note: 'LIC premium',
    amount: 500000,
    daysUntil: 14,
    frequency: 'yearly',
  },
  {
    id: '6',
    categoryName: 'Utilities',
    categoryIcon: 'WifiHigh',
    categoryColor: '#06b6d4',
    note: 'Broadband',
    amount: 129900,
    daysUntil: 21,
    frequency: 'monthly',
  },
  {
    id: '7',
    categoryName: 'Household',
    categoryIcon: 'Wrench',
    categoryColor: '#64748b',
    note: 'Maid + cook',
    amount: 800000,
    daysUntil: 27,
    frequency: 'monthly',
  },
]

const OVERDUE = MOCK_BILLS.filter((b) => b.daysUntil < 0)
const UPCOMING = MOCK_BILLS.filter((b) => b.daysUntil >= 0).sort((a, b) => a.daysUntil - b.daysUntil)
const UPCOMING_TOTAL = UPCOMING.reduce((s, b) => s + b.amount, 0)
const OVERDUE_TOTAL = OVERDUE.reduce((s, b) => s + b.amount, 0)

function daysLabel(d: number): string {
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'today'
  return `in ${d}d`
}

// ─── Variant A — compact capped list, "see all" affordance ───────────────────
// Flat list, soonest-first, capped at 5 rows. Overdue items pinned to the top
// in a danger-tinted sub-row. Closest to the existing "Upcoming" block already
// on Dashboard — evolves it rather than replacing the mental model.

export function VariantA() {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? UPCOMING : UPCOMING.slice(0, 5)

  return (
    <div className="mt-6 px-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Upcoming bills
        </p>
        <span className="text-xs font-mono text-text-tertiary">
          {formatCurrency(UPCOMING_TOTAL, CURRENCY)} / 30d
        </span>
      </div>

      {OVERDUE.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {OVERDUE.map((bill) => (
            <BillRow key={bill.id} bill={bill} overdue />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((bill) => (
          <BillRow key={bill.id} bill={bill} />
        ))}
      </div>

      {!showAll && UPCOMING.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full mt-2 py-2 text-xs font-medium text-accent text-center"
        >
          See all {UPCOMING.length} upcoming
        </button>
      )}

      {UPCOMING.length === 0 && OVERDUE.length === 0 && (
        <EmptyState />
      )}
    </div>
  )
}

function BillRow({ bill, overdue = false }: { bill: MockBill; overdue?: boolean }) {
  return (
    <div
      className={`w-full flex items-center gap-3 p-3 rounded-xl border ${
        overdue ? 'bg-danger/5 border-danger/30' : 'bg-surface border-transparent'
      }`}
    >
      <CategoryIcon icon={bill.categoryIcon} color={bill.categoryColor} size={16} containerSize={36} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{bill.note}</p>
        <p className={`text-xs ${overdue ? 'text-danger' : 'text-text-tertiary'}`}>
          {overdue && <WarningCircleIcon size={11} className="inline mr-1 -mt-0.5" />}
          {daysLabel(bill.daysUntil)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <ArrowClockwiseIcon size={10} className="text-text-tertiary" />
        <span className="text-sm font-mono font-medium text-text-primary">
          {formatCurrency(bill.amount, CURRENCY)}
        </span>
      </div>
    </div>
  )
}

// ─── Variant B — stat-tile first, collapsible detail ──────────────────────────
// Leads with the aggregate numbers (upcoming total + overdue total as two
// tiles), matching the density of ThisMonthSummary/FixedOutflowsCard. Detail
// list is hidden behind a tap — the number is the primary artifact, not the list.

export function VariantB() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 mx-4 rounded-2xl bg-surface border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Upcoming bills · next 30d
        </span>
        <CaretRightIcon
          size={14}
          className={`text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        <div className="px-4 py-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Due</p>
          <p className="text-sm font-bold font-mono text-text-primary">
            {formatCurrency(UPCOMING_TOTAL, CURRENCY)}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">{UPCOMING.length} bills</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Overdue</p>
          <p
            className={`text-sm font-bold font-mono ${OVERDUE.length > 0 ? 'text-danger' : 'text-text-primary'}`}
          >
            {formatCurrency(OVERDUE_TOTAL, CURRENCY)}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">{OVERDUE.length} bills</p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {[...OVERDUE, ...UPCOMING].map((bill) => (
            <div key={bill.id} className="flex items-center gap-3 px-4 py-2.5">
              <CategoryIcon
                icon={bill.categoryIcon}
                color={bill.categoryColor}
                size={13}
                containerSize={30}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{bill.note}</p>
                <p
                  className={`text-[10px] ${bill.daysUntil < 0 ? 'text-danger' : 'text-text-tertiary'}`}
                >
                  {daysLabel(bill.daysUntil)}
                </p>
              </div>
              <span className="text-sm font-mono text-text-primary shrink-0">
                {formatCurrency(bill.amount, CURRENCY)}
              </span>
            </div>
          ))}
          {UPCOMING.length === 0 && OVERDUE.length === 0 && (
            <div className="px-4 py-6">
              <EmptyState compact />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Variant C — grouped-by-timeframe timeline ────────────────────────────────
// Buckets into Overdue / This week / Next 2 weeks / Rest of month. No cap or
// "see all" — the grouping itself keeps it scannable, sections collapse
// individually if empty.

const GROUPS: Array<{ label: string; test: (d: number) => boolean; danger?: boolean }> = [
  { label: 'Overdue', test: (d) => d < 0, danger: true },
  { label: 'This week', test: (d) => d >= 0 && d <= 7 },
  { label: 'Next 2 weeks', test: (d) => d > 7 && d <= 21 },
  { label: 'Rest of month', test: (d) => d > 21 },
]

export function VariantC() {
  const groups = GROUPS.map((g) => ({
    ...g,
    bills: MOCK_BILLS.filter((b) => g.test(b.daysUntil)).sort((a, b) => a.daysUntil - b.daysUntil),
  })).filter((g) => g.bills.length > 0)

  return (
    <div className="mt-6 px-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Upcoming bills
        </p>
        <span className="text-xs font-mono text-text-tertiary">
          {formatCurrency(UPCOMING_TOTAL + OVERDUE_TOTAL, CURRENCY)} total
        </span>
      </div>

      {groups.length === 0 && <EmptyState />}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                group.danger ? 'text-danger' : 'text-text-tertiary'
              }`}
            >
              {group.label}
            </p>
            <div className="flex flex-col gap-1.5">
              {group.bills.map((bill) => (
                <div
                  key={bill.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl ${
                    group.danger ? 'bg-danger/5' : 'bg-surface'
                  }`}
                >
                  <CategoryIcon
                    icon={bill.categoryIcon}
                    color={bill.categoryColor}
                    size={14}
                    containerSize={30}
                  />
                  <p className="flex-1 min-w-0 text-sm text-text-primary truncate">{bill.note}</p>
                  <span className="text-sm font-mono text-text-primary shrink-0">
                    {formatCurrency(bill.amount, CURRENCY)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`text-sm text-text-tertiary text-center ${compact ? '' : 'py-8'}`}>
      No upcoming bills in the next 30 days.
    </p>
  )
}

// ─── Switcher (dev-only, hidden in production builds) ────────────────────────

const VARIANTS = [
  { key: 'a', name: 'Capped list', Component: VariantA },
  { key: 'b', name: 'Stat tile', Component: VariantB },
  { key: 'c', name: 'Grouped timeline', Component: VariantC },
] as const

export function UpcomingBillsPrototypeSection() {
  const [searchParams] = useSearchParams()
  const variantKey = searchParams.get('variant') ?? 'a'
  const active = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]
  const { Component } = active
  return <Component />
}

export function PrototypeSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const variantKey = searchParams.get('variant') ?? 'a'
  const idx = VARIANTS.findIndex((v) => v.key === variantKey)
  const current = VARIANTS[idx] ?? VARIANTS[0]

  function go(delta: number) {
    const nextIdx = (idx + delta + VARIANTS.length) % VARIANTS.length
    const next = VARIANTS[nextIdx]
    if (!next) return
    const params = new URLSearchParams(searchParams)
    params.set('variant', next.key)
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
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full bg-black/90 border border-white/20 shadow-lg">
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
