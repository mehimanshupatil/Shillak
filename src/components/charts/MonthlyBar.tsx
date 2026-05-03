import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Bar, BarChart, Cell, Tooltip, XAxis } from 'recharts'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { db } from '@/db/db'
import { formatCurrency } from '@/lib/utils'

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

const NOW_YEAR = new Date().getFullYear()
const NOW_MONTH = new Date().getMonth()

interface Props {
  groupId: string
  currency: string
}

const chartConfig = { amount: { label: 'Spent' } } satisfies ChartConfig

export default function MonthlyBar({ groupId, currency }: Props) {
  const windowStart = useMemo(() => {
    const d = new Date(NOW_YEAR, NOW_MONTH - 5, 1)
    return Date.UTC(d.getFullYear(), d.getMonth(), 1)
  }, [])

  const transactions = useLiveQuery(
    () =>
      db.transactions.where(
        (t) =>
          t.groupId === groupId &&
          t.deletedAt === null &&
          t.type === 'expense' &&
          t.date >= windowStart,
      ),
    [groupId, windowStart],
  )

  const data = useMemo(() => {
    const buckets: Array<{ month: string; amount: number; isCurrent: boolean }> = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(NOW_YEAR, NOW_MONTH - i, 1)
      buckets.push({ month: MONTHS_SHORT[d.getMonth()] ?? '', amount: 0, isCurrent: i === 0 })
    }
    for (const txn of transactions ?? []) {
      const d = new Date(txn.date)
      const monthsAgo = (NOW_YEAR - d.getUTCFullYear()) * 12 + (NOW_MONTH - d.getUTCMonth())
      if (monthsAgo >= 0 && monthsAgo <= 5) {
        const bucket = buckets[5 - monthsAgo]
        if (bucket) bucket.amount += txn.amount
      }
    }
    return buckets
  }, [transactions])

  if (data.filter((b) => b.amount > 0).length < 2) return null

  return (
    <div className="mt-4 mx-4 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
        6-month trend
      </p>
      <ChartContainer config={chartConfig} className="h-[100px] w-full">
        <BarChart data={data} barSize={24}>
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
                <div className="px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs">
                  <p className="font-medium text-[var(--color-text-primary)]">
                    {item.payload.month}
                  </p>
                  <p className="font-mono text-[var(--color-text-secondary)]">
                    {formatCurrency(item.value as number, currency)}
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                // biome-ignore lint/suspicious/noArrayIndexKey: stable month order
                key={i}
                fill={entry.isCurrent ? 'var(--color-accent)' : 'var(--color-surface-3)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
