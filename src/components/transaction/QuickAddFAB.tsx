import { useLiveQuery } from 'dexie-react-hooks'
import { Pin, Plus, RefreshCw, ScanLine } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import type { RecurrenceFrequency } from '@/db/schema'
import { extractTextFromImage, parseReceiptText } from '@/lib/ocr'
import { advanceDate, generateId, parseDateStr, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export default function QuickAddFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-accent
                   flex items-center justify-center shadow-lg z-30
                   active:scale-95 transition-transform"
        aria-label="Add transaction"
      >
        <Plus size={24} className="text-black" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                     border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-border" />
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

  const [txnType, setTxnType] = useState<'expense' | 'income'>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [repeat, setRepeat] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [interval, setInterval] = useState(1)
  const [isFixed, setIsFixed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categories = useLiveQuery(
    () =>
      activeGroupId
        ? db.categories.where((c) => c.groupId === activeGroupId && c.type === txnType)
        : [],
    [activeGroupId, txnType],
  )

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const accounts = useLiveQuery(
    () => (activeGroupId ? db.accounts.where((a) => a.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const members = useLiveQuery(
    () =>
      activeGroupId
        ? db.members.where((m) => m.groupId === activeGroupId && m.status === 'active')
        : [],
    [activeGroupId],
  )

  const memberUsers = useLiveQuery(async () => {
    if (!members?.length) return {}
    const userIds = members.map((m) => m.userId)
    const users = await db.users.bulkGet(userIds)
    return Object.fromEntries(
      users.filter((u): u is NonNullable<typeof u> => !!u).map((u) => [u.userId, u]),
    )
  }, [members])

  async function handleImageOCR(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setOcrLoading(true)
    setOcrProgress(0)
    try {
      const text = await extractTextFromImage(file, setOcrProgress)
      const parsed = parseReceiptText(text)
      if (parsed.amount != null) setAmountStr(String(parsed.amount))
      if (parsed.note) setNote(parsed.note)
    } catch {
      // silent — user can fill manually
    } finally {
      setOcrLoading(false)
      setOcrProgress(0)
    }
  }

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

      const txnDate = parseDateStr(dateStr)
      const txnId = generateId()

      let recurrenceId: string | null = null

      if (repeat) {
        recurrenceId = generateId()
        await db.recurrences.put({
          recurrenceId,
          groupId: activeGroupId,
          ownerId: currentUserId,
          template: {
            groupId: activeGroupId,
            ownerId: currentUserId,
            categoryId: selectedCatId,
            type: txnType,
            amount: toPaise(amount),
            currency: grp.currency,
            fxRate: null,
            originalAmount: null,
            note: note.trim(),
            tags: [],
            attachmentIds: [],
            accountId: selectedAccountId,
            paidBy: paidBy ?? currentUserId,
          },
          frequency,
          interval,
          nextDue: advanceDate(txnDate, frequency, interval),
          lastGeneratedAt: txnDate,
          endDate: null,
          active: true,
          isFixed: txnType === 'expense' ? isFixed : false,
          createdAt: Date.now(),
        })
      }

      await db.transactions.put({
        txnId,
        groupId: activeGroupId,
        ownerId: currentUserId,
        authorSeq: newSeq,
        categoryId: selectedCatId,
        type: txnType,
        amount: toPaise(amount),
        currency: grp.currency,
        fxRate: null,
        originalAmount: null,
        note: note.trim(),
        tags: [],
        date: txnDate,
        attachmentIds: [],
        recurrenceId,
        accountId: selectedAccountId,
        paidBy: paidBy ?? currentUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      })

      setSelectedAccountId(null)
      setPaidBy(null)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const currencySymbol = group?.currency === 'INR' ? '₹' : (group?.currency ?? '₹')

  return (
    <div className="px-5 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
      <SheetHeader className="p-0 flex-row items-center justify-between">
        <SheetTitle className="text-base font-semibold text-text-primary">
          Add transaction
        </SheetTitle>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={ocrLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2
                       text-text-secondary hover:text-text-primary hover:bg-surface-3
                       transition-colors disabled:opacity-40"
            title="Scan receipt"
          >
            {ocrLoading ? (
              <div className="w-3.5 h-3.5 border border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <ScanLine size={14} />
            )}
            <span className="text-xs">Scan</span>
          </button>
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTxnType(t)
                setSelectedCatId(null)
                setSelectedAccountId(null)
                setPaidBy(null)
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                txnType === t
                  ? t === 'income'
                    ? 'bg-income text-black'
                    : 'bg-expense text-white'
                  : 'bg-surface-2 text-text-secondary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </SheetHeader>

      {/* OCR progress */}
      {ocrLoading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-text-secondary">Reading receipt… {ocrProgress}%</span>
          </div>
          <div className="h-1 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${ocrProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Amount input */}
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

      {/* Category pills */}
      <div>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Category
        </p>
        {(categories ?? []).length === 0 ? (
          <p className="text-xs text-text-tertiary py-2">
            No categories yet — sync with the space admin first.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(categories ?? []).map((cat) => {
              const active = selectedCatId === cat.categoryId
              return (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => setSelectedCatId(cat.categoryId)}
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
        )}
      </div>

      {/* Note */}
      <Input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-11 rounded-xl bg-surface-2
                   border-border text-sm
                   text-text-primary placeholder:text-text-tertiary
                   focus-visible:border-accent focus-visible:ring-accent/20"
      />

      {/* Paid by — only when multiple members */}
      {(members ?? []).length > 1 && (
        <div>
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Paid by
          </p>
          <div className="flex gap-2 flex-wrap">
            {(members ?? []).map((m) => {
              const u = memberUsers?.[m.userId]
              const displayName = m.userId === currentUserId ? 'Me' : (u?.displayName ?? 'Member')
              const active = paidBy === m.userId || (paidBy === null && m.userId === currentUserId)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaidBy(m.userId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    active ? 'bg-accent text-black' : 'bg-surface-2 text-text-secondary'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: u?.avatarColor ?? '#888', color: '#fff' }}
                  >
                    {displayName[0]}
                  </div>
                  {displayName}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Account */}
      {(accounts ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Account (optional)
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(accounts ?? [])
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((acc) => {
                const active = selectedAccountId === acc.accountId
                return (
                  <button
                    key={acc.accountId}
                    type="button"
                    onClick={() => setSelectedAccountId(active ? null : acc.accountId)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      active ? 'text-black' : 'bg-surface-2 text-text-secondary'
                    }`}
                    style={active ? { backgroundColor: acc.color } : {}}
                  >
                    {acc.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Date */}
      <div>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Date
        </p>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border
                     text-sm text-text-primary focus:outline-none focus:border-accent
                     scheme-dark"
        />
      </div>

      {/* Repeat toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Repeat</span>
        </div>
        <Switch checked={repeat} onCheckedChange={setRepeat} aria-label="Repeat transaction" />
      </div>

      {/* Repeat options */}
      {repeat && (
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
                onClick={() => setInterval((i) => Math.max(1, i - 1))}
                className="w-7 h-7 rounded-lg bg-surface-3 text-text-primary text-sm font-bold"
              >
                −
              </button>
              <span className="text-sm font-mono font-medium text-text-primary w-4 text-center">
                {interval}
              </span>
              <button
                type="button"
                onClick={() => setInterval((i) => Math.min(99, i + 1))}
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

          {txnType === 'expense' && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Pin size={13} className={isFixed ? 'text-accent' : 'text-text-tertiary'} />
                <div>
                  <span className="text-xs font-medium text-text-primary">Fixed outflow</span>
                  <p className="text-[10px] text-text-tertiary">
                    EMI, SIP, rent — tracked separately
                  </p>
                </div>
              </div>
              <Switch
                checked={isFixed}
                onCheckedChange={setIsFixed}
                aria-label="Mark as fixed outflow"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger -mt-2">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className={`w-full h-14 rounded-2xl font-semibold disabled:opacity-50 ${
          txnType === 'income'
            ? 'bg-income text-black hover:opacity-90'
            : 'bg-accent text-black hover:bg-accent-hover'
        }`}
      >
        {loading ? 'Saving…' : repeat ? `Add & repeat` : `Add ${txnType}`}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageOCR}
        className="hidden"
      />
    </div>
  )
}
