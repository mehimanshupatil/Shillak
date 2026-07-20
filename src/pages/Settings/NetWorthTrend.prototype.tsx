// PROTOTYPE — throwaway UI exploration for wayfinder ticket #13
// (Net worth trend: visual & layout design). Three structurally different
// takes on a single-line net-worth chart for the Accounts page. Mock data
// only — not wired to the real running-balance computation from ticket #12.
//
// Mounted on the existing Accounts route, gated by ?nw=a|b|c. A "Simulate
// short history" toggle swaps in a 3-month mock dataset to react to the
// degraded/empty state each variant handles.

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'

const CURRENCY = 'INR'
const chartConfig = { netWorth: { label: 'Net worth' } } satisfies ChartConfig

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const FULL_HISTORY = [
  4200000, 4550000, 4300000, 4800000, 5100000, 5400000,
  5250000, 5700000, 6100000, 6400000, 6250000, 6800000,
].map((netWorth, i) => ({ month: MONTHS_SHORT[i] ?? '', netWorth }))

const SHORT_HISTORY = [6100000, 6400000, 6800000].map((netWorth, i) => ({
  month: MONTHS_SHORT[9 + i] ?? '',
  netWorth,
}))

function useMockData() {
  const [searchParams] = useSearchParams()
  const short = searchParams.get('history') === 'short'
  return short ? SHORT_HISTORY : FULL_HISTORY
}

function EmptyOrDegraded({ data }: { data: typeof FULL_HISTORY }) {
  if (data.length >= 2) return null
  return (
    <p className="text-sm text-text-tertiary text-center py-8">
      Not enough history yet — net worth trend needs at least 2 months of data.
    </p>
  )
}

// ─── Variant A — filled area/line chart, full axes ────────────────────────────
// Classic finance-app trend chart: line with a soft area fill under it, month
// labels on the x-axis, currency-formatted tooltip on hover. Degraded state
// shows a shorter line rather than hiding the section.

