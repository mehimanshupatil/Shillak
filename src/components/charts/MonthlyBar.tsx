import { useMemo } from 'react'
import { Bar, BarChart, Tooltip, XAxis } from 'recharts'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import type { Ledger } from '@/lib/ledger/read'
import { monthlyTotals } from '@/lib/ledger/read'
import { formatCurrency, monthShort } from '@/lib/utils'

const MONTHS = 6

interface Props {
  ledger: Ledger
  /** Midnight-UTC date the trailing window ends on. Passed in, never read here. */
  today: number
}

const chartConfig = { amount: { label: 'Spent' } } satisfies ChartConfig

export default function MonthlyBar({ ledger, today }: Props) {
  const data = useMemo(
    () =>
      monthlyTotals(ledger, { today, months: MONTHS }).map((bucket, i) => ({
        month: monthShort(bucket.month),
        amount: bucket.expense,
        fill: i === MONTHS - 1 ? 'var(--color-accent)' : 'var(--color-surface-3)',
      })),
    [ledger, today],
  )

  if (data.filter((b) => b.amount > 0).length < 2) return null

  return (
    <div className="mt-4 mx-4 p-4 rounded-2xl bg-surface border border-border">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
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
                <div className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs">
                  <p className="font-medium text-text-primary">{item.payload.month}</p>
                  <p className="font-mono text-text-secondary">
                    {formatCurrency(item.value as number, ledger.currency)}
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
