import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { GroupMember } from '@/db/schema'
import { generateId, today, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  currency: string
  members: GroupMember[]
  users: Record<string, { displayName: string; avatarColor: string }>
}

export default function AddSplitSheet({ open, onClose, groupId, currency, members, users }: Props) {
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState<string>('')
  const [includedMembers, setIncludedMembers] = useState<Set<string>>(new Set())
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [equalSplit, setEqualSplit] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const categories = useLiveQuery(
    () =>
      groupId ? db.categories.where((c) => c.groupId === groupId && c.type === 'expense') : [],
    [groupId],
  )

  useEffect(() => {
    if (open) {
      setAmountStr('')
      setNote('')
      setSelectedCatId(null)
      setPaidBy(currentUserId ?? '')
      setIncludedMembers(new Set(members.map((m) => m.userId)))
      setCustomAmounts({})
      setEqualSplit(true)
      setError('')
    }
  }, [open, currentUserId, members])

  const totalPaise = useMemo(() => {
    const n = parseFloat(amountStr)
    return Number.isNaN(n) ? 0 : toPaise(n)
  }, [amountStr])

  const includedArr = useMemo(() => [...includedMembers], [includedMembers])

  function equalSharePaise(): number {
    if (includedArr.length === 0) return 0
    return Math.floor(totalPaise / includedArr.length)
  }

  function toggleMember(userId: string) {
    setIncludedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function memberName(userId: string): string {
    if (userId === currentUserId) return 'You'
    return users[userId]?.displayName ?? 'Member'
  }

  async function handleSave() {
    if (!currentUserId) return
    const amount = parseFloat(amountStr)
    if (!amountStr || Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!selectedCatId) {
      setError('Select a category')
      return
    }
    if (includedArr.length < 2) {
      setError('Include at least 2 members')
      return
    }

    setLoading(true)
    setError('')
    try {
      const grp = await db.groups.get(groupId)
      if (!grp) throw new Error('Group not found')
      const newSeq = (grp.vectorClock[currentUserId] ?? 0) + 1
      await db.groups.update(groupId, {
        vectorClock: { ...grp.vectorClock, [currentUserId]: newSeq },
        updatedAt: Date.now(),
      })

      const txnId = generateId()
      const splitId = generateId()
      const txnDate = today()

      const shares = includedArr
        .filter((uid) => uid !== paidBy)
        .map((uid) => {
          const shareAmount = equalSplit
            ? equalSharePaise()
            : toPaise(parseFloat(customAmounts[uid] ?? '0') || 0)
          return { userId: uid, amount: shareAmount, settled: false, settledAt: null }
        })

      await db.transactions.put({
        txnId,
        groupId,
        ownerId: currentUserId,
        authorSeq: newSeq,
        categoryId: selectedCatId,
        type: 'expense',
        amount: totalPaise,
        currency: grp.currency,
        fxRate: null,
        originalAmount: null,
        note: note.trim(),
        tags: [],
        date: txnDate,
        attachmentIds: [],
        splitId,
        recurrenceId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      })

      await db.splits.put({
        splitId,
        groupId,
        txnId,
        paidBy,
        total: totalPaise,
        currency: grp.currency,
        shares,
        note: note.trim(),
        createdAt: Date.now(),
      })

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
        <div className="px-5 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              Add shared expense
            </SheetTitle>
          </SheetHeader>

          {/* Amount */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-[var(--color-text-secondary)] z-10">
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
              className="h-16 rounded-2xl pl-10 pr-4 bg-[var(--color-surface-2)]
                         text-3xl font-mono font-bold text-[var(--color-text-primary)]
                         placeholder:text-[var(--color-text-tertiary)]
                         border-[var(--color-border)] focus-visible:border-[var(--color-accent)]
                         focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          {/* Category */}
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
            placeholder="What's this for? (optional)"
            className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-sm
                       text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                       focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
          />

          {/* Paid by */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
              Paid by
            </p>
            <div className="flex gap-2 flex-wrap">
              {members.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setPaidBy(m.userId)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    paidBy === m.userId
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {memberName(m.userId)}
                </button>
              ))}
            </div>
          </div>

          {/* Split between */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Split between
              </p>
              <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setEqualSplit(true)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    equalSplit
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  Equal
                </button>
                <button
                  type="button"
                  onClick={() => setEqualSplit(false)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    !equalSplit
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {members.map((m) => {
                const included = includedMembers.has(m.userId)
                const share = equalSplit && included ? equalSharePaise() : null
                return (
                  <div
                    key={m.userId}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--color-surface-2)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMember(m.userId)}
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                        included
                          ? 'bg-[var(--color-accent)]'
                          : 'bg-[var(--color-surface-3)] border border-[var(--color-border)]'
                      }`}
                    >
                      {included && <Check size={11} className="text-black" />}
                    </button>
                    <span className="flex-1 text-sm text-[var(--color-text-primary)]">
                      {memberName(m.userId)}
                      {m.userId === paidBy && (
                        <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
                          (paid)
                        </span>
                      )}
                    </span>
                    {included && !equalSplit && m.userId !== paidBy ? (
                      <div className="relative w-24">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-tertiary)]">
                          {currencySymbol}
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={customAmounts[m.userId] ?? ''}
                          onChange={(e) =>
                            setCustomAmounts((prev) => ({ ...prev, [m.userId]: e.target.value }))
                          }
                          placeholder="0"
                          className="h-8 pl-6 pr-2 text-xs rounded-lg bg-[var(--color-surface)] border-[var(--color-border)]
                                     text-[var(--color-text-primary)] focus-visible:border-[var(--color-accent)]"
                        />
                      </div>
                    ) : (
                      included &&
                      share !== null && (
                        <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                          {currencySymbol}
                          {(share / 100).toFixed(2)}
                        </span>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)] -mt-2">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-14 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                       hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Add shared expense'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
