/**
 * Import transactions from an arbitrary CSV — bank statement export, another
 * budget app's export, or an AI-reformatted file (see the downloadable
 * template on the upload step). Flow: upload -> confirm column mapping ->
 * preview (auto-matched categories, editable; duplicates auto-skipped) ->
 * import.
 */

import {
  CheckIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { db } from '@/db/db'
import type { Account, Category } from '@/db/schema'
import {
  type AmountMode,
  amountToPaiseAndType,
  autoDetectColumns,
  type ColumnMapping,
  commitCsvImport,
  DATE_FORMATS,
  type DateFormat,
  downloadImportTemplateGuide,
  guessAmountMode,
  guessDateFormat,
  parseAmountValue,
  parseCsvText,
  parseDateWithFormat,
  type ResolvedCsvRow,
  resolveCategory,
} from '@/lib/csvImport'
import { formatCurrency } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

interface Props {
  open: boolean
  onClose: () => void
}

interface PreviewRow {
  ok: true
  date: number
  note: string
  amountPaise: number
  type: 'expense' | 'income'
  categoryId: string
  isDuplicate: boolean
}

interface PreviewRowError {
  ok: false
  raw: string
}

type Step =
  | { step: 'upload' }
  | { step: 'mapping'; headers: string[]; dataRows: string[][]; mapping: ColumnMapping }
  | {
      step: 'preview'
      dataRows: string[][]
      mapping: ColumnMapping
      amountMode: AmountMode
      dateFormat: DateFormat
      accountId: string | null
      rows: Array<PreviewRow | PreviewRowError>
      categoryOverride: Record<number, string>
    }
  | { step: 'importing' }
  | { step: 'done'; imported: number; skipped: number }
  | { step: 'error'; message: string }

const NONE = '__none__'

function buildRows(
  dataRows: string[][],
  mapping: ColumnMapping,
  amountMode: AmountMode,
  dateFormat: DateFormat,
  categories: Category[],
  existing: Array<{ date: number; amount: number; note: string }>,
): { rows: Array<PreviewRow | PreviewRowError>; categoryOverride: Record<number, string> } {
  const rows: Array<PreviewRow | PreviewRowError> = []
  const categoryOverride: Record<number, string> = {}
  const seen = [...existing]

  dataRows.forEach((cells, i) => {
    const dateRaw = mapping.date !== null ? (cells[mapping.date] ?? '') : ''
    const date = parseDateWithFormat(dateRaw, dateFormat)

    let rupees: number | null = null
    if (amountMode === 'signed') {
      const raw = mapping.amount !== null ? (cells[mapping.amount] ?? '') : ''
      rupees = parseAmountValue(raw)
    } else {
      const debitRaw = mapping.debit !== null ? (cells[mapping.debit] ?? '') : ''
      const creditRaw = mapping.credit !== null ? (cells[mapping.credit] ?? '') : ''
      const debit = parseAmountValue(debitRaw)
      const credit = parseAmountValue(creditRaw)
      if (debit && debit !== 0) rupees = -Math.abs(debit)
      else if (credit && credit !== 0) rupees = Math.abs(credit)
    }

    if (date === null || rupees === null) {
      rows.push({ ok: false, raw: cells.join(', ') })
      return
    }

    const note = mapping.note !== null ? (cells[mapping.note] ?? '').trim() : ''
    const rawCategory = mapping.category !== null ? cells[mapping.category] : undefined
    const { amountPaise, type } = amountToPaiseAndType(rupees)
    const { categoryId } = resolveCategory(categories, type, rawCategory, note)
    const isDuplicate = seen.some(
      (t) =>
        t.date === date &&
        t.amount === amountPaise &&
        t.note.trim().toLowerCase() === note.toLowerCase(),
    )
    if (!isDuplicate) seen.push({ date, amount: amountPaise, note })

    categoryOverride[i] = categoryId
    rows.push({ ok: true, date, note, amountPaise, type, categoryId, isDuplicate })
  })

  return { rows, categoryOverride }
}

export default function CsvImportSheet({ open, onClose }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<Step>({ step: 'upload' })

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )
  const categories = useLiveQuery(
    () => (activeGroupId ? db.categories.where((c) => c.groupId === activeGroupId) : []),
    [activeGroupId],
  )
  const accounts = useLiveQuery(
    () => (activeGroupId ? db.accounts.where((a) => a.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  function reset() {
    setState({ step: 'upload' })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const { rows } = parseCsvText(text)
      if (rows.length < 2) {
        setState({ step: 'error', message: 'That file has no data rows to import.' })
        return
      }
      const [headerRow, ...dataRows] = rows
      const headers = headerRow ?? []
      const mapping = autoDetectColumns(headers)
      setState({ step: 'mapping', headers, dataRows, mapping })
    } catch (err) {
      setState({ step: 'error', message: `Couldn't read that file: ${String(err)}` })
    }
  }

  async function handleBuildPreview(
    dataRows: string[][],
    mapping: ColumnMapping,
    amountMode: AmountMode,
    dateFormat: DateFormat,
    accountId: string | null,
  ) {
    if (!activeGroupId || !categories) return
    const existing = await db.transactions.where(
      (t) => t.groupId === activeGroupId && t.deletedAt === null,
    )
    const { rows, categoryOverride } = buildRows(
      dataRows,
      mapping,
      amountMode,
      dateFormat,
      categories,
      existing,
    )
    setState({
      step: 'preview',
      dataRows,
      mapping,
      amountMode,
      dateFormat,
      accountId,
      rows,
      categoryOverride,
    })
  }

  async function handleImport() {
    if (state.step !== 'preview' || !activeGroupId || !currentUserId || !group) return
    setState({ step: 'importing' })
    try {
      const toImport: ResolvedCsvRow[] = state.rows
        .map((row, i) =>
          row.ok && !row.isDuplicate
            ? {
                date: row.date,
                amount: row.amountPaise,
                type: row.type,
                categoryId: state.categoryOverride[i] ?? row.categoryId,
                note: row.note,
                accountId: state.accountId,
              }
            : null,
        )
        .filter((r): r is ResolvedCsvRow => r !== null)

      const dupCount = state.rows.filter((r) => r.ok && r.isDuplicate).length
      const { imported } = await commitCsvImport(
        activeGroupId,
        currentUserId,
        group.currency,
        toImport,
      )
      setState({ step: 'done', imported, skipped: dupCount })
    } catch (err) {
      setState({ step: 'error', message: `Import failed: ${String(err)}` })
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent
        className="w-full max-w-[430px] mx-auto rounded-t-2xl bg-surface
                   border-0 border-t border-border px-0 pb-0 gap-0 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-3" />
        </div>

        <DrawerHeader className="px-4 pb-3 text-left">
          <DrawerTitle className="text-lg font-bold text-text-primary text-left">
            Import CSV
          </DrawerTitle>
          <p className="text-xs text-text-tertiary">
            Bank statements, other budget apps, or an AI-reformatted file.
          </p>
        </DrawerHeader>

        <div className="px-4 pb-8">
          {state.step === 'upload' && (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full p-5 rounded-2xl border border-dashed border-border bg-surface-2
                           flex flex-col items-center gap-2 text-center active:bg-surface-3 transition-colors"
              >
                <UploadSimpleIcon size={24} className="text-accent" />
                <p className="text-sm font-medium text-text-primary">Choose a CSV file</p>
                <p className="text-xs text-text-tertiary">
                  You'll confirm column mapping before anything is imported.
                </p>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
              />

              <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
                <p className="text-xs font-semibold text-text-primary mb-1">
                  Data in a different format?
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mb-3">
                  Download the template below and hand it — along with your export — to any AI
                  assistant, asking it to reformat your data to match. Then import the result here.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!categories || !group}
                  onClick={() =>
                    categories &&
                    group &&
                    downloadImportTemplateGuide(categories, group.currency, group.name)
                  }
                  className="w-full"
                >
                  <DownloadSimpleIcon size={14} />
                  Download template for AI
                </Button>
              </div>
            </div>
          )}

          {state.step === 'mapping' && (
            <MappingStep
              headers={state.headers}
              dataRows={state.dataRows}
              initialMapping={state.mapping}
              accounts={accounts ?? []}
              onBack={reset}
              onNext={(mapping, amountMode, dateFormat, accountId) =>
                handleBuildPreview(state.dataRows, mapping, amountMode, dateFormat, accountId)
              }
            />
          )}

          {state.step === 'preview' && categories && (
            <PreviewStep
              rows={state.rows}
              categoryOverride={state.categoryOverride}
              categories={categories}
              currency={group?.currency ?? 'INR'}
              onCategoryChange={(i, categoryId) =>
                setState({
                  ...state,
                  categoryOverride: { ...state.categoryOverride, [i]: categoryId },
                })
              }
              onBack={reset}
              onImport={handleImport}
            />
          )}

          {state.step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <CircleNotchIcon size={32} className="animate-spin text-accent" />
              <p className="text-sm font-medium text-text-primary">Importing…</p>
            </div>
          )}

          {state.step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckIcon size={30} className="text-success" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-text-primary">Import complete</p>
                <p className="text-sm text-text-secondary mt-1">
                  {state.imported} transaction{state.imported !== 1 ? 's' : ''} imported
                  {state.skipped > 0 && (
                    <span className="text-text-tertiary">
                      {' '}
                      · {state.skipped} duplicate{state.skipped !== 1 ? 's' : ''} skipped
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  reset()
                  onClose()
                }}
              >
                Done
              </Button>
            </div>
          )}

          {state.step === 'error' && (
            <div className="flex flex-col gap-4 py-4">
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
                <p className="text-xs font-semibold text-danger mb-1">Import failed</p>
                <p className="text-sm text-text-primary leading-snug">{state.message}</p>
              </div>
              <Button variant="secondary" onClick={reset} className="w-full">
                Try again
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

// ─── Mapping step ─────────────────────────────────────────────────────────────

function MappingStep({
  headers,
  dataRows,
  initialMapping,
  accounts,
  onBack,
  onNext,
}: {
  headers: string[]
  dataRows: string[][]
  initialMapping: ColumnMapping
  accounts: Account[]
  onBack: () => void
  onNext: (
    mapping: ColumnMapping,
    amountMode: AmountMode,
    dateFormat: DateFormat,
    accountId: string | null,
  ) => void
}) {
  const [mapping, setMapping] = useState(initialMapping)
  const [amountMode, setAmountMode] = useState<AmountMode>(guessAmountMode(initialMapping))
  const [accountId, setAccountId] = useState<string | null>(null)

  function sampleDates(col: number | null): string[] {
    return col !== null ? dataRows.slice(0, 20).map((r) => r[col] ?? '') : []
  }
  const [dateFormat, setDateFormat] = useState<DateFormat>(() =>
    guessDateFormat(sampleDates(initialMapping.date)),
  )

  function handleDateColumnChange(v: number | null) {
    setMapping({ ...mapping, date: v })
    setDateFormat(guessDateFormat(sampleDates(v)))
  }

  const columnOptions = headers.map((h, i) => ({ index: i, label: h.trim() || `Column ${i + 1}` }))
  const sample = dataRows[0] ?? []

  function ColumnPicker({
    label,
    value,
    onChange,
  }: {
    label: string
    value: number | null
    onChange: (v: number | null) => void
  }) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <Select
          value={value === null ? NONE : String(value)}
          onValueChange={(v) => v !== null && onChange(v === NONE ? null : Number(v))}
        >
          <SelectTrigger className="w-full h-11">
            <SelectValue>
              {(v: string) => {
                if (v === NONE) return 'Not in this file'
                const c = columnOptions[Number(v)]
                if (!c) return v
                return sample[c.index] ? `${c.label} (e.g. "${sample[c.index]}")` : c.label
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not in this file</SelectItem>
            {columnOptions.map((c) => (
              <SelectItem key={c.index} value={String(c.index)}>
                {c.label}
                {sample[c.index] ? ` (e.g. "${sample[c.index]}")` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const canProceed =
    mapping.date !== null &&
    (amountMode === 'signed'
      ? mapping.amount !== null
      : mapping.debit !== null || mapping.credit !== null)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        Confirm columns
      </p>

      <ColumnPicker label="Date" value={mapping.date} onChange={handleDateColumnChange} />

      {mapping.date !== null && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary">
            Date format (auto-detected — check it matches)
          </p>
          <Select value={dateFormat} onValueChange={(v) => v !== null && setDateFormat(v)}>
            <SelectTrigger className="w-full h-11">
              <SelectValue>
                {(v: string) => `${v} (e.g. ${dataRows[0]?.[mapping.date as number] ?? ''})`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f} (e.g. {dataRows[0]?.[mapping.date as number] ?? ''})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-text-secondary">Amount format</p>
        <div className="flex gap-2 p-1 rounded-xl bg-surface-2">
          <button
            type="button"
            onClick={() => setAmountMode('signed')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              amountMode === 'signed' ? 'bg-accent text-black' : 'text-text-secondary'
            }`}
          >
            One column (+/-)
          </button>
          <button
            type="button"
            onClick={() => setAmountMode('debit-credit')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              amountMode === 'debit-credit' ? 'bg-accent text-black' : 'text-text-secondary'
            }`}
          >
            Separate debit/credit
          </button>
        </div>
      </div>

      {amountMode === 'signed' ? (
        <ColumnPicker
          label="Amount (negative = expense, positive = income)"
          value={mapping.amount}
          onChange={(v) => setMapping({ ...mapping, amount: v })}
        />
      ) : (
        <>
          <ColumnPicker
            label="Debit / withdrawal"
            value={mapping.debit}
            onChange={(v) => setMapping({ ...mapping, debit: v })}
          />
          <ColumnPicker
            label="Credit / deposit"
            value={mapping.credit}
            onChange={(v) => setMapping({ ...mapping, credit: v })}
          />
        </>
      )}

      <ColumnPicker
        label="Description / note"
        value={mapping.note}
        onChange={(v) => setMapping({ ...mapping, note: v })}
      />
      <ColumnPicker
        label="Category (optional — we'll guess if not in this file)"
        value={mapping.category}
        onChange={(v) => setMapping({ ...mapping, category: v })}
      />

      {accounts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary">
            Assign every imported row to an account (optional)
          </p>
          <Select
            value={accountId ?? NONE}
            onValueChange={(v) => v !== null && setAccountId(v === NONE ? null : v)}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue>
                {(v: string) =>
                  v === NONE ? 'No account' : (accounts.find((a) => a.accountId === v)?.name ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No account</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.accountId} value={a.accountId}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          disabled={!canProceed}
          onClick={() => onNext(mapping, amountMode, dateFormat, accountId)}
          className="flex-1"
        >
          Preview
        </Button>
      </div>
    </div>
  )
}

// ─── Preview step ─────────────────────────────────────────────────────────────

function PreviewStep({
  rows,
  categoryOverride,
  categories,
  currency,
  onCategoryChange,
  onBack,
  onImport,
}: {
  rows: Array<PreviewRow | PreviewRowError>
  categoryOverride: Record<number, string>
  categories: Category[]
  currency: string
  onCategoryChange: (index: number, categoryId: string) => void
  onBack: () => void
  onImport: () => void
}) {
  const ok = rows.filter((r): r is PreviewRow => r.ok)
  const errorCount = rows.length - ok.length
  const dupCount = ok.filter((r) => r.isDuplicate).length
  const importCount = ok.length - dupCount

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface-2 border border-border px-4 py-3 text-xs text-text-secondary space-y-1">
        <p>
          <span className="text-text-primary font-semibold">{importCount}</span> transaction
          {importCount !== 1 ? 's' : ''} will be imported
        </p>
        {dupCount > 0 && <p>{dupCount} skipped as duplicates of existing transactions</p>}
        {errorCount > 0 && <p>{errorCount} rows skipped — couldn't parse a date or amount</p>}
      </div>

      <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
        {rows
          .map((row, i) => ({ row, i }))
          .filter((entry): entry is { row: PreviewRow; i: number } => entry.row.ok)
          .map(({ row, i }) => (
            <div
              key={i}
              className={`p-3 rounded-xl border ${
                row.isDuplicate
                  ? 'border-border bg-surface-2/50 opacity-60'
                  : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-sm font-medium text-text-primary truncate">
                  {row.note || '(no description)'}
                </p>
                <p
                  className={`text-sm font-mono shrink-0 ${row.type === 'income' ? 'text-income' : 'text-expense'}`}
                >
                  {row.type === 'income' ? '+' : '-'}
                  {formatCurrency(row.amountPaise, currency)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-text-tertiary">
                  {new Date(row.date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                  {row.isDuplicate && ' · duplicate, will skip'}
                </p>
                {!row.isDuplicate && (
                  <Select
                    value={categoryOverride[i] ?? row.categoryId}
                    onValueChange={(v) => v !== null && onCategoryChange(i, v)}
                  >
                    <SelectTrigger className="h-7 px-2 text-[11px]">
                      <SelectValue>
                        {(v: string) => categories.find((c) => c.categoryId === v)?.name ?? v}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.type === row.type)
                        .map((c) => (
                          <SelectItem key={c.categoryId} value={c.categoryId}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button disabled={importCount === 0} onClick={onImport} className="flex-1">
          Import {importCount} transaction{importCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  )
}
