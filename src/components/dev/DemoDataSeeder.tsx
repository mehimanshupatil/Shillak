/**
 * Dev-only tool to seed a full month-by-month dataset (transactions, budgets,
 * savings goals) so every screen has realistic data for screenshots.
 * Only rendered when import.meta.env.DEV is true.
 */

import { FlaskIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import type { Budget, Category, SavingsGoal, Transaction } from '@/db/schema'
import { generateId, toPaise } from '@/lib/utils'
import useAppStore from '@/stores/app.store'
import { incrementVectorClock } from '@/sync/vector-clock'

const DEMO_TXN_PREFIX = 'demo-txn-'
const DEMO_BUDGET_PREFIX = 'demo-budget-'
const DEMO_GOAL_PREFIX = 'demo-goal-'

function monthStartsUTC(monthsBack: number): number[] {
  const now = new Date()
  const months: number[] = []
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(d.getTime())
  }
  return months
}

function dayInMonth(monthStart: number, day: number): number {
  const d = new Date(monthStart)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day)
}

function pick<T>(arr: T[]): T {
  // biome-ignore lint/style/noNonNullAssertion: arr always non-empty at call sites
  return arr[Math.floor(Math.random() * arr.length)]!
}

function amount(minRupees: number, maxRupees: number): number {
  return toPaise(Math.round(minRupees + Math.random() * (maxRupees - minRupees)))
}

