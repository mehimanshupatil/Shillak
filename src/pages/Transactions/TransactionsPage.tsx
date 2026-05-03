import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import TransactionEditSheet from '@/components/transaction/TransactionEditSheet'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Input } from '@/components/ui/input'
import { db } from '@/db/db'
import type { Transaction } from '@/db/schema'
import { formatCurrency, relativeDate } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

type TypeFilter = 'all' | 'expense' | 'income'

const SWIPE_THRESHOLD = 72 // px

export default function TransactionsPage() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editTxn, setEditTxn] = useState<Transaction | null>(null)
  const [editSheetOpen, setEditSheetOpen] = useState(false)

  const transactions = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where((t) => t.groupId === activeGroupId && t.deletedAt === null)
        : [],
    [activeGroupId],
  )

  const categories = useLiveQuery(
    () => (activeGroupId ? db.categories.where((c) => c.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const members = useLiveQuery(
    () =>
      activeGroupId
        ? db.members.where((m) => m.groupId === activeGroupId && m.status === 'active')
        : [],
    [activeGroupId],
  )

  const users = useLiveQuery(() => db.users.toArray(), [])

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const catMap = useMemo(() => {
    const m: Record<string, { name: string; color: string; icon: string }> = {}
    for (const c of categories ?? [])
      m[c.categoryId] = { name: c.name, color: c.color, icon: c.icon }
    return m
  }, [categories])

  const userMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of users ?? []) m[u.userId] = u.displayName
    return m
  }, [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null
    const toMs = dateTo ? new Date(dateTo).getTime() + 86_400_000 - 1 : null

    return (transactions ?? [])
      .filter((t) => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false
        if (categoryFilter && t.categoryId !== categoryFilter) return false
        if (memberFilter && t.ownerId !== memberFilter) return false
        if (fromMs !== null && t.date < fromMs) return false
        if (toMs !== null && t.date > toMs) return false
        if (q) {
          const cat = catMap[t.categoryId]
          if (!t.note.toLowerCase().includes(q) && !(cat?.name.toLowerCase().includes(q) ?? false))
            return false
        }
        return true
      })
      .sort((a, b) => b.date - a.date)
  }, [transactions, search, typeFilter, categoryFilter, memberFilter, dateFrom, dateTo, catMap])

  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    for (const txn of filtered) {
      const label = relativeDate(txn.date)
      if (!groups[label]) groups[label] = []
      groups[label]?.push(txn)
    }
    return Object.entries(groups)
  }, [filtered])

  const currency = group?.currency ?? 'INR'

  const hasActiveFilters =
    !!categoryFilter || !!memberFilter || !!dateFrom || !!dateTo || typeFilter !== 'all'

  function clearFilters() {
    setCategoryFilter('')
    setMemberFilter('')
    setDateFrom('')
    setDateTo('')
    setTypeFilter('all')
  }

  async function handleSoftDelete(txnId: string) {
    await db.transactions.update(txnId, { deletedAt: Date.now(), updatedAt: Date.now() })
  }

  function openEdit(txn: Transaction) {
    setEditTxn(txn)
    setEditSheetOpen(true)
  }

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-text-primary">Transactions</h1>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              hasActiveFilters ? 'bg-accent text-black' : 'bg-surface text-text-secondary'
            }`}
          >
            <SlidersHorizontal size={12} />
            Filter
            {hasActiveFilters && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px]">
                {[categoryFilter, memberFilter, dateFrom || dateTo].filter(Boolean).length +
                  (typeFilter !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary z-10"
          />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions…"
            className="h-10 pl-9 pr-4 rounded-xl bg-surface
                       border-border text-sm
                       text-text-primary placeholder:text-text-tertiary
                       focus-visible:border-accent focus-visible:ring-accent/20"
          />
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2 mt-3">
          {(['all', 'expense', 'income'] as TypeFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                typeFilter === f
                  ? f === 'income'
                    ? 'bg-income text-black'
                    : f === 'expense'
                      ? 'bg-expense text-white'
                      : 'bg-accent text-black'
                  : 'bg-surface text-text-secondary'
              }`}
            >
              {f}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-danger bg-danger/10"
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="mt-3 p-3 rounded-xl bg-surface border border-border flex flex-col gap-3">
            {/* Category */}
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                Category
              </p>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border
                           text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">All categories</option>
                {(categories ?? [])
                  .filter((c) => typeFilter === 'all' || c.type === typeFilter)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Member */}
            {(members ?? []).length > 1 && (
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                  Person
                </p>
                <select
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border
                             text-sm text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="">All members</option>
                  {(members ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {userMap[m.userId] ?? m.userId}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date range */}
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">From</p>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border
                             text-sm text-text-primary focus:outline-none focus:border-accent
                             scheme-dark"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">To</p>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border
                             text-sm text-text-primary focus:outline-none focus:border-accent
                             scheme-dark"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-text-tertiary px-4 mb-2">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* List */}
      {grouped.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center py-16">
          {search || hasActiveFilters ? 'No matching transactions.' : 'No transactions yet.'}
        </p>
      ) : (
        <div className="flex flex-col px-4 gap-4">
          {grouped.map(([label, txns]) => (
            <div key={label}>
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                {label}
              </p>
              <div className="flex flex-col gap-1.5">
                {txns.map((txn) => {
                  const cat = catMap[txn.categoryId]
                  return (
                    <SwipeCard
                      key={txn.txnId}
                      onSwipeLeft={() => handleSoftDelete(txn.txnId)}
                      onSwipeRight={() => openEdit(txn)}
                    >
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                        <CategoryIcon
                          icon={cat?.icon ?? 'CircleDot'}
                          color={cat?.color ?? '#888'}
                          size={16}
                          containerSize={36}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {cat?.name ?? 'Unknown'}
                          </p>
                          {txn.note && (
                            <p className="text-xs text-text-tertiary truncate">{txn.note}</p>
                          )}
                        </div>
                        <span
                          className={`text-sm font-mono font-semibold shrink-0 ${
                            txn.type === 'income' ? 'text-income' : 'text-text-primary'
                          }`}
                        >
                          {txn.type === 'income' ? '+' : '-'}
                          {formatCurrency(txn.amount, currency)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(txn)}
                          className="text-text-tertiary hover:text-text-primary shrink-0"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleSoftDelete(txn.txnId)}
                          className="text-text-tertiary hover:text-danger hover:bg-danger/10 shrink-0"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </SwipeCard>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickAddFAB />

      <TransactionEditSheet
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        transaction={editTxn}
        currency={currency}
      />
    </div>
  )
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
// Swipe left → delete (red), swipe right → edit (amber). Threshold = SWIPE_THRESHOLD px.

function SwipeCard({
  children,
  onSwipeLeft,
  onSwipeRight,
}: {
  children: React.ReactNode
  onSwipeLeft: () => void
  onSwipeRight: () => void
}) {
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  const committed = useRef(false)

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    committed.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return
    const delta = e.clientX - startX.current
    setDx(Math.max(-120, Math.min(120, delta)))
  }

  function onPointerUp() {
    if (!committed.current) {
      if (dx < -SWIPE_THRESHOLD) {
        committed.current = true
        onSwipeLeft()
      } else if (dx > SWIPE_THRESHOLD) {
        committed.current = true
        onSwipeRight()
      }
    }
    setDx(0)
    startX.current = null
  }

  const showDelete = dx < -24
  const showEdit = dx > 24

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete hint (left swipe reveals right side) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end px-4 rounded-xl bg-danger/15"
        style={{ width: Math.abs(Math.min(dx, 0)) || (showDelete ? 1 : 0) }}
      >
        <Trash2 size={16} className="text-danger" />
      </div>

      {/* Edit hint (right swipe reveals left side) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-start px-4 rounded-xl bg-accent/15"
        style={{ width: Math.max(dx, 0) || (showEdit ? 1 : 0) }}
      >
        <Pencil size={16} className="text-accent" />
      </div>

      {/* Card content */}
      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform 0.2s' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  )
}
