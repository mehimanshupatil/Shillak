import type { Category, TransactionType } from './schema'

const EXPENSE_SEEDS: Array<{ name: string; icon: string; color: string }> = [
  { name: 'Groceries', icon: 'ShoppingCart', color: '#22c55e' },
  { name: 'Rent', icon: 'Home', color: '#6366f1' },
  { name: 'Transport', icon: 'Car', color: '#3b82f6' },
  { name: 'EMI', icon: 'CreditCard', color: '#ef4444' },
  { name: 'Utilities', icon: 'Zap', color: '#f59e0b' },
  { name: 'Health', icon: 'HeartPulse', color: '#ec4899' },
  { name: 'Entertainment', icon: 'Tv', color: '#8b5cf6' },
  { name: 'Dining', icon: 'Utensils', color: '#f97316' },
  { name: 'Shopping', icon: 'ShoppingBag', color: '#14b8a6' },
  { name: 'Education', icon: 'BookOpen', color: '#06b6d4' },
  { name: 'Insurance', icon: 'Shield', color: '#84cc16' },
  { name: 'Fuel', icon: 'Fuel', color: '#eab308' },
  { name: 'Household', icon: 'Wrench', color: '#64748b' },
  { name: 'Personal Care', icon: 'Sparkles', color: '#f43f5e' },
  { name: 'Other', icon: 'CircleDot', color: '#888888' },
]

const INCOME_SEEDS: Array<{ name: string; icon: string; color: string }> = [
  { name: 'Salary', icon: 'Briefcase', color: '#22c55e' },
  { name: 'Freelance', icon: 'Laptop', color: '#3b82f6' },
  { name: 'Investment Returns', icon: 'TrendingUp', color: '#f59e0b' },
  { name: 'Other Income', icon: 'PlusCircle', color: '#888888' },
]

export function createDefaultCategories(groupId: string, userId: string): Category[] {
  const now = Date.now()
  const make = (
    seed: (typeof EXPENSE_SEEDS)[number],
    type: TransactionType,
    i: number,
  ): Category => ({
    categoryId: crypto.randomUUID(),
    groupId,
    name: seed.name,
    icon: seed.icon,
    color: seed.color,
    type,
    sortOrder: i,
    isDefault: true,
    createdBy: userId,
    createdAt: now,
  })

  return [
    ...EXPENSE_SEEDS.map((s, i) => make(s, 'expense', i)),
    ...INCOME_SEEDS.map((s, i) => make(s, 'income', EXPENSE_SEEDS.length + i)),
  ]
}

export const GROUP_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
  '#64748b',
  '#f43f5e',
]

export function pickGroupColor(index: number): string {
  // biome-ignore lint/style/noNonNullAssertion: GROUP_COLORS is non-empty const, index always valid
  return GROUP_COLORS[index % GROUP_COLORS.length] ?? GROUP_COLORS[0]!
}
