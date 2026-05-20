import { useEffect, useState } from 'react'
import { Avatar, IconPicker, SPACE_ICONS } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import type { Group } from '@/db/schema'
import { CURRENCIES, MONTHS } from '@/lib/constants'

interface Props {
  open: boolean
  onClose: () => void
  group: Group
}

export default function EditSpaceSheet({ open, onClose, group }: Props) {
  const [name, setName] = useState(group.name)
  const [avatarIcon, setAvatarIcon] = useState<string | undefined>(group.avatarIcon)
  const [currency, setCurrency] = useState(group.currency)
  const [fiscalMonth, setFiscalMonth] = useState(group.fiscalYearStart)
  const [totalsOnly, setTotalsOnly] = useState(group.visibility === 'totals_only')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(group.name)
      setAvatarIcon(group.avatarIcon)
      setCurrency(group.currency)
      setFiscalMonth(group.fiscalYearStart)
      setTotalsOnly(group.visibility === 'totals_only')
      setError('')
    }
  }, [open, group])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await db.groups.update(group.groupId, {
        name: name.trim(),
        avatarIcon,
        currency,
        fiscalYearStart: fiscalMonth,
        visibility: totalsOnly ? 'totals_only' : 'full',
        updatedAt: Date.now(),
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

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
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              Edit space
            </SheetTitle>
          </SheetHeader>

          {/* Avatar preview */}
          <div className="flex justify-center">
            <Avatar
              color={group.avatarColor}
              name={name || group.name}
              icon={avatarIcon}
              size={64}
              rounded="xl"
            />
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Space icon
            </Label>
            <IconPicker icons={SPACE_ICONS} selected={avatarIcon} onSelect={setAvatarIcon} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Space name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl bg-surface-2 border-border
                         text-text-primary placeholder:text-text-tertiary
                         focus-visible:border-accent focus-visible:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Currency
            </Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full h-11 rounded-xl px-4 bg-surface-2 border border-border
                         text-text-primary focus:outline-none focus:border-accent transition-colors text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Fiscal year starts in
            </Label>
            <select
              value={fiscalMonth}
              onChange={(e) => setFiscalMonth(Number(e.target.value))}
              className="w-full h-11 rounded-xl px-4 bg-surface-2 border border-border
                         text-text-primary focus:outline-none focus:border-accent transition-colors text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Visibility */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-text-primary">Totals-only mode</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                Members see household totals only, not each other's individual transactions
              </p>
            </div>
            <Switch
              checked={totalsOnly}
              onCheckedChange={setTotalsOnly}
              aria-label="Totals-only mode"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            size="lg"
            onClick={handleSave}
            disabled={loading}
            className="w-full rounded-2xl font-semibold"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
