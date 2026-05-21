# Shillak — Household Budget Tracker
> Privacy-first, offline-only PWA. No server. No login. No cloud. Data never leaves the device.

**Shillak** — Marathi for "the balance left."

---

## What this app is

Household finance for couples and families with **pooled finances**. Both partners treat spending as "our money" — no IOUs, no splits. For split-bill tracking, use Splitwise.

- One **space** = one household. Both partners install, sync over home WiFi or QR.
- Multiple spaces supported (e.g. personal + joint household), each isolated.
- All data lives in IndexedDB, encrypted with a local PIN.

> **UI terminology:** User-visible word is **"space"** (Settings → Space, "Add space", etc.). Internal code uses `groupId`, `group_secret`, `db.groups` — do not rename code symbols.

---

## Core principles

1. **Offline first** — works 100% without internet. No feature degrades silently.
2. **Privacy first** — no server, no account, no analytics, no telemetry.
3. **Local sync only** — WebRTC (same WiFi), QR batch, or JSON export. No cloud.
4. **Multi-space** — one install, N spaces, each isolated.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite |
| Language | TypeScript strict |
| Routing | React Router v6 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui |
| Icons | Lucide React |
| Local DB | Dexie.js v4 |
| Encryption | Web Crypto API (AES-GCM) |
| Reactive queries | `useLiveQuery` (dexie-react-hooks) |
| Derived cache | TanStack Query v5 |
| App state | Zustand |
| Sync P2P | Native `RTCPeerConnection` + `RTCDataChannel` |
| QR | qrcode + html5-qrcode |
| Compression | lz-string |
| PWA | vite-plugin-pwa + Workbox |

**`useLiveQuery` vs TanStack Query rule:**
- Raw Dexie table reads → `useLiveQuery`
- Derived/computed values (balances, summaries, totals) → TanStack Query
- Never mix both for the same data source — double subscription causes stale reads.

---

## Design system

**Refined utilitarian** — dark, dense, data-forward. Single warm saffron accent (`#f59e0b`).

- Fonts: Geist (headings) + Geist Mono (numbers/amounts)
- Max width: 430px. Bottom nav (5 tabs). No sidebar.
- Radius: `rounded-xl` cards, `rounded-lg` inputs, `rounded-full` pills
- Tokens in `src/styles/tokens.css` — bg `#0f0f0f`, surface `#1a1a1a`, accent `#f59e0b`, income `#22c55e`, expense `#ef4444`, warning `#f97316`

---

## Data schema (Dexie — 13 tables, `Shillak_db`)

All tables encrypted via AES-GCM **except** `keystore`.

