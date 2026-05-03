import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { Budget, Category } from '@/db/schema'
import { generateId, toPaise } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  currency: string
  categories: Category[]
  budget?: Budget
  initialCategoryId?: string
}

export default function BudgetSheet({
  open,
  onClose,
  groupId,
  currency,
  categories,
  budget,
  initialCategoryId,
}: Props) {
  const isEdit = !!budget
  const [categoryId, setCategoryId] = useState('')
  const [limitStr, setLimitStr] = useState('')
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setCategoryId(budget?.categoryId ?? initialCategoryId ?? '')
      setLimitStr(budget ? String(budget.limit / 100) : '')
      setPeriod(budget?.period ?? 'monthly')
      setError('')
    }
  }, [open, budget, initialCategoryId])

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  async function handleSave() {
    if (!categoryId) {
      setError('Select a category')
      return
    }
    const limit = parseFloat(limitStr)
    if (!limitStr || Number.isNaN(limit) || limit <= 0) {
      setError('Enter a valid limit')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (isEdit && budget) {
        await db.budgets.update(budget.budgetId, {
          categoryId,
          limit: toPaise(limit),
          period,
          updatedAt: Date.now(),
        })
      } else {
        // Upsert: if budget exists for this category+period, update it
        const existing = await db.budgets.where(
          (b) => b.groupId === groupId && b.categoryId === categoryId && b.period === period,
        )
        if (existing.length > 0 && existing[0]) {
          await db.budgets.update(existing[0].budgetId, {
            limit: toPaise(limit),
            updatedAt: Date.now(),
          })
        } else {
          await db.budgets.put({
            budgetId: generateId(),
            groupId,
            categoryId,
            limit: toPaise(limit),
            period,
            updatedAt: Date.now(),
          })
        }
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
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              {isEdit ? 'Edit budget' : 'Set budget'}
            </SheetTitle>
          </SheetHeader>

          {/* Period */}
          <div className="flex gap-2">
            {(['monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${
                  period === p ? 'bg-accent text-black' : 'bg-surface-2 text-text-secondary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Category picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Category
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {expenseCategories.map((cat) => {
                const active = categoryId === cat.categoryId
                return (
                  <button
                    key={cat.categoryId}
                    type="button"
                    onClick={() => setCategoryId(cat.categoryId)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      active ? 'text-black' : 'bg-surface-2 text-text-secondary'
                    }`}
                    style={active ? { backgroundColor: cat.color } : {}}
                  >
                    <CategoryIcon
                      icon={cat.icon}
                      color={active ? '#000' : cat.color}
                      size={12}
                      containerSize={0}
                    />
                    {cat.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Limit */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-mono text-text-secondary z-10">
              {currencySymbol}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              placeholder="0.00"
              className="h-14 rounded-2xl pl-9 pr-4 bg-surface-2
                         text-2xl font-mono font-bold text-text-primary
                         placeholder:text-text-tertiary
                         border-border focus-visible:border-accent
                         focus-visible:ring-accent/20"
            />
          </div>

          {error && <p className="text-sm text-danger -mt-2">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-accent text-black font-semibold
                       hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Set budget'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
