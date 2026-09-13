import type { Category } from '@/db/schema'

/**
 * Map merchant/context keywords → category name (matches createDefaultCategories seeds).
 * Returns null if no confident match.
 */
export function inferCategoryName(text: string): string | null {
  const ctx = text.toLowerCase()

  const rules: Array<{ keywords: string[]; category: string }> = [
    {
      keywords: [
        'swiggy',
        'zomato',
        'eatsure',
        'foodpanda',
        'restaurant',
        'cafe',
        'dhaba',
        'hotel food',
        'biryani',
        'pizza',
        'burger',
        'kfc',
        'mcdonald',
        'domino',
        'subway',
        'starbucks',
      ],
      category: 'Dining',
    },
    {
      keywords: [
        'bigbasket',
        'blinkit',
        'grofers',
        'jiomart',
        'dmart',
        'reliance fresh',
        'more supermarket',
        'grocery',
        'vegetables',
        'fruits',
        'kirana',
      ],
      category: 'Groceries',
    },
    {
      keywords: [
        'uber',
        'ola',
        'rapido',
        'metro',
        'irctc',
        'railway',
        'bus ticket',
        'airport',
        'flight',
        'indigo',
        'airindia',
        'spicejet',
        'toll',
        'fuel',
        'petrol',
        'diesel',
      ],
      category: 'Transport',
    },
    {
      keywords: [
        'petrol',
        'diesel',
        'hpcl',
        'bpcl',
        'iocl',
        'indian oil',
        'shell',
        'fuel station',
        'gas station',
      ],
      category: 'Fuel',
    },
    {
      keywords: [
        'amazon',
        'flipkart',
        'myntra',
        'ajio',
        'nykaa',
        'meesho',
        'snapdeal',
        'clothing',
        'apparel',
        'fashion',
        'shoes',
        'shopping mall',
        'retail',
      ],
      category: 'Shopping',
    },
    {
      keywords: [
        'doctor',
        'hospital',
        'clinic',
        'pharmacy',
        'medplus',
        'apollo pharmacy',
        'netmeds',
        '1mg',
        'pharmeasy',
        'diagnostic',
        'lab test',
        'pathology',
        'medicine',
      ],
      category: 'Health',
    },
    {
      keywords: [
        'netflix',
        'hotstar',
        'prime video',
        'spotify',
        'youtube premium',
        'bookmyshow',
        'pvr',
        'inox',
        'cinema',
        'movie',
        'concert',
        'game',
      ],
      category: 'Entertainment',
    },
    {
      keywords: [
        'electricity',
        'bescom',
        'msedcl',
        'tata power',
        'adani electricity',
        'water bill',
        'gas bill',
        'broadband',
        'jio',
        'airtel',
        'bsnl',
        'vi ',
        'vodafone',
        'recharge',
        'mobile bill',
        'wifi',
      ],
      category: 'Utilities',
    },
    {
      keywords: [
        'emi',
        'loan',
        'home loan',
        'car loan',
        'personal loan',
        'credit card bill',
        'credit card payment',
        'iciciprulife',
        'hdfc loan',
      ],
      category: 'EMI',
    },
    {
      keywords: [
        'lic',
        'insurance premium',
        'term plan',
        'health insurance',
        'general insurance',
        'star health',
        'bajaj allianz',
        'icici lombard',
      ],
      category: 'Insurance',
    },
    {
      keywords: [
        'school fee',
        'college fee',
        'tuition',
        'coaching',
        'udemy',
        'coursera',
        'byju',
        'unacademy',
        'books',
        'stationery',
      ],
      category: 'Education',
    },
    {
      keywords: [
        'salon',
        'spa',
        'parlour',
        'parlor',
        'haircut',
        'beauty',
        'grooming',
        'personal care',
      ],
      category: 'Personal Care',
    },
    {
      keywords: ['rent', 'house rent', 'flat rent', 'apartment', 'pg rent', 'hostel rent'],
      category: 'Rent',
    },
    {
      keywords: [
        'plumber',
        'electrician',
        'carpenter',
        'maid',
        'cook',
        'repair',
        'maintenance',
        'housekeeping',
      ],
      category: 'Household',
    },
    {
      keywords: [
        'sip',
        'mutual fund purchase',
        'mutual fund sip',
        'zerodha',
        'groww',
        'upstox',
        'stock purchase',
        'demat',
        'nps contribution',
        'ppf deposit',
        'elss investment',
      ],
      category: 'Investment',
    },
    {
      keywords: ['salary', 'payroll', 'monthly pay'],
      category: 'Salary',
    },
    {
      keywords: ['freelance', 'consulting fee', 'contract payment'],
      category: 'Freelance',
    },
    {
      keywords: ['dividend', 'interest credit', 'mutual fund redemption', 'stock sale'],
      category: 'Investment Returns',
    },
  ]

  for (const { keywords, category } of rules) {
    if (keywords.some((kw) => ctx.includes(kw))) return category
  }
  return null
}

// ─── Resolving a name to a Category ───────────────────────────────────────────

/** Exact, case-insensitive name lookup within one Category type. */
export function findCategoryByName(
  categories: Category[],
  type: 'expense' | 'income',
  name: string,
): Category | undefined {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return undefined
  return categories.find((c) => c.type === type && c.name.toLowerCase() === wanted)
}

/**
 * Best guess at a category for an intake path where the user still gets to
 * choose — a scanned receipt, a shared payment message. Returns null rather
 * than falling back, so nothing is pre-selected on a guess that missed.
 */
export function suggestCategoryId(
  categories: Category[],
  type: 'expense' | 'income',
  hint: string | null,
  note: string,
): string | null {
  const fromHint = hint ? findCategoryByName(categories, type, hint) : undefined
  if (fromHint) return fromHint.categoryId

  const guessedName = inferCategoryName(note)
  const guessed = guessedName ? findCategoryByName(categories, type, guessedName) : undefined
  return guessed?.categoryId ?? null
}

export type CategoryMatchKind = 'explicit' | 'guessed' | 'fallback'

export interface ResolvedCategory {
  categoryId: string
  matchKind: CategoryMatchKind
}

/**
 * Resolve a category for one row: explicit column value > keyword-guessed from
 * note > "Other"/"Other Income" fallback. Throws only if the space has zero
 * categories of the needed type (shouldn't happen — seeded on space creation).
 */
export function resolveCategory(
  categories: Category[],
  type: 'expense' | 'income',
  rawCategoryText: string | undefined,
  note: string,
): ResolvedCategory {
  const byType = categories.filter((c) => c.type === type)

  if (rawCategoryText?.trim()) {
    const exact = byType.find((c) => c.name.toLowerCase() === rawCategoryText.trim().toLowerCase())
    if (exact) return { categoryId: exact.categoryId, matchKind: 'explicit' }
  }

  const guessedName = inferCategoryName(note)
  if (guessedName) {
    const guessed = byType.find((c) => c.name.toLowerCase() === guessedName.toLowerCase())
    if (guessed) return { categoryId: guessed.categoryId, matchKind: 'guessed' }
  }

  const fallback =
    byType.find((c) => c.name === (type === 'expense' ? 'Other' : 'Other Income')) ?? byType[0]
  if (!fallback) throw new Error(`No ${type} categories exist in this space`)
  return { categoryId: fallback.categoryId, matchKind: 'fallback' }
}