```ts
// Keystore — unencrypted singleton
interface Keystore { id: 1; salt: string; pin_check: string; pin_change_in_progress: boolean }

interface User { userId: string; displayName: string; avatarColor: string; identityBackupHint: string; createdAt: number }

interface Group {
  groupId: string; name: string; avatarColor: string; createdBy: string
  currency: string; fiscalYearStart: number  // 1-12, default 4
  visibility: 'full' | 'totals_only'; status: 'active' | 'archived'
  groupSecret: string   // HMAC key for invites + HKDF input for transport encryption
  vectorClock: Record<string, number>; createdAt: number; updatedAt: number
}

interface GroupMember {
  id: string; groupId: string; userId: string; role: 'admin' | 'member'
  status: 'active' | 'left'; joinedAt: number; leftAt: number | null
  nickname: string | null; monthlyIncome: number | null; incomeCurrency: string | null
  updatedAt: number  // required for LWW conflict resolution
}
// Index: [groupId+userId]
// Admin invariant: after every sync apply, enforce exactly 1 admin.
//   0 admins → promote oldest joinedAt. 2+ admins → keep newest updatedAt.

interface GroupInvite {
  inviteId: string; groupId: string; createdBy: string; method: 'qr' | 'webrtc' | 'json'
  reusable: boolean; payload: Record<string, unknown>
  signature: string  // HMAC-SHA256(payload, key=groupSecret) — NOT groupId
  expiresAt: number; usedBy: string[]; createdAt: number
}

interface Category {
  categoryId: string; groupId: string; name: string; icon: string; color: string
  type: 'expense' | 'income'; sortOrder: number; isDefault: boolean
  createdBy: string; createdAt: number
}
// Seed via createDefaultCategories(groupId, userId) — never spread raw constants.

interface Transaction {
  txnId: string; groupId: string
  ownerId: string       // immutable after creation
  authorSeq: number     // group.vectorClock[ownerId] at write time
  categoryId: string; type: 'expense' | 'income'
  amount: number        // INTEGER paise — never decimal rupees
  currency: string; fxRate: number | null  // basis points: 1.23 → 12300
  originalAmount: number | null
  note: string; tags: string[]; date: number  // midnight UTC unix ms
  attachmentIds: string[]; recurrenceId: string | null
  accountId: string | null; paidBy: string
  createdAt: number; updatedAt: number; deletedAt: number | null
}
// Indexes: groupId, ownerId, [groupId+date], [groupId+categoryId], [recurrenceId+date]
// [recurrenceId+date] → O(1) dedup during recurrence processing

interface Recurrence {
  recurrenceId: string; groupId: string; ownerId: string
  template: Omit<Transaction, 'txnId'|'date'|'recurrenceId'|'authorSeq'|'createdAt'|'updatedAt'|'deletedAt'>
  frequency: 'daily'|'weekly'|'monthly'|'yearly'; interval: number
  nextDue: number; lastGeneratedAt: number | null; endDate: number | null
  active: boolean; isFixed: boolean; createdAt: number
}
// Only process recurrences where ownerId === currentUserId.

interface Attachment {
  attachmentId: string; groupId: string; txnId: string
  mimeType: string; data: string  // base64, record-level encrypted
  sizeBytes: number; createdAt: number
}
// Hard limit: 5MB. Excluded from QR sync.

interface Budget { budgetId: string; groupId: string; categoryId: string; limit: number; period: 'monthly'|'yearly'; updatedAt: number }
interface SavingsGoal { goalId: string; groupId: string; name: string; target: number; saved: number; deadline: number|null; categoryId: string|null; updatedAt: number }
interface Account { accountId: string; groupId: string; name: string; type: 'savings'|'current'|'credit'|'cash'|'upi'; color: string; icon: string; sortOrder: number; isDefault: boolean; createdAt: number; updatedAt: number }
interface SyncEvent { syncId: string; groupId: string; initiatedBy: string; method: 'webrtc'|'qr'|'json'; syncedWith: string; recordsSent: number; recordsReceived: number; conflictsFound: number; status: 'ok'|'partial'|'failed'; syncedAt: number }
interface ConflictLog { conflictId: string; groupId: string; syncId: string; entityType: 'transaction'|'budget'|'goal'; entityId: string; localValue: Record<string,unknown>; remoteValue: Record<string,unknown>; resolvedBy: string|null; resolution: 'local'|'remote'|'pending'; createdAt: number; resolvedAt: number|null }
```

---

## Encryption model

- **One AES-256-GCM key per device**, derived from PIN + salt (PBKDF2, 200k iterations).
- All spaces on the device share this key. Key lives in `key.store.ts` (session memory only — never persisted).
- `groupSecret` is a **separate per-space secret**: HMAC key for invite signatures + HKDF input for sync transport.
- `keystore` table: unencrypted. Everything else: always encrypted.
- Lock after 5min background (Page Visibility API). BroadcastChannel syncs lock/unlock across tabs.
- PIN change: blocking re-encryption of all tables. `pin_change_in_progress` flag allows resume on crash.

---

## Sync architecture

Three offline tiers — no server required for any.

| Tier | Method | Direction |
|------|--------|-----------|
| 1 | WebRTC (same WiFi, SDP via QR) | Bidirectional |
| 2 | QR batch chunks ≤600 bytes raw | Unidirectional |
| 3 | JSON export/import (`.shillak`) | Unidirectional |

**Vector clock delta:**
- Every local write: `group.vectorClock[myUserId]++`, stamp `authorSeq` on record.
- My delta for peer: records where `ownerId === peerId && authorSeq > myKnownClock[peerId]`.
- After apply: `vectorClock[userId] = max(local, remote)` for each user.
- Only increment own clock. `incrementVectorClock` asserts `userId === currentUserId`.

**Conflict resolution:**
| Entity | Strategy |
|--------|----------|
| Own transaction | No conflict (ownerId-scoped) |
| Transaction edited by other | LWW by updatedAt |
| Transaction deleted one side, edited other | ConflictLog → user |
| Budget / SavingsGoal | ConflictLog → user (never auto-resolve) |
| Category / GroupMember | LWW by updatedAt |

**Join flow:** Admin shows invite QR (HMAC-signed payload with `groupSecret`). New member scans → sees preview → joins. Then syncs via WebRTC or JSON to get history.

---

## App boot sequence

