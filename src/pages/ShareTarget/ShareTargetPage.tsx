import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { db } from '@/db/db'
import { extractTextFromImage, parseReceiptText } from '@/lib/ocr'
import { generateId, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

function parseSharedText(text: string): { amount: number | null; note: string } {
  const amountPatterns = [
    /₹\s*([\d,]+(?:\.\d{1,2})?)/,
    /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /INR\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|paid|debited)/i,
  ]
  let amount: number | null = null
  for (const pat of amountPatterns) {
    const m = text.match(pat)
    if (m?.[1]) {
      amount = parseFloat(m[1].replace(/,/g, ''))
      break
    }
  }
  const merchantPatterns = [
    /paid\s+to\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|$)/i,
    /to\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|$)/i,
    /at\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|\s+for\b|$)/i,
    /for\s+([A-Za-z0-9 &.'"-]+?)(?:\s+on\b|$)/i,
  ]
  let note = ''
  for (const pat of merchantPatterns) {
    const m = text.match(pat)
    if (m?.[1]) {
      note = m[1].trim()
      break
    }
  }
  return { amount, note }
}

export default function ShareTargetPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const isImageShare = searchParams.get('ready') === '1'
  const sharedText = searchParams.get('text') ?? searchParams.get('title') ?? ''

  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const objectUrlRef = useRef<string | null>(null)

  const categories = useLiveQuery(
    () =>
      activeGroupId
        ? db.categories.where((c) => c.groupId === activeGroupId && c.type === 'expense')
        : [],
    [activeGroupId],
  )

  const accounts = useLiveQuery(
    () => (activeGroupId ? db.accounts.where((a) => a.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount — URL params are stable for the lifetime of this page
  useEffect(() => {
    if (!isImageShare) {
      if (sharedText) {
        const parsed = parseSharedText(sharedText)
        setAmountStr(parsed.amount != null ? String(parsed.amount) : '')
        setNote(parsed.note)
      }
      return
    }

    ;(async () => {
      setOcrStatus('loading')
      try {
        const cache = await caches.open('shillak-share-v1')
        const response = await cache.match('/pending-share')
        if (!response) {
          setOcrStatus('error')
          setError('No image found — try sharing again.')
          return
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setPreviewUrl(url)
        await cache.delete('/pending-share')
        const text = await extractTextFromImage(blob, setOcrProgress)
        const parsed = parseReceiptText(text)
        setAmountStr(parsed.amount != null ? String(parsed.amount) : '')
        setNote(parsed.note)
        setOcrStatus('done')
      } catch (e) {
        setOcrStatus('error')
        setError(`OCR failed: ${String(e)}`)
      }
    })()

    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

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
      const today = new Date()
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
        date: Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
        attachmentIds: [],
        recurrenceId: null,
        accountId: selectedAccountId,
        paidBy: currentUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      })
      navigate('/')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const currencySymbol = group?.currency === 'INR' ? '₹' : (group?.currency ?? '₹')

  return (
    <div className="px-5 pt-6 pb-24 flex flex-col gap-4 max-w-[430px] mx-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Add from receipt</h1>
        {isImageShare && (
          <p className="text-xs text-text-tertiary mt-0.5">
            {ocrStatus === 'loading'
              ? 'Reading receipt…'
              : ocrStatus === 'done'
                ? 'Receipt scanned — review and confirm.'
                : 'Share a receipt screenshot to pre-fill.'}
          </p>
        )}
        {!isImageShare && sharedText && (
          <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{sharedText}</p>
        )}
        {!isImageShare && !sharedText && (
          <p className="text-xs text-text-tertiary mt-0.5">No shared content received.</p>
        )}
      </div>

      {/* OCR loading state */}
      {ocrStatus === 'loading' && (
        <div className="rounded-xl bg-surface-2 border border-border p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="text-accent animate-spin" />
            <span className="text-xs text-text-secondary">Scanning receipt with OCR…</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${ocrProgress}%` }}
            />
          </div>
          <p className="text-[10px] text-text-tertiary">
            First use downloads ~4 MB OCR engine (cached for offline use after)
          </p>
        </div>
      )}

      {/* Receipt preview */}
      {previewUrl && (
        <div className="rounded-xl overflow-hidden border border-border max-h-40">
          <img
            src={previewUrl}
            alt="Receipt"
            className="w-full h-full object-contain bg-surface-2"
          />
        </div>
      )}

      {/* Amount */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-text-secondary z-10">
          {currencySymbol}
        </span>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.00"
          className="h-16 rounded-2xl pl-10 pr-4 bg-surface-2
                     text-3xl font-mono font-bold text-text-primary
                     placeholder:text-text-tertiary border-border
                     focus-visible:border-accent focus-visible:ring-accent/20"
        />
      </div>

      {/* Note */}
      <Input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Merchant / note"
        className="h-11 rounded-xl bg-surface-2 border-border text-sm
                   text-text-primary placeholder:text-text-tertiary
                   focus-visible:border-accent focus-visible:ring-accent/20"
      />

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

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => navigate('/')} className="flex-1 rounded-2xl">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || ocrStatus === 'loading'}
          className="flex-[2] rounded-2xl font-semibold bg-accent text-black hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Add expense'}
        </Button>
      </div>
    </div>
  )
}
