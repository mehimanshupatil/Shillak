import { PaperclipIcon, XIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { DatePicker } from '@/components/ui/date-picker'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { db } from '@/db/db'
import type { Transaction } from '@/db/schema'
import { checkStorageQuota, fileToBase64, isAttachmentTooLarge } from '@/lib/attachments'
import {
  draftFromTransaction,
  draftReducer,
  emptyDraft,
  toTransactionDraft,
} from '@/lib/ledger/draft'
import { ledgerFailureMessage } from '@/lib/ledger/messages'
import { amendTransaction } from '@/lib/ledger/write'
import useAppStore from '@/stores/app.store'

interface Props {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  currency: string
}

type PendingAttachment = { mimeType: string; data: string; sizeBytes: number }

export default function TransactionEditSheet({ open, onClose, transaction, currency }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [draft, dispatch] = useReducer(draftReducer, undefined, emptyDraft)
  // Read-only aliases: the rules live in the reducer, the markup below just reads.
  const { amount: amountStr, note, dateStr, tags, tagInput } = draft
  const selectedCatId = draft.categoryId
  const selectedAccountId = draft.accountId
  const toAccountId = draft.toAccountId
  const paidBy = draft.paidBy
  const newAttachments = draft.attachments.add

  const [attachmentWarn, setAttachmentWarn] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const categories = useLiveQuery(
    () =>
      activeGroupId && transaction && transaction.type !== 'transfer'
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
      dispatch({ kind: 'seed', value: draftFromTransaction(transaction) })
      setAttachmentWarn('')
      setError('')
    }
  }, [open, transaction])

  function addTag() {
    dispatch({ kind: 'commit-tag' })
  }

  async function handleAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    setAttachmentWarn('')
    for (const file of files) {
      if (isAttachmentTooLarge(file.size)) {
        setError('Attachment too large (max 5 MB each)')
        return
      }
    }

    const { blocked, warn } = await checkStorageQuota()
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
    dispatch({ kind: 'add-attachments', value: newAtts })
  }

  async function handleSave() {
    if (!transaction || !currentUserId) return
    setLoading(true)
    setError('')

    try {
      const result = await amendTransaction({
        userId: currentUserId,
        txnId: transaction.txnId,
        draft: toTransactionDraft(draft, categories ?? []),
      })

      if (!result.ok) {
        setError(ledgerFailureMessage(result.failure))
        return
      }

      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const currencySymbol = currency === 'INR' ? '₹' : currency

  const visibleExisting = (existingAttachments ?? []).filter((a) =>
    draft.attachments.keep.includes(a.attachmentId),
  )

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto">
          <DrawerHeader className="p-0 flex-row items-center justify-between">
            <DrawerTitle className="text-base font-semibold text-text-primary">
              Edit transaction
            </DrawerTitle>
            {transaction && (
              <Badge
                variant={
                  transaction.type === 'income'
                    ? 'success'
                    : transaction.type === 'transfer'
                      ? 'accent'
                      : 'danger'
                }
              >
                {transaction.type}
              </Badge>
            )}
          </DrawerHeader>

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
              onChange={(e) => dispatch({ kind: 'set-amount', value: e.target.value })}
              placeholder="0.00"
              className="h-16 rounded-2xl pl-10 pr-4 bg-surface-2
                         text-3xl font-mono font-bold text-text-primary
                         placeholder:text-text-tertiary
                         border-border focus-visible:border-accent
                         focus-visible:ring-accent/20"
            />
          </div>

          {/* Category — hidden for transfers */}
          {transaction?.type !== 'transfer' && (
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
                      onClick={() => dispatch({ kind: 'set-category', value: cat.categoryId })}
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
          )}

          {/* Note */}
          <Input
            type="text"
            value={note}
            onChange={(e) => dispatch({ kind: 'set-note', value: e.target.value })}
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
                  <Badge key={tag} className="text-xs py-0.5">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => dispatch({ kind: 'remove-tag', tag })}
                      aria-label={`Remove ${tag}`}
                    >
                      <XIcon size={9} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => dispatch({ kind: 'set-tag-input', value: e.target.value })}
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
                      onClick={() => dispatch({ kind: 'drop-attachment', id: att.attachmentId })}
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
                      onClick={() => dispatch({ kind: 'drop-new-attachment', index: i })}
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

          {/* Paid by — only for expense/income with multiple members */}
          {transaction?.type !== 'transfer' && (members ?? []).length > 1 && (
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
                      onClick={() => dispatch({ kind: 'set-paid-by', value: m.userId })}
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

          {/* Account — From/To for transfers */}
          {(accounts ?? []).length > 0 &&
            (transaction?.type === 'transfer' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                    From account
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
                            onClick={() =>
                              dispatch({
                                kind: 'set-account',
                                value: active ? null : acc.accountId,
                              })
                            }
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? 'text-black' : 'bg-surface-2 text-text-secondary'}`}
                            style={active ? { backgroundColor: acc.color } : {}}
                          >
                            {acc.name}
                          </button>
                        )
                      })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                    To account
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {(accounts ?? [])
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .filter((acc) => acc.accountId !== selectedAccountId)
                      .map((acc) => {
                        const active = toAccountId === acc.accountId
                        return (
                          <button
                            key={acc.accountId}
                            type="button"
                            onClick={() =>
                              dispatch({
                                kind: 'set-to-account',
                                value: active ? null : acc.accountId,
                              })
                            }
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? 'text-black' : 'bg-surface-2 text-text-secondary'}`}
                            style={active ? { backgroundColor: acc.color } : {}}
                          >
                            {acc.name}
                          </button>
                        )
                      })}
                  </div>
                </div>
              </div>
            ) : (
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
                          onClick={() =>
                            dispatch({ kind: 'set-account', value: active ? null : acc.accountId })
                          }
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
            ))}

          {/* Date */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
              Date
            </p>
            <DatePicker
              value={dateStr}
              onChange={(value) => dispatch({ kind: 'set-date', value })}
              className="w-full h-11"
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
      </DrawerContent>

      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={handleAttachmentPick}
        className="hidden"
      />
    </Drawer>
  )
}