```
db.open() → throws → StorageErrorScreen (dead end)
         → ok → keystore.get(1)
                  → null → Onboarding
                  → exists, no User → Onboarding
                  → exists → PinScreen → correct → deriveKey → processRecurrences → Dashboard
                                       → wrong → error + attempt counter
```

`AppBootstrap` never renders children until `keyStore.key !== null`.

---

## OCR receipt parsing (`src/lib/ocr.ts`)

`parseReceiptText(raw)` returns `{ amount, note, date, categoryHint }`.

- **Amount**: score-based — labels like GRAND TOTAL/NET PAYABLE score 100, bare numbers score 20. Pass 2 handles ₹ OCR'd as junk (BHIM/GPay): looks for decimal on line after "Paid" keyword.
- **Merchant**: ordered patterns — `banking name\n<NAME>` (BHIM), `payment received by`, `paid to`, `sent to`, UPI VPA stripped of `@handle`.
- **Date**: DD/MM/YYYY, ISO, `5th May 26` (ordinal + 2-digit year), `May 5 2025`.
- **Category hint**: keyword→category map (Swiggy→Dining, HPCL→Fuel, Netflix→Entertainment, etc.)

---

## Key constraints

- **Amounts: integers (paise).** Never decimal rupees. `toPaise()` immediately on user input.
- **Dates: midnight UTC.** `Date.UTC(y, m, d)` always. Never `Date.now()` for transaction date.
- **`advanceDate()`** for all recurrence arithmetic. Never raw `setMonth()` — month overflow.
- **Soft deletes only.** Never `db.transactions.delete()`. Always `deletedAt = Date.now()`.
- **No backend.** No Express, Supabase, Firebase. Dexie only.
- **No localStorage for sensitive data.** Encrypted Dexie only.
- **TypeScript strict.** No `any`. No `as unknown`. No unchecked index access without `?? fallback`.
- **Mobile first.** Max 430px. Test at 390px.
- **Encryption via ShillakDB subclass** — not Dexie hooks (hooks are sync; Web Crypto is async).
- **`keystore` never encrypted.** All other tables always are.
- **Service worker never touches Dexie.** No background sync handlers that read/write DB.
- **`key.store.ts` never uses Zustand persist.** Session memory only.
- **Multi-tab lock via BroadcastChannel.**
- **Only process own recurrences** (`ownerId === currentUserId`). Catch up fully in one loop.
- **Never increment another user's vector clock.**
- **Admin invariant after every sync apply.** 0 admins → promote oldest. 2+ → keep newest updatedAt.
- **Budget/goal conflicts never auto-resolved.** Always ConflictLog + user prompt.
- **`useLiveQuery` for raw reads. TanStack Query for derived only.** Never mix for same source.
- **Seed via `createDefaultCategories(groupId, userId)`.** Never spread raw seed constants.
- **QR chunk ≤600 bytes raw** (encryption + base64 + JSON wrapper fits QR capacity).
- **DB open failure → full-screen error.** Never proceed silently without storage.
- **Attachment limit: 5MB.** Warn at 80% quota. Block at 90%.
- **Schema versioning:** version 1 locked. Future changes via `db.version(N).stores().upgrade()`.
- **`groupSecret` as HMAC key.** Never `groupId`.

---

## Finance correctness checklist

Before shipping any code that touches amounts, dates, filters, or totals, verify:

1. **Amounts use `toPaise()`** — every user-input path calls `toPaise()` immediately; no raw float stored.
2. **Totals use `toBaseCurrency()`** — every sum/aggregation of `txn.amount` uses `toBaseCurrency(txn, currency)` not `txn.amount` directly. Applies to charts, budgets, goal tracking, account balances.
3. **Transfers excluded from expense/income totals** — any filter or aggregate that counts "expenses" or "income" must guard with `t.type !== 'transfer'`. Budget spend, summary cards, category breakdowns all apply.
4. **Date display is UTC-aware** — display helpers use `getUTCFullYear/Month/Date`; never `getFullYear/Month/Date` on UTC-midnight timestamps. Use `toDateOnly()` (in `utils.ts`) as the canonical conversion.
5. **Schema fields are live, not decorative** — if a schema field is added (e.g. `openingBalance`, `toAccountId`), verify the read path uses it. A field written but never read is a silent data loss.

---

## Build commands

```bash
pnpm dev       # dev server
pnpm build     # production build
pnpm typecheck # tsc --noEmit
pnpm lint      # biome lint
```

---

## Status

Phases 1–4 complete. Remaining:
- ⬜ Biometric unlock (WebAuthn as PIN shortcut)
