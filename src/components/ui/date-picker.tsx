import { CalendarBlankIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, formatDateStr } from '@/lib/utils'

interface DatePickerProps {
  value: string // 'YYYY-MM-DD', or '' for unset
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

function parseYMD(value: string): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(Date.UTC(y, m - 1, d))
}

function formatDisplay(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function DatePicker({ value, onChange, className, placeholder = 'Pick a date' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseYMD(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            className={cn(
              'justify-start gap-2 font-normal',
              !selected && 'text-text-tertiary',
              className,
            )}
          />
        }
      >
        <CalendarBlankIcon size={14} />
        {selected ? formatDisplay(selected) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) onChange(formatDateStr(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
