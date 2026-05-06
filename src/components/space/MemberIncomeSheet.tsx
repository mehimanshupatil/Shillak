import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { GroupMember } from '@/db/schema'
import { CURRENCIES } from '@/lib/constants'
import { toPaise } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  member: GroupMember
  defaultCurrency: string
}

export default function MemberIncomeSheet({ open, onClose, member, defaultCurrency }: Props) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setAmount(member.monthlyIncome != null ? String(member.monthlyIncome / 100) : '')
      setCurrency(member.incomeCurrency ?? defaultCurrency)
      setError('')
    }
  }, [open, member, defaultCurrency])

  async function handleSave() {
    const parsed = Number.parseFloat(amount)
    if (amount.trim() !== '' && (Number.isNaN(parsed) || parsed < 0)) {
      setError('Enter a valid amount')
      return
    }
    setLoading(true)
    setError('')
    try {
      await db.members.update(member.id, {
        monthlyIncome: amount.trim() === '' ? null : toPaise(parsed),
        incomeCurrency: currency,
        updatedAt: Date.now(),
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setAmount('')
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
        <div className="px-5 pb-6 flex flex-col gap-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              Monthly income
            </SheetTitle>
            <p className="text-xs text-text-tertiary">
              Used to calculate household savings rate. Only you can see and edit this.
            </p>
          </SheetHeader>

          <div className="flex gap-3">
            {/* Currency picker */}
            <div className="space-y-1.5 w-28 shrink-0">
              <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Currency
              </Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-11 rounded-xl px-3 bg-surface-2 border border-border
                           text-text-primary focus:outline-none focus:border-accent transition-colors text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Amount / month
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 85000"
                className="h-11 rounded-xl bg-surface-2 border-border
                           text-text-primary placeholder:text-text-tertiary
                           focus-visible:border-accent focus-visible:ring-accent/20"
              />
            </div>
          </div>

          <p className="text-xs text-text-tertiary -mt-2">
            Enter your take-home salary in full rupees. Stored only on this device.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            {member.monthlyIncome != null && (
              <Button variant="secondary" onClick={handleClear} className="rounded-xl px-4">
                Clear
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleSave}
              disabled={loading}
              className="flex-1 rounded-2xl font-semibold"
            >
              {loading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
