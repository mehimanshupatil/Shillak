import { ArrowClockwiseIcon, InfoIcon, PushPinIcon, XIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import type { Recurrence, RecurrenceFrequency } from '@/db/schema'
import { applyRecurrenceEdit } from '@/lib/recurrenceTemplate'
import { formatDateStr, ordinal, parseDateStr, toPaise, weekdayLabel } from '@/lib/utils'

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

interface Props {
  open: boolean
  onClose: () => void
  recurrence: Recurrence | null
  currency: string
}

export default function RecurrenceSheet({ open, onClose, recurrence, currency }: Props) {
  const queryClient = useQueryClient()
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [endDateStr, setEndDateStr] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [isFixed, setIsFixed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmStopOpen, setConfirmStopOpen] = useState(false)

  const currencySymbol = currency === 'INR' ? '₹' : currency

  useEffect(() => {
    if (open && recurrence) {
      setFrequency(recurrence.frequency)
      setDayOfWeek(recurrence.dayOfWeek ?? new Date(recurrence.nextDue).getUTCDay())
      setEndDateStr(recurrence.endDate ? formatDateStr(recurrence.endDate) : '')
      setAmountStr((recurrence.template.amount / 100).toFixed(2))
      setNote(recurrence.template.note)
      setIsFixed(recurrence.isFixed ?? false)
      setError('')
    }
  }, [open, recurrence])

  async function handleSave() {
    if (!recurrence) return
    const amount = parseFloat(amountStr)
    if (!amountStr || Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount')
      return
    }
    setLoading(true)
    setError('')
    try {
      await db.recurrences.update(
        recurrence.recurrenceId,
        applyRecurrenceEdit(recurrence, {
          frequency,
          dayOfWeek,
          endDate: endDateStr ? parseDateStr(endDateStr) : null,
          isFixed,
          amount: toPaise(amount),
          note: note.trim(),
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['upcomingBills', recurrence.groupId] })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    if (!recurrence) return
    setLoading(true)
    try {
      await db.recurrences.update(recurrence.recurrenceId, {
        active: false,
        endDate: Date.now(),
      })
      queryClient.invalidateQueries({ queryKey: ['upcomingBills', recurrence.groupId] })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto">
          <DrawerHeader className="p-0 flex-row items-center gap-2">
            <ArrowClockwiseIcon size={14} className="text-accent" />
            <DrawerTitle className="text-base font-semibold text-text-primary">
              Edit recurring
            </DrawerTitle>
          </DrawerHeader>

          {/* Amount */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-text-secondary z-10">
              {currencySymbol}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="h-16 rounded-2xl pl-10 pr-4 bg-surface-2
                         text-3xl font-mono font-bold text-text-primary
                         placeholder:text-text-tertiary
                         border-border focus-visible:border-accent
                         focus-visible:ring-accent/20"
            />
          </div>

          {/* Note */}
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-11 rounded-xl bg-surface-2 border-border text-sm
                       text-text-primary placeholder:text-text-tertiary
                       focus-visible:border-accent focus-visible:ring-accent/20"
          />

          {/* Frequency + interval */}
          <div className="flex flex-col gap-3 p-3 rounded-xl bg-surface-2">
            <div className="flex gap-1.5">
              {(Object.keys(FREQ_LABELS) as RecurrenceFrequency[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    frequency === f ? 'bg-accent text-black' : 'bg-surface-3 text-text-secondary'
                  }`}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
            {frequency === 'weekly' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">Repeats every</span>
                <div className="flex gap-1">
                  {WEEKDAYS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDayOfWeek(i)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                        dayOfWeek === i
                          ? 'bg-accent text-black'
                          : 'bg-surface-3 text-text-secondary'
                      }`}
                    >
                      {weekdayLabel(i)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {frequency === 'monthly' && recurrence && (
              <p className="text-xs text-text-secondary">
                Repeats monthly, on the {ordinal(new Date(recurrence.nextDue).getUTCDate())}
              </p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Ends</span>
              <div className="flex items-center gap-2">
                <DatePicker
                  value={endDateStr}
                  onChange={setEndDateStr}
                  placeholder="Never"
                  className="h-8 text-xs px-2.5"
                />
                {endDateStr && (
                  <button
                    type="button"
                    onClick={() => setEndDateStr('')}
                    className="text-text-tertiary"
                    aria-label="Clear end date"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            </div>

            {recurrence?.template.type === 'expense' && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <PushPinIcon
                    size={13}
                    className={isFixed ? 'text-accent' : 'text-text-tertiary'}
                  />
                  <div>
                    <span className="text-xs font-medium text-text-primary">Fixed outflow</span>
                    <p className="text-[10px] text-text-tertiary">EMI, SIP, rent</p>
                  </div>
                  <Popover>
                    <PopoverTrigger
                      aria-label="What does fixed outflow do?"
                      className="text-text-tertiary"
                    >
                      <InfoIcon size={13} />
                    </PopoverTrigger>
                    <PopoverContent className="max-w-65">
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Turn this on for bills you have to pay no matter what — like EMI, SIP, or
                        rent. Your Dashboard then shows these separately from money you chose to
                        spend, so you can see how much you actually have left over each month. It
                        won't hide anything — your Upcoming Bills list stays the same either way.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <Switch checked={isFixed} onCheckedChange={setIsFixed} aria-label="Fixed outflow" />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl font-semibold bg-accent text-black hover:bg-accent-hover"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>

          <Button
            variant="destructive"
            onClick={() => setConfirmStopOpen(true)}
            disabled={loading}
            className="w-full h-12 rounded-2xl font-semibold"
          >
            Stop recurring
          </Button>
        </div>
      </DrawerContent>

      <AlertDialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this recurring transaction?</AlertDialogTitle>
            <AlertDialogDescription>Future instances won't be generated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStop}>Stop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  )
}
