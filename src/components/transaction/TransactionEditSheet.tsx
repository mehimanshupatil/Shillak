import { PaperclipIcon, XIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { Transaction } from '@/db/schema'
import { generateId, parseDateStr, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'
import { incrementVectorClock } from '@/sync/vector-clock'

interface Props {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  currency: string
}

type PendingAttachment = { mimeType: string; data: string; sizeBytes: number }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function checkQuota(): Promise<{ blocked: boolean; warn: boolean }> {
  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (!quota || quota === 0) return { blocked: false, warn: false }
    const pct = (usage ?? 0) / quota
    return { blocked: pct >= 0.9, warn: pct >= 0.8 }
  } catch {
    return { blocked: false, warn: false }
  }
}

export default function TransactionEditSheet({ open, onClose, transaction, currency }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [toDelete, setToDelete] = useState<string[]>([])
  const [newAttachments, setNewAttachments] = useState<PendingAttachment[]>([])
  const [attachmentWarn, setAttachmentWarn] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const categories = useLiveQuery(
    () =>
      activeGroupId && transaction
        ? db.categories.where((c) => c.groupId === activeGroupId && c.type === transaction.type)
        : [],
    [activeGroupId, transaction?.type],
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

  const existingAttachments = useLiveQuery(
    () => (transaction ? db.attachments.where((a) => a.txnId === transaction.txnId) : []),
    [transaction?.txnId],
  )

  useEffect(() => {
    if (open && transaction) {
      setAmountStr((transaction.amount / 100).toFixed(2))
      setNote(transaction.note)
      setSelectedCatId(transaction.categoryId)
      setSelectedAccountId(transaction.accountId ?? null)
      setPaidBy(transaction.paidBy ?? null)
      setTags(transaction.tags ?? [])
      setTagInput('')
      setToDelete([])
      setNewAttachments([])
      setAttachmentWarn('')
      setError('')
      const d = new Date(transaction.date)
      setDateStr(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
      )
    }
  }, [open, transaction])

  function addTag() {
    const t = tagInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t])
    setTagInput('')
  }

  async function handleAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    setAttachmentWarn('')
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Attachment too large (max 5 MB each)')
        return
      }
    }

    const { blocked, warn } = await checkQuota()
    if (blocked) {
      setError('Storage above 90% — attachment uploads blocked.')
      return
    }
    if (warn) setAttachmentWarn('Storage above 80% — uploading anyway.')

    const newAtts: PendingAttachment[] = []
    for (const file of files) {
      const data = await fileToBase64(file)
      newAtts.push({ mimeType: file.type, data, sizeBytes: file.size })
    }
    setNewAttachments((prev) => [...prev, ...newAtts])
  }

  async function handleSave() {
    if (!transaction) return
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
      const date = parseDateStr(dateStr)

      // Delete removed attachments
      for (const id of toDelete) {
        await db.attachments.delete(id)
      }

      // Save new attachments
      const newIds: string[] = []
      for (const att of newAttachments) {
        const attachmentId = generateId()
        await db.attachments.put({
          attachmentId,
          groupId: transaction.groupId,
          txnId: transaction.txnId,
          mimeType: att.mimeType,
          data: att.data,
          sizeBytes: att.sizeBytes,
          createdAt: Date.now(),
        })
        newIds.push(attachmentId)
      }

      const remainingIds = (existingAttachments ?? [])
        .filter((a) => !toDelete.includes(a.attachmentId))
        .map((a) => a.attachmentId)

      const newSeq =
        activeGroupId && currentUserId
          ? await incrementVectorClock(activeGroupId, currentUserId)
          : undefined
      await db.transactions.update(transaction.txnId, {
        amount: toPaise(amount),
        categoryId: selectedCatId,
        note: note.trim(),
        date,
        accountId: selectedAccountId,
        paidBy: paidBy ?? currentUserId,
        tags,
        attachmentIds: [...remainingIds, ...newIds],
        updatedAt: Date.now(),
        ...(newSeq !== undefined && { authorSeq: newSeq }),
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const currencySymbol = currency === 'INR' ? '₹' : currency

  const visibleExisting = (existingAttachments ?? []).filter(
    (a) => !toDelete.includes(a.attachmentId),
  )

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
          <SheetHeader className="p-0 flex-row items-center justify-between">
            <SheetTitle className="text-base font-semibold text-text-primary">
              Edit transaction
            </SheetTitle>
            {transaction && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  transaction.type === 'income'
                    ? 'bg-income/20 text-income'
                    : 'bg-expense/20 text-expense'
                }`}
              >
                {transaction.type}
              </span>
            )}
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

          {/* Category */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
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

          {/* Tags */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
              Tags
            </p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2
                               text-xs text-text-secondary"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      aria-label={`Remove ${tag}`}
                    >
                      <XIcon size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag()
                }
              }}
              onBlur={addTag}
              placeholder="Add tag, press Enter"
              className="h-9 rounded-xl bg-surface-2 border-border text-sm
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Attachments
              </p>
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-accent"
              >
                <PaperclipIcon size={11} />
                Add
              </button>
            </div>
            {(visibleExisting.length > 0 || newAttachments.length > 0) && (
              <div className="flex gap-2 flex-wrap">
                {visibleExisting.map((att) => (
                  <div
                    key={att.attachmentId}
                    className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-2 border border-border"
                  >
                    {att.mimeType.startsWith('image/') ? (
                      <img
                        src={`data:${att.mimeType};base64,${att.data}`}
                        alt="attachment"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PaperclipIcon size={20} className="text-text-tertiary" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setToDelete((prev) => [...prev, att.attachmentId])}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60
                                 flex items-center justify-center"
                    >
                      <XIcon size={8} className="text-white" />
                    </button>
                  </div>
                ))}
                {newAttachments.map((att, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, index is stable
                    key={i}
                    className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-2 border border-border"
                  >
                    {att.mimeType.startsWith('image/') ? (
                      <img
                        src={`data:${att.mimeType};base64,${att.data}`}
                        alt="new attachment"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PaperclipIcon size={20} className="text-text-tertiary" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setNewAttachments((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60
                                 flex items-center justify-center"
                    >
                      <XIcon size={8} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachmentWarn && <p className="text-xs text-warning mt-1">{attachmentWarn}</p>}
          </div>

          {/* Paid by — only when multiple members */}
          {(members ?? []).length > 1 && (
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                Paid by
              </p>
              <div className="flex gap-2 flex-wrap">
                {(members ?? []).map((m) => {
                  const u = memberUsers?.[m.userId]
                  const displayName =
                    m.userId === currentUserId ? 'Me' : (u?.displayName ?? 'Member')
                  const active =
                    paidBy === m.userId || (paidBy === null && m.userId === currentUserId)
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

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className={`w-full h-12 rounded-2xl font-semibold disabled:opacity-50 ${
              transaction?.type === 'income'
                ? 'bg-income text-black hover:opacity-90'
                : 'bg-accent text-black hover:bg-accent-hover'
            }`}
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetContent>

      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={handleAttachmentPick}
        className="hidden"
      />
    </Sheet>
  )
}
