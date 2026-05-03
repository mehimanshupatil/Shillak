import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db/db'
import { createDefaultCategories, pickGroupColor } from '@/db/seeds'
import { CURRENCIES, MONTHS } from '@/lib/constants'
import { generateId } from '@/lib/utils'

interface Props {
  userId: string
  onComplete: (groupId: string) => void
}

export default function CreateGroupScreen({ userId, onComplete }: Props) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [fiscalMonth, setFiscalMonth] = useState(4) // April
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [incomeTracking, setIncomeTracking] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Group name is required')
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
        createdBy: userId,
        currency,
        fiscalYearStart: fiscalMonth,
        splitEnabled,
        incomeTracking,
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
        <h2 className="text-2xl font-bold text-text-primary">New group</h2>
        <p className="text-sm text-text-secondary mt-1">Set up your shared budget.</p>
      </div>

      {/* Group name */}
      <div className="space-y-2">
        <Label
          htmlFor="group-name"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Group name
        </Label>
        <Input
          id="group-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Patil Family, Flat 4B, Goa Trip"
          className="h-12 rounded-xl bg-surface border-border
                     text-text-primary placeholder:text-text-tertiary
                     focus-visible:border-accent focus-visible:ring-accent/20"
        />
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <Label
          htmlFor="group-currency"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Currency
        </Label>
        <select
          id="group-currency"
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
          htmlFor="group-fiscal"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Fiscal year starts in
        </Label>
        <select
          id="group-fiscal"
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

      {/* Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Split bills</p>
            <p className="text-xs text-text-tertiary">Track who owes whom</p>
          </div>
          <Switch
            checked={splitEnabled}
            onCheckedChange={setSplitEnabled}
            aria-label="Enable split bills"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Income tracking</p>
            <p className="text-xs text-text-tertiary">Log income alongside expenses</p>
          </div>
          <Switch
            checked={incomeTracking}
            onCheckedChange={setIncomeTracking}
            aria-label="Enable income tracking"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="mt-auto">
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-accent text-black font-semibold
                     hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create group'}
        </Button>
      </div>
    </form>
  )
}
