import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '@/lib/utils'

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      timeZone="UTC"
      showOutsideDays
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'flex flex-col gap-2',
        month_caption: 'flex justify-center items-center h-9 relative',
        caption_label: 'text-sm font-medium text-text-primary',
        nav: 'flex items-center justify-between absolute inset-x-0 top-0 h-9 px-1',
        button_previous:
          'w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:bg-surface-2 disabled:opacity-30',
        button_next:
          'w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:bg-surface-2 disabled:opacity-30',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[10px] font-medium text-text-tertiary uppercase',
        week: 'flex w-full mt-1',
        day: 'w-9 h-9 flex items-center justify-center p-0 relative',
        day_button:
          'w-8 h-8 rounded-lg text-sm text-text-primary hover:bg-surface-2 transition-colors outline-none',
        selected: '[&>button]:bg-accent [&>button]:text-black [&>button]:hover:bg-accent-hover',
        today: '[&>button]:border [&>button]:border-accent',
        outside: '[&>button]:text-text-tertiary/50',
        disabled: '[&>button]:text-text-tertiary/30 [&>button]:pointer-events-none',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...iconProps }) =>
          orientation === 'left' ? (
            <CaretLeftIcon size={14} {...iconProps} />
          ) : (
            <CaretRightIcon size={14} {...iconProps} />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