export function NetWorthVariantA() {
  const data = useMockData()
  const latest = data[data.length - 1]?.netWorth ?? 0

  return (
    <div className="mt-4 p-4 rounded-2xl bg-surface border border-border">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Net worth trend
        </p>
        <span className="text-sm font-mono font-bold text-text-primary">
          {formatCurrency(latest, CURRENCY)}
        </span>
      </div>

      {data.length < 2 ? (
        <EmptyOrDegraded data={data} />
      ) : (
        <ChartContainer config={chartConfig} className="h-[140px] w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
            />
            <YAxis hide domain={['dataMin - 500000', 'dataMax + 500000']} />
            <Tooltip
              cursor={{ stroke: 'var(--color-border)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0]
                if (!item) return null
                return (
                  <div className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs">
                    <p className="font-medium text-text-primary">{item.payload.month}</p>
                    <p className="font-mono text-text-secondary">
                      {formatCurrency(item.value as number, CURRENCY)}
                    </p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#nwFill)"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  )
}

// ─── Variant B — per-month bar chart ──────────────────────────────────────────
// Bars instead of a line — each month is its own discrete bar, red-tinted if
// net worth is negative that month. Matches MonthlyBar's existing bar style.

export function NetWorthVariantB() {
  const data = useMockData()

  return (
    <div className="mt-4 p-4 rounded-2xl bg-surface border border-border">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
        Net worth · last {data.length} months
      </p>

      {data.length < 2 ? (
        <EmptyOrDegraded data={data} />
      ) : (
        <ChartContainer config={chartConfig} className="h-[140px] w-full">
          <BarChart data={data} barSize={data.length > 8 ? 16 : 28}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0]
                if (!item) return null
                return (
                  <div className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs">
                    <p className="font-medium text-text-primary">{item.payload.month}</p>
                    <p className="font-mono text-text-secondary">
                      {formatCurrency(item.value as number, CURRENCY)}
                    </p>
                  </div>
                )
              }}
            />
            <Bar dataKey="netWorth" radius={[4, 4, 0, 0]} fill="var(--color-accent)" />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  )
}

// ─── Variant C — headline number + compact sparkline, tap to expand ──────────
// Leads with the current net-worth number (big, mono), a small axis-less
// sparkline beneath it for shape-at-a-glance. Tapping expands into a full
// line chart with axis labels and a month-over-month delta line.

export function NetWorthVariantC() {
  const data = useMockData()
  const [expanded, setExpanded] = useState(false)
  const latest = data[data.length - 1]?.netWorth ?? 0
  const first = data[0]?.netWorth ?? 0
  const deltaPct = first === 0 ? 0 : Math.round(((latest - first) / first) * 100)

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="mt-4 w-full text-left p-4 rounded-2xl bg-surface border border-border"
    >
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
        Net worth
      </p>
      <p className="text-2xl font-bold font-mono text-text-primary">
        {formatCurrency(latest, CURRENCY)}
      </p>
      {data.length >= 2 && (
        <p className={`text-xs mt-0.5 ${deltaPct >= 0 ? 'text-income' : 'text-danger'}`}>
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct}% over last {data.length}mo
        </p>
      )}

      {data.length < 2 ? (
        <EmptyOrDegraded data={data} />
      ) : !expanded ? (
        <div className="h-8 mt-2">
          <ChartContainer config={chartConfig} className="h-8 w-full">
            <LineChart data={data}>
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      ) : (
        <div className="mt-3">
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <LineChart data={data}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
              />
              <YAxis hide domain={['dataMin - 500000', 'dataMax + 500000']} />
              <Tooltip
                cursor={{ stroke: 'var(--color-border)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const item = payload[0]
                  if (!item) return null
                  return (
                    <div className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs">
                      <p className="font-medium text-text-primary">{item.payload.month}</p>
                      <p className="font-mono text-text-secondary">
                        {formatCurrency(item.value as number, CURRENCY)}
                      </p>
                    </div>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-accent)' }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </button>
  )
}

// ─── Switcher (dev-only, hidden in production builds) ────────────────────────

const VARIANTS = [
  { key: 'a', name: 'Filled area chart', Component: NetWorthVariantA },
  { key: 'b', name: 'Per-month bars', Component: NetWorthVariantB },
  { key: 'c', name: 'Number + sparkline', Component: NetWorthVariantC },
] as const

export function NetWorthTrendPrototypeSection() {
  const [searchParams] = useSearchParams()
  const variantKey = searchParams.get('nw') ?? 'a'
  const active = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]
  const { Component } = active
  return <Component />
}

export function NetWorthPrototypeSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const variantKey = searchParams.get('nw') ?? 'a'
  const idx = VARIANTS.findIndex((v) => v.key === variantKey)
  const current = VARIANTS[idx] ?? VARIANTS[0]
  const isShort = searchParams.get('history') === 'short'

  function go(delta: number) {
    const nextIdx = (idx + delta + VARIANTS.length) % VARIANTS.length
    const next = VARIANTS[nextIdx]
    if (!next) return
    const params = new URLSearchParams(searchParams)
    params.set('nw', next.key)
    setSearchParams(params)
  }

  function toggleHistory() {
    const params = new URLSearchParams(searchParams)
    if (isShort) params.delete('history')
    else params.set('history', 'short')
    setSearchParams(params)
  }

  if (import.meta.env.PROD) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full bg-black/90 border border-white/20 shadow-lg">
      <button type="button" onClick={() => go(-1)} className="text-white/70 px-1">
        ←
      </button>
      <span className="text-xs font-mono text-white">
        {current.key.toUpperCase()} — {current.name}
      </span>
      <button type="button" onClick={() => go(1)} className="text-white/70 px-1">
        →
      </button>
      <button type="button" onClick={toggleHistory} className="text-[10px] text-white/60 ml-2 underline">
        {isShort ? 'full history' : 'simulate short history'}
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
