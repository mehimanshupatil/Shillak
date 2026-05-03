import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import type { Group } from '@/db/schema'
import { CURRENCIES, MONTHS } from '@/lib/constants'

interface Props {
  open: boolean
  onClose: () => void
  group: Group
}

export default function EditGroupSheet({ open, onClose, group }: Props) {
  const [name, setName] = useState(group.name)
  const [currency, setCurrency] = useState(group.currency)
  const [fiscalMonth, setFiscalMonth] = useState(group.fiscalYearStart)
  const [splitEnabled, setSplitEnabled] = useState(group.splitEnabled)
  const [incomeTracking, setIncomeTracking] = useState(group.incomeTracking)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(group.name)
      setCurrency(group.currency)
      setFiscalMonth(group.fiscalYearStart)
      setSplitEnabled(group.splitEnabled)
      setIncomeTracking(group.incomeTracking)
      setError('')
    }
  }, [open, group])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await db.groups.update(group.groupId, {
        name: name.trim(),
        currency,
        fiscalYearStart: fiscalMonth,
        splitEnabled,
        incomeTracking,
        updatedAt: Date.now(),
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
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-[var(--color-surface)]
                   border-0 border-t border-[var(--color-border)] safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              Edit group
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Group name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                         text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                         focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Currency
            </Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full h-11 rounded-xl px-4 bg-[var(--color-surface-2)] border border-[var(--color-border)]
                         text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Fiscal year starts in
            </Label>
            <select
              value={fiscalMonth}
              onChange={(e) => setFiscalMonth(Number(e.target.value))}
              className="w-full h-11 rounded-xl px-4 bg-[var(--color-surface-2)] border border-[var(--color-border)]
                         text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Split bills</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">Track who owes whom</p>
              </div>
              <Switch
                checked={splitEnabled}
                onCheckedChange={setSplitEnabled}
                aria-label="Enable split bills"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Income tracking
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Log income alongside expenses
                </p>
              </div>
              <Switch
                checked={incomeTracking}
                onCheckedChange={setIncomeTracking}
                aria-label="Enable income tracking"
              />
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                       hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