export default function DemoDataSeeder() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  if (!activeGroupId || !currentUserId) return null

  async function seedAll() {
    if (!activeGroupId || !currentUserId) return
    setBusy(true)
    setStatus('Seeding demo data…')
    try {
      const categories = await db.categories.where((c) => c.groupId === activeGroupId)
      const accounts = await db.accounts.where((a) => a.groupId === activeGroupId)
      const byName = (name: string): Category | undefined => categories.find((c) => c.name === name)
      const accountIds = accounts.map((a) => a.accountId)

      const expenseMix: Array<{ name: string; min: number; max: number; perMonth: number }> = [
        { name: 'Groceries', min: 400, max: 2500, perMonth: 8 },
        { name: 'Dining', min: 150, max: 1200, perMonth: 6 },
        { name: 'Transport', min: 50, max: 500, perMonth: 5 },
        { name: 'Fuel', min: 1000, max: 3000, perMonth: 2 },
        { name: 'Utilities', min: 800, max: 3000, perMonth: 3 },
        { name: 'Rent', min: 18000, max: 18000, perMonth: 1 },
        { name: 'EMI', min: 12000, max: 12000, perMonth: 1 },
        { name: 'Entertainment', min: 200, max: 1500, perMonth: 3 },
        { name: 'Shopping', min: 500, max: 5000, perMonth: 2 },
        { name: 'Health', min: 300, max: 2000, perMonth: 1 },
        { name: 'Insurance', min: 2000, max: 2000, perMonth: 1 },
        { name: 'Personal Care', min: 300, max: 1200, perMonth: 2 },
        { name: 'Investment', min: 5000, max: 5000, perMonth: 1 },
      ]

      const notes: Record<string, string[]> = {
        Groceries: ['BigBasket order', 'Local market', 'DMart run', 'Milk & veggies'],
        Dining: ['Swiggy order', 'Zomato dinner', 'Coffee with friends', 'Weekend brunch'],
        Transport: ['Auto fare', 'Metro card recharge', 'Uber to airport'],
        Fuel: ['Petrol - HPCL', 'Bike fuel'],
        Utilities: ['Electricity bill', 'Broadband bill', 'Gas cylinder'],
        Rent: ['Monthly rent'],
        EMI: ['Car loan EMI'],
        Entertainment: ['Netflix', 'Movie tickets', 'Spotify'],
        Shopping: ['Amazon order', 'Clothes shopping', 'Home decor'],
        Health: ['Pharmacy', 'Doctor visit'],
        Insurance: ['Health insurance premium'],
        'Personal Care': ['Salon', 'Skincare'],
        Investment: ['SIP - Index Fund'],
      }

      const months = monthStartsUTC(3) // this month + 3 previous
      const txns: Transaction[] = []

      for (const monthStart of months) {
        for (const mix of expenseMix) {
          const cat = byName(mix.name)
          if (!cat) continue
          for (let i = 0; i < mix.perMonth; i++) {
            const day = 1 + Math.floor(Math.random() * 27)
            const seq = await incrementVectorClock(activeGroupId, currentUserId)
            txns.push({
              txnId: `${DEMO_TXN_PREFIX}${generateId()}`,
              groupId: activeGroupId,
              ownerId: currentUserId,
              authorSeq: seq,
              categoryId: cat.categoryId,
              type: 'expense',
              amount: amount(mix.min, mix.max),
              currency: 'INR',
              fxRate: null,
              originalAmount: null,
              note: pick(notes[mix.name] ?? [mix.name]),
              tags: [],
              date: dayInMonth(monthStart, day),
              attachmentIds: [],
              recurrenceId: null,
              accountId: accountIds.length > 0 ? pick(accountIds) : null,
              paidBy: currentUserId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              deletedAt: null,
            })
          }
        }

        // Income: salary every month, occasional freelance/investment
        const salary = byName('Salary')
        if (salary) {
          const seq = await incrementVectorClock(activeGroupId, currentUserId)
          txns.push({
            txnId: `${DEMO_TXN_PREFIX}${generateId()}`,
            groupId: activeGroupId,
            ownerId: currentUserId,
            authorSeq: seq,
            categoryId: salary.categoryId,
            type: 'income',
            amount: toPaise(85000),
            currency: 'INR',
            fxRate: null,
            originalAmount: null,
            note: 'Monthly salary',
            tags: [],
            date: dayInMonth(monthStart, 1),
            attachmentIds: [],
            recurrenceId: null,
            accountId: accountIds.length > 0 ? pick(accountIds) : null,
            paidBy: currentUserId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deletedAt: null,
          })
        }

        const freelance = byName('Freelance')
        if (freelance && Math.random() > 0.4) {
          const seq = await incrementVectorClock(activeGroupId, currentUserId)
          txns.push({
            txnId: `${DEMO_TXN_PREFIX}${generateId()}`,
            groupId: activeGroupId,
            ownerId: currentUserId,
            authorSeq: seq,
            categoryId: freelance.categoryId,
            type: 'income',
            amount: amount(5000, 20000),
            currency: 'INR',
            fxRate: null,
            originalAmount: null,
            note: 'Freelance project',
            tags: [],
            date: dayInMonth(monthStart, 18),
            attachmentIds: [],
            recurrenceId: null,
            accountId: accountIds.length > 0 ? pick(accountIds) : null,
            paidBy: currentUserId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deletedAt: null,
          })
        }
      }

      await db.transactions.bulkPut(txns)

      const budgetMix: Array<{ name: string; limit: number }> = [
        { name: 'Groceries', limit: 15000 },
        { name: 'Dining', limit: 6000 },
        { name: 'Transport', limit: 4000 },
        { name: 'Fuel', limit: 5000 },
        { name: 'Utilities', limit: 4000 },
        { name: 'Entertainment', limit: 3000 },
        { name: 'Shopping', limit: 8000 },
      ]
      const budgets: Budget[] = budgetMix
        .map((b) => byName(b.name) && { cat: byName(b.name) as Category, limit: b.limit })
        .filter((b): b is { cat: Category; limit: number } => Boolean(b))
        .map((b) => ({
          budgetId: `${DEMO_BUDGET_PREFIX}${b.cat.categoryId}`,
          groupId: activeGroupId,
          categoryId: b.cat.categoryId,
          limit: toPaise(b.limit),
          period: 'monthly',
          updatedAt: Date.now(),
        }))
      await db.budgets.bulkPut(budgets)

      const investmentReturns = byName('Investment Returns')
      const goals: SavingsGoal[] = [
        {
          goalId: `${DEMO_GOAL_PREFIX}goa-trip`,
          groupId: activeGroupId,
          name: 'Goa Trip',
          target: toPaise(100000),
          saved: toPaise(42000),
          deadline: Date.now() + 60 * 86400_000,
          categoryId: null,
          createdAt: Date.now() - 90 * 86400_000,
          updatedAt: Date.now(),
        },
        {
          goalId: `${DEMO_GOAL_PREFIX}laptop`,
          groupId: activeGroupId,
          name: 'New Laptop',
          target: toPaise(80000),
          saved: toPaise(35000),
          deadline: null,
          categoryId: null,
          createdAt: Date.now() - 60 * 86400_000,
          updatedAt: Date.now(),
        },
        ...(investmentReturns
          ? [
              {
                goalId: `${DEMO_GOAL_PREFIX}investments`,
                groupId: activeGroupId,
                name: 'Investment Corpus',
                target: toPaise(500000),
                saved: 0,
                deadline: null,
                categoryId: investmentReturns.categoryId,
                createdAt: months[0] ?? Date.now(),
                updatedAt: Date.now(),
              } satisfies SavingsGoal,
            ]
          : []),
      ]
      await db.goals.bulkPut(goals)

      setStatus(
        `Seeded ${txns.length} transactions, ${budgets.length} budgets, ${goals.length} goals`,
      )
    } catch (e) {
      setStatus(`Error: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function clearAll() {
    setBusy(true)
    setStatus('Clearing…')
    try {
      const [txns, budgets, goals] = await Promise.all([
        db.transactions.toArray(),
        db.budgets.toArray(),
        db.goals.toArray(),
      ])
      await Promise.all([
        ...txns
          .filter((t) => t.txnId.startsWith(DEMO_TXN_PREFIX))
          .map((t) => db.transactions.delete(t.txnId)),
        ...budgets
          .filter((b) => b.budgetId.startsWith(DEMO_BUDGET_PREFIX))
          .map((b) => db.budgets.delete(b.budgetId)),
        ...goals
          .filter((g) => g.goalId.startsWith(DEMO_GOAL_PREFIX))
          .map((g) => db.goals.delete(g.goalId)),
      ])
      setStatus('Demo data cleared')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FlaskIcon size={14} className="text-warning" />
        <p className="text-xs font-medium text-warning uppercase tracking-wider">Dev: Demo Data</p>
      </div>
      <p className="text-xs text-text-secondary">
        Seeds ~4 months of realistic transactions, budgets and savings goals for screenshots.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={seedAll} disabled={busy} className="flex-1">
          Seed demo data
        </Button>
        <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}>
          <TrashIcon size={14} />
        </Button>
      </div>
      {status && <p className="text-[11px] text-text-tertiary">{status}</p>}
    </div>
  )
}
