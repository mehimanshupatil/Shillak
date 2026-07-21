import Papa from 'papaparse'
import { db } from '@/db/db'
import type { Category, Transaction } from '@/db/schema'
import { inferCategoryName } from '@/lib/categorize'
import { generateId, toPaise } from '@/lib/utils'

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface CsvTable {
  rows: string[][]
}

export function parseCsvText(text: string): CsvTable {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  return { rows: result.data }
}

// ─── Column mapping ───────────────────────────────────────────────────────────

export interface ColumnMapping {
  date: number | null
  note: number | null
  amount: number | null
  debit: number | null
  credit: number | null
  category: number | null
}

export type AmountMode = 'signed' | 'debit-credit'

const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  date: ['date'],
  note: ['description', 'narration', 'particulars', 'details', 'remarks', 'memo', 'note', 'payee'],
  amount: ['amount', 'value'],
  debit: ['debit', 'withdrawal', 'dr'],
  credit: ['credit', 'deposit', 'cr'],
  category: ['category', 'tag', 'label'],
}

/** Guess column meaning from header names. Returns null for any column not confidently matched. */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.trim().toLowerCase())
  const find = (hints: string[]): number | null => {
    const idx = lower.findIndex((h) => hints.some((hint) => h.includes(hint)))
    return idx === -1 ? null : idx
  }
  return {
    date: find(HEADER_HINTS.date),
    note: find(HEADER_HINTS.note),
    amount: find(HEADER_HINTS.amount),
    debit: find(HEADER_HINTS.debit),
    credit: find(HEADER_HINTS.credit),
    category: find(HEADER_HINTS.category),
  }
}

export function guessAmountMode(mapping: ColumnMapping): AmountMode {
  return mapping.debit !== null || mapping.credit !== null ? 'debit-credit' : 'signed'
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'DD MMM YYYY',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

function buildUtcDate(y: number, mo: number, d: number): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const ts = Date.UTC(y, mo - 1, d)
  const check = new Date(ts)
  // Reject silently-rolled-over dates (e.g. 31 Feb -> 3 Mar).
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null
  }
  return ts
}

/** Parse a raw date cell using an explicit, user-confirmed format. Returns null if it doesn't match. */
export function parseDateWithFormat(raw: string, format: DateFormat): number | null {
  const s = raw.trim()
  if (!s) return null

  switch (format) {
    case 'YYYY-MM-DD': {
      const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
      if (!m?.[1] || !m[2] || !m[3]) return null
      return buildUtcDate(Number(m[1]), Number(m[2]), Number(m[3]))
    }
    case 'DD/MM/YYYY': {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (!m?.[1] || !m[2] || !m[3]) return null
      return buildUtcDate(Number(m[3]), Number(m[2]), Number(m[1]))
    }
    case 'MM/DD/YYYY': {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (!m?.[1] || !m[2] || !m[3]) return null
      return buildUtcDate(Number(m[3]), Number(m[1]), Number(m[2]))
    }
    case 'DD-MM-YYYY': {
      const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
      if (!m?.[1] || !m[2] || !m[3]) return null
      return buildUtcDate(Number(m[3]), Number(m[2]), Number(m[1]))
    }
    case 'DD MMM YYYY': {
      const m = s.match(/^(\d{1,2})[\s-]([a-zA-Z]{3,})[\s-](\d{4})/)
      if (!m?.[1] || !m[2] || !m[3]) return null
      const monthIdx = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase())
      if (monthIdx === -1) return null
      return buildUtcDate(Number(m[3]), monthIdx + 1, Number(m[1]))
    }
  }
}

/** Pick the date format that parses the most sample values without error. */
export function guessDateFormat(samples: string[]): DateFormat {
  let best: DateFormat = 'YYYY-MM-DD'
  let bestScore = -1
  for (const format of DATE_FORMATS) {
    const score = samples.filter((s) => parseDateWithFormat(s, format) !== null).length
    if (score > bestScore) {
      bestScore = score
      best = format
    }
  }
  return best
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

/** Parse a raw amount cell to rupees (float, possibly negative). Returns null if unparseable. */
export function parseAmountValue(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[₹$€£,\s]/g, '')
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!s) return null

  const n = Number(s)
  if (Number.isNaN(n)) return null
  return negative ? -n : n
}

/** Signed-mode convention: negative = money out (expense), positive = money in (income). */
export function amountToPaiseAndType(rupees: number): {
  amountPaise: number
  type: 'expense' | 'income'
} {
  return { amountPaise: toPaise(Math.abs(rupees)), type: rupees < 0 ? 'expense' : 'income' }
}

// ─── Category resolution ──────────────────────────────────────────────────────

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

