import type { IconProps } from '@phosphor-icons/react'
import {
  BankIcon,
  BuildingsIcon,
  CreditCardIcon,
  DeviceMobileIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { Account, AccountType } from '@/db/schema'
import { generateId } from '@/lib/utils'

export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
  { value: 'savings', label: 'Savings' },
  { value: 'current', label: 'Current' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI / WalletIcon' },
]

const TYPE_COLORS: Record<AccountType, string> = {
  savings: '#3b82f6',
  current: '#06b6d4',
  credit: '#ef4444',
  cash: '#22c55e',
  upi: '#8b5cf6',
}

type PhosphorIcon = React.ForwardRefExoticComponent<
  Omit<IconProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

const TYPE_ICONS: Record<AccountType, string> = {
  savings: 'BuildingsIcon',
  current: 'BankIcon',
  credit: 'CreditCardIcon',
  cash: 'WalletIcon',
  upi: 'DeviceMobileIcon',
}

export const ICON_MAP: Record<string, PhosphorIcon> = {
  BuildingsIcon,
  BankIcon,
  CreditCardIcon,
  WalletIcon,
  DeviceMobileIcon,
}

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  account?: Account
  nextSortOrder: number
}

export default function AccountSheet({ open, onClose, groupId, account, nextSortOrder }: Props) {
  const isEdit = !!account
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('savings')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(account?.name ?? '')
      setType(account?.type ?? 'savings')
      setError('')
    }
  }, [open, account])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const now = Date.now()
      if (isEdit && account) {
        await db.accounts.update(account.accountId, {
          name: name.trim(),
          type,
          color: TYPE_COLORS[type],
          icon: TYPE_ICONS[type],
          updatedAt: now,
        })
      } else {
        await db.accounts.put({
          accountId: generateId(),
          groupId,
          name: name.trim(),
          type,
          color: TYPE_COLORS[type],
          icon: TYPE_ICONS[type],
          sortOrder: nextSortOrder,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const IconComponent = ICON_MAP[TYPE_ICONS[type]]

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
        <div className="px-5 pb-6 flex flex-col gap-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              {isEdit ? 'Edit account' : 'New account'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Account name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Savings, ICICI Credit"
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Account type
            </Label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_TYPE_OPTIONS.map((opt) => {
                const active = type === opt.value
                const Icon = ICON_MAP[TYPE_ICONS[opt.value]]
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      active ? 'text-black' : 'bg-surface-2 text-text-secondary'
                    }`}
                    style={active ? { backgroundColor: TYPE_COLORS[opt.value] } : {}}
                  >
                    {Icon && <Icon size={11} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border border-border"
            style={{ backgroundColor: `${TYPE_COLORS[type]}11` }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${TYPE_COLORS[type]}33` }}
            >
              {IconComponent && <IconComponent size={18} style={{ color: TYPE_COLORS[type] }} />}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{name || 'Account name'}</p>
              <p className="text-[10px] text-text-tertiary capitalize">
                {ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)?.label}
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            size="lg"
            onClick={handleSave}
            disabled={loading}
            className="w-full rounded-2xl font-semibold"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
