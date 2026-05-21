import { ArrowLeftIcon, PencilIcon, PlusIcon, Trash } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountSheet, { ICON_MAP } from '@/components/account/AccountSheet'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { Account } from '@/db/schema'
import { formatCurrency, toBaseCurrency } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

export default function AccountsPage() {
  const navigate = useNavigate()
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | undefined>(undefined)

  const accounts = useLiveQuery(
    () => (activeGroupId ? db.accounts.where((a) => a.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const allTxns = useLiveQuery(
    () =>
      activeGroupId
        ? db.transactions.where((t) => t.groupId === activeGroupId && t.deletedAt === null)
        : [],
    [activeGroupId],
  )

  const currency = group?.currency ?? 'INR'
  const sorted = (accounts ?? []).sort((a, b) => a.sortOrder - b.sortOrder)

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    for (const acc of sorted) {
      let balance = acc.openingBalance ?? 0
      for (const t of allTxns ?? []) {
        if (t.accountId === acc.accountId) {
          if (t.type === 'income') balance += toBaseCurrency(t, currency)
          else if (t.type === 'expense') balance -= toBaseCurrency(t, currency)
          else if (t.type === 'transfer') balance -= toBaseCurrency(t, currency)
        }
        if (t.toAccountId === acc.accountId && t.type === 'transfer') {
          balance += toBaseCurrency(t, currency)
        }
      }
      balances[acc.accountId] = balance
    }
    return balances
  }, [sorted, allTxns, currency])

  async function handleDelete(acc: Account) {
    const txns = await db.transactions.where(
      (t) => t.groupId === activeGroupId && t.accountId === acc.accountId && t.deletedAt === null,
    )
    if (txns.length > 0) {
      alert(`Cannot delete — ${txns.length} transaction(s) use this account.`)
      return
    }
    await db.accounts.delete(acc.accountId)
  }

  return (
    <div className="px-4 pt-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center justify-center w-8 h-8 rounded-full
                     bg-surface-2 text-text-secondary active:bg-surface-3 transition-colors"
          aria-label="Back"
        >
          <ArrowLeftIcon size={16} />
        </button>
        <h1 className="text-xl font-bold text-text-primary flex-1">Accounts</h1>
        <Button
          variant="link"
          onClick={() => {
            setEditAccount(undefined)
            setSheetOpen(true)
          }}
        >
          <PlusIcon size={12} />
          Add
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        {sorted.map((acc) => {
          const IconComponent = ICON_MAP[acc.icon]
          return (
            <div
              key={acc.accountId}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${acc.color}22` }}
              >
                {IconComponent && <IconComponent size={16} style={{ color: acc.color }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">{acc.name}</p>
                <p className="text-[10px] text-text-tertiary capitalize">{acc.type}</p>
              </div>
              {accountBalances[acc.accountId] !== undefined && (
                <span
                  className={`text-sm font-mono font-medium shrink-0 ${
                    (accountBalances[acc.accountId] ?? 0) < 0 ? 'text-danger' : 'text-text-primary'
                  }`}
                >
                  {formatCurrency(accountBalances[acc.accountId] ?? 0, currency)}
                </span>
              )}
              {acc.isDefault && (
                <span className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded">
                  default
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setEditAccount(acc)
                  setSheetOpen(true)
                }}
                className="text-text-tertiary hover:text-text-primary"
              >
                <PencilIcon size={13} />
              </Button>
              {!acc.isDefault && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(acc)}
                  className="text-text-tertiary hover:text-danger hover:bg-danger/10"
                >
                  <Trash size={13} />
                </Button>
              )}
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-text-tertiary py-8 text-center">No accounts yet.</p>
        )}
      </div>

      {activeGroupId && (
        <AccountSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
            setEditAccount(undefined)
          }}
          groupId={activeGroupId}
          account={editAccount}
          nextSortOrder={(accounts ?? []).length}
        />
      )}
    </div>
  )
}
