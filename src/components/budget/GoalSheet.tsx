import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { SavingsGoal } from '@/db/schema'
import { generateId, toPaise } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  currency: string
  goal?: SavingsGoal
}

export default function GoalSheet({ open, onClose, groupId, currency, goal }: Props) {
  const isEdit = !!goal
  const [name, setName] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [savedStr, setSavedStr] = useState('')
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(goal?.name ?? '')
      setTargetStr(goal ? String(goal.target / 100) : '')
      setSavedStr(goal ? String(goal.saved / 100) : '')
      setDeadline(goal?.deadline ? (new Date(goal.deadline).toISOString().split('T')[0] ?? '') : '')
      setError('')
    }
  }, [open, goal])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const target = parseFloat(targetStr)
    if (!targetStr || Number.isNaN(target) || target <= 0) {
      setError('Enter a valid target amount')
      return
    }
    const saved = parseFloat(savedStr) || 0
    setLoading(true)
    setError('')
    try {
      const deadlineMs = deadline ? new Date(deadline).getTime() : null
      if (isEdit && goal) {
        await db.goals.update(goal.goalId, {
          name: name.trim(),
          target: toPaise(target),
          saved: toPaise(saved),
          deadline: deadlineMs,
          updatedAt: Date.now(),
        })
      } else {
        await db.goals.put({
          goalId: generateId(),
          groupId,
          name: name.trim(),
          target: toPaise(target),
          saved: toPaise(saved),
          deadline: deadlineMs,
          categoryId: null,
          updatedAt: Date.now(),
        })
      }
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const currencySymbol = currency === 'INR' ? '₹' : currency

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
        <div className="px-5 pb-6 flex flex-col gap-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              {isEdit ? 'Edit goal' : 'New savings goal'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Goal name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency fund, New laptop"
              className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                         text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                         focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Target ({currencySymbol})
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={targetStr}
                onChange={(e) => setTargetStr(e.target.value)}
                placeholder="0"
                className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                           text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                           focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Saved ({currencySymbol})
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={savedStr}
                onChange={(e) => setSavedStr(e.target.value)}
                placeholder="0"
                className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                           text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                           focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Deadline (optional)
            </Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                         text-[var(--color-text-primary)]
                         focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                       hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
