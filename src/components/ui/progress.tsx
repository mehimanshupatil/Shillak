import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  trackClassName?: string
  indicatorClassName?: string
  indicatorStyle?: React.CSSProperties
}

function Progress({
  value,
  max = 100,
  className,
  trackClassName,
  indicatorClassName,
  indicatorStyle,
}: ProgressProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <ProgressPrimitive.Root data-slot="progress" value={value} max={max} className={className}>
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn('h-1.5 rounded-full bg-surface-2 overflow-hidden', trackClassName)}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn('h-full rounded-full transition-all', indicatorClassName)}
          style={{ width: `${pct}%`, ...indicatorStyle }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
