import { Cell, PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'

interface Goal {
  goalId: string
  name: string
  saved: number
  target: number
}

interface Props {
  goals: Goal[]
  currency: string
}

const chartConfig = { progress: { label: 'Progress' } } satisfies ChartConfig

export default function GoalProgress({ goals, currency }: Props) {
  if (goals.length === 0) return null

  // Show up to 4 goals as concentric rings
  const visible = goals.slice(0, 4)
  const data = visible.map((g) => ({
    name: g.name,
    progress: g.target > 0 ? Math.min((g.saved / g.target) * 100, 100) : 0,
    saved: g.saved,
    target: g.target,
    done: g.saved >= g.target,
  }))

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={chartConfig} className="mx-auto h-[160px] w-full max-w-[200px]">
        <RadialBarChart
          innerRadius="25%"
          outerRadius="95%"
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="progress" background={{ fill: 'var(--color-surface-2)' }}>
            {data.map((entry, i) => (
              <Cell
                // biome-ignore lint/suspicious/noArrayIndexKey: stable goal order
                key={i}
                fill={entry.done ? 'var(--color-success)' : 'var(--color-accent)'}
              />
            ))}
          </RadialBar>
        </RadialBarChart>
      </ChartContainer>

      <div className="flex flex-col gap-1.5 px-1">
        {data.map((g, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable goal order
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: g.done ? 'var(--color-success)' : 'var(--color-accent)' }}
            />
            <span className="flex-1 text-xs text-text-secondary truncate">{g.name}</span>
            <span className="text-xs font-mono text-text-primary">
              {formatCurrency(g.saved, currency)}
            </span>
            <span className="text-[10px] text-text-tertiary w-8 text-right">
              {Math.round(g.progress)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
