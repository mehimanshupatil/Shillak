import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'

interface Slice {
  name: string
  color: string
  amount: number
}

interface Props {
  slices: Slice[]
  total: number
  currency: string
}

export default function SpendingDonut({ slices, total, currency }: Props) {
  if (total === 0 || slices.length === 0) return null

  const chartConfig = slices.reduce<ChartConfig>((acc, s) => {
    acc[s.name] = { label: s.name, color: s.color }
    return acc
  }, {})

  const data = slices.map((s) => ({ name: s.name, value: s.amount, fill: s.color }))

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={chartConfig} className="mx-auto h-[180px] w-full max-w-[240px]">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]
              if (!item) return null
              return (
                <div className="px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs">
                  <p className="font-medium text-[var(--color-text-primary)]">{item.name}</p>
                  <p className="font-mono text-[var(--color-text-secondary)]">
                    {formatCurrency(item.value as number, currency)}
                  </p>
                </div>
              )
            }}
          />
        </PieChart>
      </ChartContainer>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 px-1">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 text-xs text-[var(--color-text-secondary)] truncate">
              {s.name}
            </span>
            <span className="text-xs font-mono text-[var(--color-text-primary)]">
              {formatCurrency(s.amount, currency)}
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)] w-8 text-right">
              {Math.round((s.amount / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
