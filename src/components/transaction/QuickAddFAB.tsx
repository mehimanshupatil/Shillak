import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { db } from '@/db/db'
import { generateId, today, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

export default function QuickAddFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-[var(--color-accent)]
                   flex items-center justify-center shadow-lg z-30
                   active:scale-95 transition-transform"
        aria-label="Add transaction"
      >
        <Plus size={24} className="text-black" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false}
          className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-[var(--color-surface)]
                     border-0 border-t border-[var(--color-border)] safe-bottom px-0 pb-0"
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
          </div>
          <QuickAddForm onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function QuickAddForm({ onClose }: { onClose: () => void }) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const categories = useLiveQuery(
    () =>
      activeGroupId
        ? db.categories.where((c) => c.groupId === activeGroupId && c.type === 'expense')
        : [],
    [activeGroupId],
  )

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  async function handleSubmit() {
    if (!activeGroupId || !currentUserId) return
    const amount = parseFloat(amountStr)
    if (!amountStr || Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!selectedCatId) {
      setError('Select a category')
      return
    }
    setLoading(true)
    setError('')

    try {
      const grp = await db.groups.get(activeGroupId)
      if (!grp) throw new Error('Group not found')
      const newSeq = (grp.vectorClock[currentUserId] ?? 0) + 1
      await db.groups.update(activeGroupId, {
        vectorClock: { ...grp.vectorClock, [currentUserId]: newSeq },
        updatedAt: Date.now(),
      })

      await db.transactions.put({
        txnId: generateId(),
        groupId: activeGroupId,
        ownerId: currentUserId,
        authorSeq: newSeq,
        categoryId: selectedCatId,
        type: 'expense',
        amount: toPaise(amount),
        currency: grp.currency,
        fxRate: null,
        originalAmount: null,
        note: note.trim(),
        tags: [],
        date: today(),
        attachmentIds: [],
        splitId: null,
        recurrenceId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      })

      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 pb-6 flex flex-col gap-5">
      <SheetHeader className="p-0">
        <SheetTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          Add expense
        </SheetTitle>
      </SheetHeader>

      {/* Amount input */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-[var(--color-text-secondary)] z-10">
          {group?.currency === 'INR' ? '₹' : (group?.currency ?? '₹')}
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
          className="h-16 rounded-2xl pl-10 pr-4 bg-[var(--color-surface-2)]
                     text-3xl font-mono font-bold text-[var(--color-text-primary)]
                     placeholder:text-[var(--color-text-tertiary)]
                     border-[var(--color-border)] focus-visible:border-[var(--color-accent)]
                     focus-visible:ring-[var(--color-accent)]/20"
        />
      </div>

      {/* Category pills */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
          Category
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(categories ?? []).map((cat) => {
            const active = selectedCatId === cat.categoryId
            return (
              <button
                key={cat.categoryId}
                type="button"
                onClick={() => setSelectedCatId(cat.categoryId)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'text-black'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
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

      {/* Note */}
      <Input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-11 rounded-xl bg-[var(--color-surface-2)]
                   border-[var(--color-border)] text-sm
                   text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                   focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
      />

      {error && <p className="text-sm text-[var(--color-danger)] -mt-2">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                   hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Add'}
      </Button>
    </div>
  )
}
