import { ArrowLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Tooltip, XAxis, YAxis } from 'recharts'
import AccountSheet, { ICON_MAP } from '@/components/account/AccountSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { db } from '@/db/db'
import type { Account } from '@/db/schema'
import { useNetWorthTrend } from '@/hooks/useNetWorthTrend'
import { formatCurrency, toBaseCurrency } from '@/lib/utils'
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
] as const

const netWorthChartConfig = { netWorth: { label: 'Net worth' } } satisfies ChartConfig

export default function AccountsPage() {
  const navigate = useNavigate()
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | undefined>(undefined)

  const accounts = useLiveQuery(
    () => (activeGroupId ? db.accounts.where((a) => a.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const allTxns = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where((t) => t.groupId === activeGroupId && t.deletedAt === null)
        : [],
    [activeGroupId],
  )

  const currency = group?.currency ?? 'INR'
  const sorted = (accounts ?? []).sort((a, b) => a.sortOrder - b.sortOrder)

  const { data: netWorthTrend } = useNetWorthTrend(activeGroupId, currency)

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    for (const acc of sorted) {
      let balance = acc.openingBalance ?? 0
      for (const t of allTxns ?? []) {
        let delta = 0
        if (t.accountId === acc.accountId) {
          if (t.type === 'income') delta = toBaseCurrency(t, currency)
          else delta = -toBaseCurrency(t, currency) // expense or transfer-out
        } else if (t.toAccountId === acc.accountId && t.type === 'transfer') {
          delta = toBaseCurrency(t, currency)
        }
        // Credit accounts track "amount owed" — a charge increases it, a payment decreases it.
        balance += acc.type === 'credit' ? -delta : delta
      }
      balances[acc.accountId] = balance
    }
    return balances
  }, [sorted, allTxns, currency])

  async function handleDelete(acc: Account) {
    const txns = await db.transactions.where(
      (t) => t.groupId === activeGroupId && t.accountId === acc.accountId && t.deletedAt === null,
    )
    if (txns.length > 0) {
      alert(`Cannot delete — ${txns.length} transaction(s) use this account.`)
      return
    }
    await db.accounts.delete(acc.accountId)
  }

  return (
    <div className="px-4 pt-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center justify-center w-8 h-8 rounded-full
                     bg-surface-2 text-text-secondary active:bg-surface-3 transition-colors"
          aria-label="Back"
        >
          <ArrowLeftIcon size={16} />
        </button>
        <h1 className="text-xl font-bold text-text-primary flex-1">Accounts</h1>
        <Button
          variant="link"
          onClick={() => {
            setEditAccount(undefined)
            setSheetOpen(true)
          }}
        >
          <PlusIcon size={12} />
          Add
        </Button>
      </div>

      {netWorthTrend && <NetWorthTrendCard points={netWorthTrend.points} currency={currency} />}

      <div className="flex flex-col gap-1.5">
        {sorted.map((acc) => {
          const IconComponent = ICON_MAP[acc.icon]
          return (
            <div
              key={acc.accountId}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${acc.color}22` }}
              >
                {IconComponent && <IconComponent size={16} style={{ color: acc.color }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">{acc.name}</p>
                <p className="text-[10px] text-text-tertiary capitalize">{acc.type}</p>
              </div>
              {accountBalances[acc.accountId] !== undefined && (
                <span
                  className={`text-sm font-mono font-medium shrink-0 ${
                    (accountBalances[acc.accountId] ?? 0) < 0 ? 'text-danger' : 'text-text-primary'
                  }`}
                >
                  {formatCurrency(accountBalances[acc.accountId] ?? 0, currency)}
                </span>
              )}
              {acc.isDefault && <Badge>default</Badge>}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setEditAccount(acc)
                  setSheetOpen(true)
                }}
                className="text-text-tertiary hover:text-text-primary"
              >
                <PencilIcon size={13} />
              </Button>
              {!acc.isDefault && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(acc)}
                  className="text-text-tertiary hover:text-danger hover:bg-danger/10"
                >
                  <TrashIcon size={13} />
                </Button>
              )}
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-text-tertiary py-8 text-center">No accounts yet.</p>
        )}
      </div>

      {activeGroupId && (
        <AccountSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
            setEditAccount(undefined)
          }}
          groupId={activeGroupId}
          account={editAccount}
          nextSortOrder={(accounts ?? []).length}
        />
      )}
    </div>
  )
}

// ─── Net Worth Trend Card ─────────────────────────────────────────────────────

function NetWorthTrendCard({
  points,
  currency,
}: {
  points: Array<{ year: number; month: number; netWorth: number }>
  currency: string
}) {
  const latest = points[points.length - 1]?.netWorth ?? 0
  const chartData = points.map((p) => ({ month: MONTHS_SHORT[p.month], netWorth: p.netWorth }))

  return (
    <div className="p-4 rounded-2xl bg-surface border border-border">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Net worth trend
        </p>
        <span className="text-sm font-mono font-bold text-text-primary">
          {formatCurrency(latest, currency)}
        </span>
      </div>

      {points.length < 2 ? (
        <p className="text-sm text-text-tertiary text-center py-8">
          Not enough history yet — net worth trend needs at least 2 months of data.
        </p>
      ) : (
        <ChartContainer config={netWorthChartConfig} className="h-[140px] w-full">
          <AreaChart data={chartData}>
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
                      {formatCurrency(item.value as number, currency)}
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
