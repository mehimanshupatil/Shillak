import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import QuickAddFAB from '@/components/transaction/QuickAddFAB'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { db } from '@/db/db'
import type { Transaction } from '@/db/schema'
import { formatCurrency, relativeDate } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

export default function TransactionsPage() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const [search, setSearch] = useState('')

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

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const catMap = useMemo(() => {
    const m: Record<string, { name: string; color: string; icon: string }> = {}
    ;(categories ?? []).forEach((c) => {
      m[c.categoryId] = { name: c.name, color: c.color, icon: c.icon }
    })
    return m
  }, [categories])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (transactions ?? [])
      .filter((t) => {
        if (!q) return true
        const cat = catMap[t.categoryId]
        return t.note.toLowerCase().includes(q) || cat?.name.toLowerCase().includes(q) || false
      })
      .sort((a, b) => b.date - a.date)
  }, [transactions, search, catMap])

  // Group by relative date label
  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    for (const txn of filtered) {
      const label = relativeDate(txn.date)
      if (!groups[label]) groups[label] = []
      // biome-ignore lint/style/noNonNullAssertion: initialized on line above
      groups[label]!.push(txn)
    }
    return Object.entries(groups)
  }, [filtered])

  const currency = group?.currency ?? 'INR'

  async function handleSoftDelete(txnId: string) {
    await db.transactions.update(txnId, { deletedAt: Date.now(), updatedAt: Date.now() })
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Transactions</h1>

        {/* Search */}
        <div className="relative mt-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] z-10"
          />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions…"
            className="h-10 pl-9 pr-4 rounded-xl bg-[var(--color-surface)]
                       border-[var(--color-border)] text-sm
                       text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                       focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      {/* List */}
      {grouped.length === 0 ? (
        <p className="text-sm text-[var(--color-text-tertiary)] text-center py-16">
          {search ? 'No matching transactions.' : 'No transactions yet.'}
        </p>
      ) : (
        <div className="flex flex-col px-4 gap-4 pb-4">
          {grouped.map(([label, txns]) => (
            <div key={label}>
              <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
                {label}
              </p>
              <div className="flex flex-col gap-2">
                {txns.map((txn) => {
                  const cat = catMap[txn.categoryId]
                  return (
                    <div
                      key={txn.txnId}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)]
                                 active:bg-[var(--color-surface-2)] transition-colors"
                    >
                      <CategoryIcon
                        icon={cat?.icon ?? 'CircleDot'}
                        color={cat?.color ?? '#888'}
                        size={16}
                        containerSize={36}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {cat?.name ?? 'Unknown'}
                        </p>
                        {txn.note && (
                          <p className="text-xs text-[var(--color-text-tertiary)] truncate">
                            {txn.note}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                        <span
                          className={`text-sm font-mono font-semibold ${
                            txn.type === 'income'
                              ? 'text-[var(--color-income)]'
                              : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {txn.type === 'income' ? '+' : '-'}
                          {formatCurrency(txn.amount, currency)}
                        </span>
                        <Button
                          onClick={() => handleSoftDelete(txn.txnId)}
                          className="text-[10px] h-auto p-0 bg-transparent text-[var(--color-text-tertiary)]
                                     hover:text-[var(--color-danger)] hover:bg-transparent transition-colors"
                        >
                          delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickAddFAB />
    </div>
  )
}
