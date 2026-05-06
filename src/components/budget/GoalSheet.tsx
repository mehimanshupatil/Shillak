import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { Category, SavingsGoal } from '@/db/schema'
import { generateId, toPaise } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  currency: string
  goal?: SavingsGoal
  categories: Category[]
}

export default function GoalSheet({ open, onClose, groupId, currency, goal, categories }: Props) {
  const isEdit = !!goal
  const [name, setName] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [deadline, setDeadline] = useState('')
  const [linkedCategoryId, setLinkedCategoryId] = useState<string | null>(null)
  // Manual saved — only used when no category linked
  const [savedStr, setSavedStr] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  )

  useEffect(() => {
    if (open) {
      setName(goal?.name ?? '')
      setTargetStr(goal ? String(goal.target / 100) : '')
      setSavedStr(goal?.categoryId ? '' : goal ? String(goal.saved / 100) : '')
      setDeadline(goal?.deadline ? (new Date(goal.deadline).toISOString().split('T')[0] ?? '') : '')
      setLinkedCategoryId(goal?.categoryId ?? null)
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
    // Manual saved only when no category linked
    const saved = linkedCategoryId ? 0 : parseFloat(savedStr) || 0
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
          categoryId: linkedCategoryId,
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
          categoryId: linkedCategoryId,
          createdAt: Date.now(),
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
  const linkedCat = incomeCategories.find((c) => c.categoryId === linkedCategoryId)

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
              {isEdit ? 'Edit goal' : 'New savings goal'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Goal name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency fund, New laptop"
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Target ({currencySymbol})
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              placeholder="0"
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          {/* Link to income category — auto-track savings */}
          {incomeCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Auto-track from category (optional)
              </Label>
              <div className="flex gap-2 flex-wrap">
                {incomeCategories.map((cat) => {
                  const active = linkedCategoryId === cat.categoryId
                  return (
                    <button
                      key={cat.categoryId}
                      type="button"
                      onClick={() => setLinkedCategoryId(active ? null : cat.categoryId)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        active ? 'text-black' : 'bg-surface-2 text-text-secondary'
                      }`}
                      style={active ? { backgroundColor: cat.color } : {}}
                    >
                      <CategoryIcon
                        icon={cat.icon}
                        color={active ? '#000' : cat.color}
                        size={11}
                        containerSize={0}
                      />
                      {cat.name}
                    </button>
                  )
                })}
              </div>
              {linkedCat ? (
                <p className="text-[10px] text-text-tertiary">
                  Progress derived from all "{linkedCat.name}" income transactions. Manual entry
                  hidden.
                </p>
              ) : (
                <p className="text-[10px] text-text-tertiary">
                  Link an income category to auto-track without manual updates.
                </p>
              )}
            </div>
          )}

          {/* Manual saved — only when no category linked */}
          {!linkedCategoryId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Already saved ({currencySymbol})
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={savedStr}
                onChange={(e) => setSavedStr(e.target.value)}
                placeholder="0"
                className="h-11 rounded-xl bg-surface-2 border-border
                           text-text-primary placeholder:text-text-tertiary
                           focus-visible:border-accent focus-visible:ring-accent/20"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Deadline (optional)
            </Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            size="lg"
            onClick={handleSave}
            disabled={loading}
            className="w-full rounded-2xl font-semibold"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
