import { ArrowClockwiseIcon, PushPinIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import type { Recurrence, RecurrenceFrequency } from '@/db/schema'
import { toPaise } from '@/lib/utils'

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

interface Props {
  open: boolean
  onClose: () => void
  recurrence: Recurrence | null
  currency: string
}

export default function RecurrenceSheet({ open, onClose, recurrence, currency }: Props) {
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [every, setEvery] = useState(1)
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [isFixed, setIsFixed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currencySymbol = currency === 'INR' ? '₹' : currency

  useEffect(() => {
    if (open && recurrence) {
      setFrequency(recurrence.frequency)
      setEvery(recurrence.interval)
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
      await db.recurrences.update(recurrence.recurrenceId, {
        frequency,
        interval: every,
        isFixed: recurrence.template.type === 'expense' ? isFixed : false,
        template: { ...recurrence.template, amount: toPaise(amount), note: note.trim() },
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    if (!recurrence) return
    if (!confirm("Stop this recurring transaction? Future instances won't be generated.")) return
    setLoading(true)
    try {
      await db.recurrences.update(recurrence.recurrenceId, {
        active: false,
        endDate: Date.now(),
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
          <SheetHeader className="p-0 flex-row items-center gap-2">
            <ArrowClockwiseIcon size={14} className="text-accent" />
            <SheetTitle className="text-base font-semibold text-text-primary">
              Edit recurring
            </SheetTitle>
          </SheetHeader>

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
              autoFocus
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
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-secondary">Every</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEvery((i) => Math.max(1, i - 1))}
                  className="w-7 h-7 rounded-lg bg-surface-3 text-text-primary text-sm font-bold"
                >
                  −
                </button>
                <span className="text-sm font-mono font-medium text-text-primary w-4 text-center">
                  {every}
                </span>
                <button
                  type="button"
                  onClick={() => setEvery((i) => Math.min(99, i + 1))}
                  className="w-7 h-7 rounded-lg bg-surface-3 text-text-primary text-sm font-bold"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-text-secondary">
                {frequency === 'daily'
                  ? 'day(s)'
                  : frequency === 'weekly'
                    ? 'week(s)'
                    : frequency === 'monthly'
                      ? 'month(s)'
                      : 'year(s)'}
              </span>
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
            onClick={handleStop}
            disabled={loading}
            className="w-full h-12 rounded-2xl font-semibold"
          >
            Stop recurring
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
