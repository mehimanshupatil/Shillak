import { useState } from 'react'
import { Avatar, IconPicker, SPACE_ICONS } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/db/db'
import { createDefaultAccounts, createDefaultCategories, pickGroupColor } from '@/db/seeds'
import { CURRENCIES, MONTHS } from '@/lib/constants'
import { generateId } from '@/lib/utils'

interface Props {
  userId: string
  onComplete: (groupId: string) => void
}

export default function CreateSpaceScreen({ userId, onComplete }: Props) {
  const [name, setName] = useState('')
  const [avatarIcon, setAvatarIcon] = useState<string | undefined>(undefined)
  const [currency, setCurrency] = useState('INR')
  const [fiscalMonth, setFiscalMonth] = useState(4) // April
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Space name is required')
      return
    }
    setLoading(true)
    setError('')

    try {
      const groupId = generateId()
      const secretBytes = crypto.getRandomValues(new Uint8Array(32))
      const groupSecret = btoa(String.fromCharCode(...secretBytes))
      const now = Date.now()

      const existingGroups = await db.groups.toArray()
      const avatarColor = pickGroupColor(existingGroups.length)

      await db.groups.put({
        groupId,
        name: name.trim(),
        avatarColor,
        avatarIcon,
        createdBy: userId,
        currency,
        fiscalYearStart: fiscalMonth,
        visibility: 'full',
        status: 'active',
        groupSecret,
        vectorClock: { [userId]: 0 },
        createdAt: now,
        updatedAt: now,
      })

      await db.members.put({
        id: generateId(),
        groupId,
        userId,
        role: 'admin',
        status: 'active',
        joinedAt: now,
        leftAt: null,
        nickname: null,
        monthlyIncome: null,
        incomeCurrency: null,
        updatedAt: now,
      })

      const categories = createDefaultCategories(groupId, userId)
      await db.categories.bulkPut(categories)

      const accounts = createDefaultAccounts(groupId)
      await db.accounts.bulkPut(accounts)

      onComplete(groupId)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full px-6 py-8 gap-6 overflow-y-auto">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">New space</h2>
        <p className="text-sm text-text-secondary mt-1">Set up your shared budget.</p>
      </div>

      {/* Avatar preview */}
      <div className="flex justify-center">
        <Avatar
          color={pickGroupColor(0)}
          name={name || 'S'}
          icon={avatarIcon}
          size={72}
          rounded="xl"
        />
      </div>

      {/* Space icon */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Space icon
        </p>
        <IconPicker icons={SPACE_ICONS} selected={avatarIcon} onSelect={setAvatarIcon} />
      </div>

      {/* Space name */}
      <div className="space-y-2">
        <Label
          htmlFor="space-name"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Space name
        </Label>
        <Input
          id="space-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Patil Household, Joint Budget, Family Expenses"
          className="h-12 rounded-xl bg-surface border-border
                     text-text-primary placeholder:text-text-tertiary
                     focus-visible:border-accent focus-visible:ring-accent/20"
        />
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <Label
          htmlFor="space-currency"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Currency
        </Label>
        <select
          id="space-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full h-12 rounded-xl px-4 bg-surface border border-border
                     text-text-primary focus:outline-none focus:border-accent transition-colors"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Fiscal year start */}
      <div className="space-y-2">
        <Label
          htmlFor="space-fiscal"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Fiscal year starts in
        </Label>
        <select
          id="space-fiscal"
          value={fiscalMonth}
          onChange={(e) => setFiscalMonth(Number(e.target.value))}
          className="w-full h-12 rounded-xl px-4 bg-surface border border-border
                     text-text-primary focus:outline-none focus:border-accent transition-colors"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="mt-auto">
        <Button
          type="submit"
          size="xl"
          disabled={loading}
          className="w-full rounded-2xl font-semibold"
        >
          {loading ? 'Creating…' : 'Create space'}
        </Button>
      </div>
    </form>
  )
}
