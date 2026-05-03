import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon, { ICON_OPTIONS } from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { Category, TransactionType } from '@/db/schema'
import { generateId } from '@/lib/utils'

const COLOR_OPTIONS = [
  '#22c55e',
  '#6366f1',
  '#3b82f6',
  '#ef4444',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#f97316',
  '#14b8a6',
  '#06b6d4',
  '#84cc16',
  '#eab308',
  '#64748b',
  '#f43f5e',
  '#888888',
]

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  userId: string
  category?: Category
  nextSortOrder: number
}

export default function CategorySheet({
  open,
  onClose,
  groupId,
  userId,
  category,
  nextSortOrder,
}: Props) {
  const isEdit = !!category
  const [name, setName] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [icon, setIcon] = useState('CircleDot')
  const [color, setColor] = useState('#888888')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setType(category?.type ?? 'expense')
      setIcon(category?.icon ?? 'CircleDot')
      setColor(category?.color ?? '#888888')
      setError('')
    }
  }, [open, category])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (isEdit && category) {
        await db.categories.update(category.categoryId, { name: name.trim(), type, icon, color })
      } else {
        await db.categories.put({
          categoryId: generateId(),
          groupId,
          name: name.trim(),
          icon,
          color,
          type,
          sortOrder: nextSortOrder,
          isDefault: false,
          createdBy: userId,
          createdAt: Date.now(),
        })
      }
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
              {isEdit ? 'Edit category' : 'New category'}
            </SheetTitle>
          </SheetHeader>

          {/* Type selector */}
          <div className="flex gap-2">
            {(['expense', 'income'] as TransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                  type === t
                    ? 'bg-[var(--color-accent)] text-black'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                         text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                         focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Colour
            </p>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.25)' : 'scale(1)',
                  }}
                >
                  {color === c && <Check size={12} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Icon
            </p>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center h-10 rounded-xl transition-colors ${
                    icon === ic
                      ? 'bg-[var(--color-accent-subtle)] ring-1 ring-[var(--color-accent)]'
                      : 'bg-[var(--color-surface-2)]'
                  }`}
                >
                  <CategoryIcon icon={ic} color={color} size={16} containerSize={0} />
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                       hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