// ─── Duplicate detection ──────────────────────────────────────────────────────

export function isDuplicateTransaction(
  candidate: { date: number; amount: number; note: string },
  existing: Array<Pick<Transaction, 'date' | 'amount' | 'note'>>,
): boolean {
  const note = candidate.note.trim().toLowerCase()
  return existing.some(
    (t) =>
      t.date === candidate.date &&
      t.amount === candidate.amount &&
      t.note.trim().toLowerCase() === note,
  )
}

// ─── Import commit ────────────────────────────────────────────────────────────

export interface ResolvedCsvRow {
  date: number
  amount: number // integer paise, always positive
  type: 'expense' | 'income'
  categoryId: string
  note: string
  accountId: string | null
}

/**
 * Write resolved rows as transactions in one batch: a single vector-clock bump
 * covering the whole import (not one DB round-trip per row) followed by one
 * bulkPut. Rows that exactly match an existing transaction (date+amount+note)
 * are silently skipped and counted.
 */
export async function commitCsvImport(
  groupId: string,
  userId: string,
  currency: string,
  rows: ResolvedCsvRow[],
): Promise<{ imported: number; skipped: number }> {
  const [group, existing] = await Promise.all([
    db.groups.get(groupId),
    db.transactions.where((t) => t.groupId === groupId && t.deletedAt === null),
  ])
  if (!group) throw new Error('Group not found')

  const now = Date.now()
  let seq = group.vectorClock[userId] ?? 0
  const toInsert: Transaction[] = []
  const seen: Array<{ date: number; amount: number; note: string }> = existing
  let skipped = 0

  for (const row of rows) {
    if (isDuplicateTransaction(row, seen)) {
      skipped++
      continue
    }
    seq += 1
    toInsert.push({
      txnId: generateId(),
      groupId,
      ownerId: userId,
      authorSeq: seq,
      categoryId: row.categoryId,
      type: row.type,
      amount: row.amount,
      currency,
      fxRate: null,
      originalAmount: null,
      note: row.note,
      tags: [],
      date: row.date,
      attachmentIds: [],
      recurrenceId: null,
      accountId: row.accountId,
      paidBy: userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    // Dedupe subsequent rows in the same import against ones we just staged too.
    seen.push({ date: row.date, amount: row.amount, note: row.note })
  }

  if (toInsert.length > 0) {
    await db.groups.update(groupId, {
      vectorClock: { ...group.vectorClock, [userId]: seq },
      updatedAt: now,
    })
    await db.transactions.bulkPut(toInsert)
  }

  return { imported: toInsert.length, skipped }
}

// ─── AI-assisted reformatting template ────────────────────────────────────────

const TEMPLATE_COLUMNS = 'date,type,amount,category,note'

/**
 * A self-contained spec + example a user can hand to any AI assistant along
 * with their own export (bank statement, other budget app, etc.) and ask it
 * to reformat into something this importer can read without any column
 * mapping at all.
 */
export function buildImportTemplateGuide(categories: Category[], currency: string): string {
  const expenseNames = categories.filter((c) => c.type === 'expense').map((c) => c.name)
  const incomeNames = categories.filter((c) => c.type === 'income').map((c) => c.name)
  const allNames = [...expenseNames, ...incomeNames]

  return `Shillak CSV import template
============================

Columns (in this exact order, with a header row):
${TEMPLATE_COLUMNS}

- date: YYYY-MM-DD, e.g. 2026-07-21
- type: exactly "expense" or "income"
- amount: plain positive number, no currency symbol, no thousands separator, e.g. 1250.50
  (this space's currency is ${currency} — do not convert, just strip symbols)
- category: must exactly match one of the category names listed below
- note: short description (optional, but helpful)

Valid expense categories:
${expenseNames.join(', ')}

Valid income categories:
${incomeNames.join(', ')}

Example:
${TEMPLATE_COLUMNS}
2026-07-01,income,85000,Salary,Monthly salary
2026-07-02,expense,450.50,Groceries,Weekly shop
2026-07-03,expense,120,Transport,Auto fare

---
Prompt you can give an AI assistant along with your own export file:

"Convert the attached file into a CSV with exactly these columns: ${TEMPLATE_COLUMNS} — using date
format YYYY-MM-DD, type as either 'expense' or 'income', amount as a plain positive number with
no currency symbol or separators, and category as exactly one of: ${allNames.join(', ')}.
Output only the CSV, nothing else."
`
}

export function downloadImportTemplateGuide(
  categories: Category[],
  currency: string,
  groupName: string,
): void {
  const contents = buildImportTemplateGuide(categories, currency)
  const blob = new Blob([contents], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shillak-import-template-${groupName.toLowerCase().replace(/\s+/g, '-')}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
