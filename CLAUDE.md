# Shillak — Group Budget Tracker
> Privacy-first, offline-only PWA for shared household and group finances.
> No server. No login. No cloud. Data never leaves the device.

---

## App name

**Shillak** — raw, Marathi-rooted, means exactly "the balance left" — very direct and distinctive.

---

## What this app is

Shillak is a **group finance app** — not a personal budget tracker, not a Splitwise clone.

- A family uses it as a **household budget tracker**: track income, spending vs budget, savings goals, recurring expenses (rent, EMIs, SIPs).
- A group of flatmates uses it to **split shared expenses** and see who owes whom.
- A trip group uses it to **track shared costs** for a holiday.

Each "group" is an independent, private pocket. One app install can belong to multiple groups. All data lives in the browser's IndexedDB, encrypted with a local PIN.

---

## Core principles

1. **Offline first** — the app works 100% without internet. Always. No feature degrades silently when offline.
2. **Privacy first** — no server, no account, no analytics, no telemetry. Data stays on device.
3. **Local sync only** — data syncs between devices via local WiFi (WebRTC, no server), QR code batching, or JSON file export. User chooses.
4. **Multi-group** — one install, N groups. Family, flatmates, trip — each isolated.
5. **Transparent** — full visibility into group data for all members (no hidden transactions).

---

## Tech stack

### Core
| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 18 + Vite | Fast DX, excellent PWA support |
| Language | TypeScript (strict) | Safety for complex data model |
| Routing | React Router v6 | Battle-tested, good PWA/nested route support |
| Styling | Tailwind CSS v4 | Utility-first, fast iteration |
| Component lib | shadcn/ui | Accessible, unstyled base, customisable |
| Animation | Motion (Framer Motion v11) | Smooth micro-interactions |
| Icons | Lucide React | Consistent, tree-shakable |

### Data & State
| Layer | Choice | Reason |
|-------|--------|--------|
| Local DB | Dexie.js v4 | TypeScript-first IndexedDB wrapper, reactive live queries |
| Encryption | Web Crypto API (AES-GCM) | Native browser, no dependency, encrypts all Dexie writes |
| Reactive queries | dexie-react-hooks `useLiveQuery` | Direct Dexie reactivity, no extra cache layer |
| Derived state cache | TanStack Query v5 | Cache for computed/derived data only (balances, summaries) |
| App state | Zustand | Lightweight, minimal boilerplate |
| Forms | React Hook Form + Zod | Type-safe validation |

> **TanStack Query vs useLiveQuery — rule:**
> - Raw Dexie table reads → `useLiveQuery` from `dexie-react-hooks`.
> - Derived/computed values (net balances, budget summaries, month-over-month totals) → TanStack Query with Dexie queries as `queryFn`.
> - Never mix both for the same data source — double subscription causes stale reads.

### Sync
| Layer | Choice | Reason |
|-------|--------|--------|
| Local WiFi P2P | Native `RTCPeerConnection` + `RTCDataChannel` | No signaling server needed — SDP exchanged via QR. Fully offline. |
| QR generation | qrcode (npm) | Lightweight, no canvas deps |
| QR scanning | html5-qrcode | Camera access + decode |
| Compression | lz-string | Compress SDP + JSON chunks for QR |

> **Why not PeerJS:** PeerJS requires a hosted signaling server (peerjs.com or self-hosted) to exchange WebRTC SDP offers/answers — even on local WiFi. That contradicts "no server." Instead, we use raw `RTCPeerConnection` with manual SDP exchange via QR codes (Device A shows offer QR → Device B scans → shows answer QR → Device A scans → connected). No STUN/TURN needed on local WiFi because both devices have directly reachable local IPs. SDP + local ICE candidates compresses to ~600–800 bytes — fits comfortably in a QR.

### PWA
| Layer | Choice | Reason |
|-------|--------|--------|
| PWA plugin | vite-plugin-pwa | Service worker, manifest, offline shell |
| Service worker | Workbox (via plugin) | Cache strategies, app shell caching |

---

## Design system

### Aesthetic direction
**Refined utilitarian** — clean, dense, data-forward. No decorative fluff. Every element earns its place.
Think: monochrome base with a single warm accent, generous whitespace, sharp type hierarchy.

### Fonts
- Display / headings: **Geist** (Vercel) — geometric, modern, readable at all sizes
- Body / data: **Geist Mono** for numbers and amounts — consistent column alignment
- Import via `@fontsource/geist` and `@fontsource/geist-mono`

### Color tokens (CSS variables in `src/styles/tokens.css`)
```css
:root {
  /* Base */
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-surface-2: #242424;
  --color-surface-3: #2c2c2c;    /* modals, sheets over surface-2 */
  --color-overlay: #000000cc;    /* backdrop behind bottom sheets / modals */
  --color-border: #2e2e2e;
  --color-border-subtle: #1e1e1e;

  /* Text */
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #888;
  --color-text-tertiary: #6b6b6b; /* minimum ~4.6:1 on surface — was #555 (failed WCAG AA) */

  /* Accent — warm saffron */
  --color-accent: #f59e0b;
  --color-accent-subtle: #f59e0b18;
  --color-accent-hover: #fbbf24;

  /* Semantic — WARNING must differ from accent */
  --color-success: #22c55e;
  --color-danger: #ef4444;
  --color-warning: #f97316;       /* orange, distinct from saffron accent */
  --color-info: #3b82f6;

  /* Finance-specific aliases (maps to semantic, prevents call-site drift) */
  --color-income: var(--color-success);   /* #22c55e — green amounts */
  --color-expense: var(--color-danger);   /* #ef4444 — red amounts */
  --color-transfer: var(--color-info);    /* #3b82f6 — neutral transfers */
  --color-budget-ok: var(--color-success);
  --color-budget-warn: var(--color-warning);   /* 80–99% of limit */
  --color-budget-over: var(--color-danger);    /* ≥100% of limit */

  /* Group avatar palette (8 colors, cycle on creation) */
  --group-color-1: #6366f1;   /* indigo */
  --group-color-2: #ec4899;   /* pink */
  --group-color-3: #14b8a6;   /* teal */
  --group-color-4: #f97316;   /* orange */
  --group-color-5: #8b5cf6;   /* violet */
  --group-color-6: #06b6d4;   /* cyan */
  --group-color-7: #64748b;   /* slate — replaces neon lime (#84cc16) */
  --group-color-8: #f43f5e;   /* rose */
}

/* Light mode — v2, not in Phase 1 scope. Define tokens here when ready. */
/* @media (prefers-color-scheme: light) { :root { ... } } */
```

### Spacing & radius
- Base unit: 4px
- Border radius: `rounded-xl` (12px) for cards, `rounded-lg` (8px) for inputs, `rounded-full` for pills/avatars
- Consistent 16px / 24px padding on all cards

### Mobile-first layout
- Max content width: 430px (phone-sized even on desktop)
- Bottom navigation bar (5 tabs)
- No sidebar, no top nav hamburger

---

## Folder structure

```
Shillak/
├── public/
│   ├── icons/              # PWA icons (192, 512, maskable)
│   └── manifest.webmanifest
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── tokens.css      # CSS custom properties
│   ├── db/
│   │   ├── schema.ts       # Dexie table definitions + version history
│   │   ├── db.ts           # ShillakDB subclass (Dexie) — encryption baked in
│   │   ├── seeds.ts        # createDefaultCategories() helper
│   │   └── queries/        # One file per entity (transactions.ts, budgets.ts, etc.)
│   ├── crypto/
│   │   ├── pin.ts          # PIN → AES-GCM key derivation (PBKDF2)
│   │   ├── encrypt.ts      # encrypt / decrypt helpers
│   │   └── keystore.ts     # Bootstrap: salt + pin_check, verify, PIN change, BroadcastChannel lock sync
│   ├── sync/
│   │   ├── webrtc.ts       # RTCPeerConnection: offer/answer flow, data channel, delta exchange
│   │   ├── qr.ts           # QR chunk generation + reassembly (also used for SDP signaling)
│   │   ├── json.ts         # Full snapshot export / import
│   │   ├── transport.ts    # Transport encryption (HKDF from group_secret)
│   │   ├── vector-clock.ts # Vector clock merge logic
│   │   └── conflict.ts     # Conflict detection + resolution queue
│   ├── stores/
│   │   ├── app.store.ts    # Active group, current user, UI state
│   │   ├── key.store.ts    # CryptoKey — session only, NEVER persisted
│   │   └── sync.store.ts   # Sync status, pending conflicts
│   ├── hooks/
│   │   ├── useTransactions.ts
│   │   ├── useBudgets.ts
│   │   ├── useGroup.ts
│   │   └── useSync.ts
│   ├── components/
│   │   ├── ui/             # shadcn base components
│   │   ├── layout/         # BottomNav, PageHeader, GroupSwitcher
│   │   ├── transaction/    # TransactionCard, TransactionForm, TransactionList
│   │   ├── budget/         # BudgetBar, BudgetCard, BudgetForm
│   │   ├── group/          # GroupCard, GroupForm, MemberList, InviteSheet
│   │   ├── sync/           # SyncSheet, QRDisplay, QRScanner, ConflictResolver
│   │   └── charts/         # SpendingDonut, MonthlyBar, GoalProgress
│   ├── pages/
│   │   ├── Onboarding/
│   │   ├── Dashboard/
│   │   ├── Transactions/
│   │   ├── Budgets/
│   │   ├── Splits/
│   │   ├── Sync/
│   │   └── Settings/
│   └── lib/
│       ├── utils.ts
│       ├── constants.ts
│       └── validations.ts
├── CLAUDE.md
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Data schema (Dexie — 14 tables)

All tables stored in IndexedDB db name: `Shillak_db`. All writes (except `keystore`) encrypted via AES-GCM before storage.

### Keystore *(unencrypted — bootstrap only)*
```ts
interface Keystore {
  id: 1
  salt: string           // base64 Uint8Array (16 bytes) — PBKDF2 salt
  pin_check: string      // base64 AES-GCM ciphertext of "SHILLAK_V1"
  pin_change_in_progress: boolean
}
```
Unencrypted singleton. Bootstrap flow:
1. Read `salt` (no key needed)
2. Derive key: `PBKDF2(enteredPIN, salt)`
3. Decrypt `pin_check` → verify === `"SHILLAK_V1"`
4. Hold key in `key.store.ts` (session memory only)

### User
```ts
interface User {
  user_id: string
  display_name: string
  avatar_color: string     // hex, from group-color palette
  identity_backup_hint: string
  created_at: number
}
```

### Group
```ts
interface Group {
  group_id: string
  name: string
  avatar_color: string
  created_by: string
  currency: string         // ISO 4217
  fiscal_year_start: number  // 1-12, default 4
  split_enabled: boolean
  income_tracking: boolean
  visibility: 'full' | 'totals_only'
  status: 'active' | 'archived'
  group_secret: string     // base64 random 32 bytes
                           // HMAC key for invite signatures
                           // HKDF input for sync transport encryption
                           // rotate via Settings → "Rotate sync key" (Phase 4)
  vector_clock: Record<string, number>
  created_at: number
  updated_at: number
}
```

### GroupMember
```ts
interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'admin' | 'member'
  status: 'active' | 'left'
  joined_at: number
  left_at: number | null
  nickname: string | null
  monthly_income: number | null
  income_currency: string | null
  updated_at: number       // required for LWW conflict resolution
}
// Compound index: [group_id+user_id]
```
**Admin invariant enforcement on sync apply:** after merging all GroupMember records for a group, enforce exactly one admin:
- 0 admins → promote the member with oldest `joined_at`
- 2+ admins → demote all but the one with newest `updated_at`
This runs synchronously after every sync apply, before committing to DB.

### GroupInvite
```ts
interface GroupInvite {
  invite_id: string
  group_id: string
  created_by: string
  method: 'qr' | 'webrtc' | 'json'
  reusable: boolean
  payload: Record<string, unknown>
  signature: string        // HMAC-SHA256(payload, key=group_secret) — NOT group_id
  expires_at: number
  used_by: string[]
  created_at: number
}
```

### Category
```ts
interface Category {
  category_id: string
  group_id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income' | 'transfer'
  sort_order: number
  is_default: boolean
  created_by: string
  created_at: number
}
// Index: group_id
```
Always seed via `createDefaultCategories(groupId, userId)` — never spread raw seed constants.

### Transaction
```ts
interface Transaction {
  txn_id: string
  group_id: string
  owner_id: string         // user_id — who logged it (immutable after creation)
  author_seq: number       // group.vector_clock[owner_id] at write time — for sync delta
  category_id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number           // INTEGER — smallest currency unit (paise for INR, cents for USD)
                           // NEVER store decimal rupees. 1 INR = 100 stored as 100, not 1.0
  currency: string
  fx_rate: number | null   // stored as integer basis points (1.23 rate = 12300). Divide by 10000 to use.
  original_amount: number | null  // also integer, in original currency's smallest unit
  note: string
  tags: string[]
  date: number             // unix ms, date only
  attachment_ids: string[]
  split_id: string | null
  recurrence_id: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}
// Indexes: group_id, owner_id, [group_id+date], [group_id+category_id], [recurrence_id+date]
```
`[recurrence_id+date]` enables O(1) dedup check during recurrence processing.

### Recurrence
```ts
interface Recurrence {
  recurrence_id: string
  group_id: string
  owner_id: string
  template: Omit<Transaction,
    | 'txn_id' | 'date' | 'recurrence_id' | 'author_seq'
    | 'created_at' | 'updated_at' | 'deleted_at' | 'split_id'
  >
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  next_due: number
  last_generated_at: number | null
  end_date: number | null
  active: boolean
  created_at: number
}
// Index: [group_id+owner_id], next_due
```
**Only process recurrences where `owner_id === currentUserId`.** Other users' recurrences are processed on their own devices and arrive via sync as normal transactions. Never increment another user's vector clock.

### Attachment
```ts
interface Attachment {
  attachment_id: string
  group_id: string
  txn_id: string
  mime_type: string
  data: string             // base64 raw bytes (record-level encrypted by ShillakDB)
  size_bytes: number
  created_at: number
}
// Hard limit: 5MB per attachment. Warn user at 80% of storage quota.
// Excluded from QR sync. WebRTC + JSON export only.
```

### Split
```ts
interface SplitShare {
  user_id: string
  amount: number           // integer, smallest currency unit (paise)
  settled: boolean
  settled_at: number | null
}

interface Split {
  split_id: string
  group_id: string
  txn_id: string
  paid_by: string
  total: number
  currency: string
  shares: SplitShare[]
  note: string
  created_at: number
}
// Net balances computed at query time via minimum-transactions algorithm (see Splits section)
```

### Budget
```ts
interface Budget {
  budget_id: string
  group_id: string
  category_id: string
  limit: number            // integer, paise
  period: 'monthly' | 'yearly'
  updated_at: number
}
// Admin-only. Conflict → ConflictLog.
```

### SavingsGoal
```ts
interface SavingsGoal {
  goal_id: string
  group_id: string
  name: string
  target: number           // integer, paise
  saved: number            // integer, paise
  deadline: number | null
  category_id: string | null
  updated_at: number
}
// Admin-only. Conflict → ConflictLog.
```

### SyncEvent
```ts
interface SyncEvent {
  sync_id: string
  group_id: string
  initiated_by: string
  method: 'webrtc' | 'qr' | 'json'
  synced_with: string
  records_sent: number
  records_received: number
  conflicts_found: number
  status: 'ok' | 'partial' | 'failed'
  synced_at: number
}
// Audit log. Never deleted.
```

### ConflictLog
```ts
interface ConflictLog {
  conflict_id: string
  group_id: string
  sync_id: string
  entity_type: 'transaction' | 'budget' | 'goal'
  entity_id: string
  local_value: Record<string, unknown>
  remote_value: Record<string, unknown>
  resolved_by: string | null
  resolution: 'local' | 'remote' | 'pending'
  created_at: number
  resolved_at: number | null
}
```

---

## Dexie architecture (`db/db.ts`)

### Subclass pattern — encryption wrapper

Dexie's `table.hook('reading')` is synchronous — Web Crypto is async. **Never use reading hooks for decryption.** Instead, subclass Dexie and wrap all read/write paths:

```ts
// db/db.ts
class ShillakDB extends Dexie {
  transactions!: Dexie.Table<Transaction, string>
  // ... all other tables
  keystore!: Dexie.Table<Keystore, number>  // NOT encrypted

  constructor() {
    super('Shillak_db')
    this.version(1).stores({
      keystore:     'id',
      users:        'user_id',
      groups:       'group_id',
      groupMembers: 'id, [group_id+user_id]',
      groupInvites: 'invite_id, group_id',
      categories:   'category_id, group_id',
      transactions: 'txn_id, group_id, owner_id, [group_id+date], [group_id+category_id], [recurrence_id+date]',
      recurrences:  'recurrence_id, [group_id+owner_id], next_due',
      attachments:  'attachment_id, txn_id, group_id',
      splits:       'split_id, group_id, txn_id',
      budgets:      'budget_id, group_id',
      savingsGoals: 'goal_id, group_id',
      syncEvents:   'sync_id, group_id',
      conflictLogs: 'conflict_id, group_id',
    })
  }

  // Override get/toArray/bulkGet etc. to decrypt after read
  // Override add/put/bulkAdd/bulkPut to encrypt before write
  // keystore table bypasses encrypt/decrypt entirely
}

export const db = new ShillakDB()
```

All query methods that return records must pass through `decryptRecord(record, key)`. All write methods must pass through `encryptRecord(record, key)`. The key is read from `key.store.ts` (never from DB). If key is null (locked), throw `AppLockedError` — caught at the top-level error boundary.

**Complete list of methods to override in ShillakDB:**
```ts
// Writes — encrypt input before Dexie sees it:
//   Table.add(), Table.put(), Table.bulkAdd(), Table.bulkPut(), Table.update()
//
// Reads — decrypt output after Dexie returns it:
//   Table.get(), Table.bulkGet()
//   Collection.toArray(), Collection.first(), Collection.last(), Collection.sortBy()
//   Table.toArray(), Table.orderBy().toArray() (these go through Collection internally)
//
// keystore table: bypass encrypt/decrypt entirely on all of the above
//
// Do NOT override: Table.where() itself (returns Collection, not records)
// DO override: every Collection terminal method that materialises records
```

The safest pattern: create an `EncryptedTable<T>` wrapper class that proxies a `Dexie.Table<EncryptedRecord, string>` and handles all encrypt/decrypt at the boundary. `ShillakDB` exposes `EncryptedTable` instances, never raw `Dexie.Table` (except `keystore`).

### Schema versioning

Every schema change requires a new `db.version(N)` entry. Migrations that transform encrypted records need the key to be in memory — they will fail if the app is locked. Rule: if `pin_change_in_progress` is false and `version < current`, prompt unlock before opening DB.

```ts
// Example future migration
this.version(2).stores({ transactions: '..., new_index' }).upgrade(async tx => {
  const key = getKeyFromStore()  // throws AppLockedError if locked
  const all = await tx.table('transactions').toArray()
  for (const rec of all) {
    const decrypted = await decryptRecord(rec, key)
    const updated = { ...decrypted, new_field: defaultValue }
    await tx.table('transactions').put(await encryptRecord(updated, key))
  }
})
```

Lock current schema as **version 1**. Never amend version 1 stores.

---

## Encryption

### Key model
One AES-256-GCM key per device, derived from PIN + salt. All groups on the device share this key. `group_secret` is a separate per-group secret for invite signing and sync transport only — stored encrypted in the DB.

### Key storage (`src/stores/key.store.ts`)
```ts
// NEVER add zustand/middleware/persist to this store.
// CryptoKey is non-extractable — serializing it produces {}.
// This store is session-only: key clears on lock, tab close, and page reload.
interface KeyStore {
  key: CryptoKey | null
  setKey: (k: CryptoKey) => void
  clearKey: () => void
}
```

### Multi-tab lock sync
Use `BroadcastChannel('shillak-lock')` to sync lock state across tabs:
- On lock: broadcast `{ type: 'lock' }` → all tabs clear key and show PIN screen
- On unlock: broadcast `{ type: 'unlock' }` → tabs re-derive key from same salt (no PIN re-entry needed if unlock happened within 30s)

### Keystore bootstrap (`src/crypto/keystore.ts`)
```ts
// First PIN set:
const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await deriveKey(pin, salt)
const pin_check = await encrypt('SHILLAK_V1', key)
await db.keystore.put({ id: 1, salt: toBase64(salt), pin_check, pin_change_in_progress: false })

// Every unlock:
const { salt, pin_check } = await db.keystore.get(1)
const key = await deriveKey(pin, fromBase64(salt))
await decrypt(pin_check, key)  // throws DOMException if PIN wrong — catch and show "Wrong PIN"
keyStore.setKey(key)
broadcastChannel.postMessage({ type: 'unlock' })
```

### PIN derivation (`src/crypto/pin.ts`)
```ts
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}
```

### PIN change flow
Blocking operation with progress UI. Requires both old and new PIN.
1. Verify old PIN → get `currentKey`
2. Derive `newKey` with new salt
3. Set `pin_change_in_progress: true` in keystore
4. For each encrypted table: read all → decrypt with `currentKey` → re-encrypt with `newKey` → write back
5. Commit new keystore (`salt`, `pin_check`, `pin_change_in_progress: false`)

On launch: if `pin_change_in_progress === true`, prompt both PINs and resume. Re-encryption is idempotent — records that were already migrated fail to decrypt with `currentKey`, log warning, skip.

### App lock
- Locks after 5 minutes background (Page Visibility API)
- `CryptoKey` cleared from `key.store.ts`
- BroadcastChannel lock event sent to all tabs
- Re-entry requires PIN
- Biometric (WebAuthn) as v2 unlock shortcut

---

## Sync architecture

### Overview
Three fully offline sync methods. No server required for any of them.

| Method | Requires internet? | Use case |
|--------|--------------------|----------|
| Local WiFi (WebRTC) | No | Same room, same network |
| QR batch | No | Offline, different locations |
| JSON export/import | No | Async, any distance |

### Transport encryption
All sync payloads encrypted with a key derived from `group_secret` before transmission:

```ts
// sync/transport.ts
async function deriveTransportKey(groupSecret: string): Promise<CryptoKey> {
  const raw = fromBase64(groupSecret)
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('shillak-sync-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}
```

Sync payloads are decrypted records — device key is NOT used for transport. Transport key is derived from `group_secret` which both devices share.

### Tier 1 — Local WiFi (WebRTC, fully offline)

Uses raw `RTCPeerConnection` + `RTCDataChannel`. No signaling server. SDP exchanged via QR codes.

**Why no STUN needed:** On local WiFi, both devices have directly reachable LAN IPs (192.168.x.x). ICE gathers local candidates without STUN. `iceServers: []`.

**SDP size:** A data-channel SDP + local ICE candidates is ~1–2KB plain, ~600–800 bytes after lz-string compression — fits in one QR (version 40, error level M, ~1850 alphanumeric chars capacity).

```
Flow:
Device A                           Device B
────────────────────────────────────────────
Open sync screen
createOffer()
setLocalDescription(offer)
Wait for ICE gathering complete
Compress offer SDP → QR ──────────────────→ Scan QR
                                   setRemoteDescription(offer)
                                   createAnswer()
                                   setLocalDescription(answer)
                                   Wait for ICE gathering complete
Scan QR ←────────────────────────── Compress answer SDP → QR
setRemoteDescription(answer)
RTCDataChannel opens ◄────────────────────► RTCDataChannel opens
Exchange vector clocks
Compute deltas
Encrypt with transportKey
Send delta ◄──────────────────────────────► Send delta
Apply received delta
Run admin invariant check
Log SyncEvent
```

### Tier 2 — QR batch (offline, unidirectional)

For when devices are not on the same network. Exporter → Importer only (not bidirectional).

1. Exporter computes delta, encrypts with transport key
2. Target chunk size: **≤600 bytes** of raw data (after encryption, base64, and JSON wrapper, fits within QR capacity)
3. Chunk 0: `{ v: 1, total_chunks, group_id, vector_clock, chunk_index: 0, data }`
4. Other chunks: `{ v: 1, chunk_index, total_chunks, group_id, data }`
5. Display carousel — importer scans each. UI shows which indices are still missing.
6. On all chunks received: reassemble → decrypt → apply delta → log SyncEvent
7. Attachments excluded (size). WebRTC or JSON export for attachments.

### Tier 3 — JSON export/import (fully offline, async)

1. Export: full group snapshot, transport-encrypted → `.shillak` file
2. Import: load file → decrypt → merge via vector clock → conflict detection
3. `group_secret` not included in JSON export (it's already on the importer's device from the join flow)

### Vector clock + delta calculation

```ts
// On every local write:
//   1. group.vector_clock[myUserId]++
//   2. record.author_seq = group.vector_clock[myUserId]
//
// On sync handshake, exchange full vector clocks.
//
// My delta for peer:
//   records where owner_id === peerId && author_seq > myKnownClock[peerId]
//
// After applying delta:
//   for each userId: group.vector_clock[userId] = max(local[userId], remote[userId])
```

**Only increment your own clock.** `incrementVectorClock(groupId, userId)` must assert `userId === currentUserId` and throw if not.

### Conflict resolution

| Entity | Strategy | Notes |
|--------|----------|-------|
| Transaction (own) | No conflict | owner_id scoped |
| Transaction (edited by other) | LWW by updated_at | |
| Transaction (deleted one side, edited other) | ConflictLog → user | Destructive |
| Budget | ConflictLog → user | High stakes |
| SavingsGoal | ConflictLog → user | High stakes |
| Category | LWW by updated_at | |
| GroupMember | LWW by updated_at + admin invariant | See invariant rule above |

---

## Splits — net balance algorithm

Net balances are never stored. Computed at query time via minimum-transactions debt simplification:

```ts
// 1. Build net balance map: how much each person owes/is owed overall
function computeNetBalances(splits: Split[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const split of splits) {
    for (const share of split.shares.filter(s => !s.settled)) {
      if (share.user_id === split.paid_by) continue
      // paid_by is owed `share.amount` by share.user_id
      balances.set(split.paid_by, (balances.get(split.paid_by) ?? 0) + share.amount)
      balances.set(share.user_id, (balances.get(share.user_id) ?? 0) - share.amount)
    }
  }
  return balances
}

// 2. Minimum transactions algorithm (greedy)
// Produces the smallest set of transfers that clears all debts
function minimizeTransfers(balances: Map<string, number>): Array<{ from: string, to: string, amount: number }> {
  const creditors = [...balances.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const debtors   = [...balances.entries()].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])
  const result = []
  let i = 0, j = 0
  while (i < creditors.length && j < debtors.length) {
    const [creditor, credit] = creditors[i]
    const [debtor,   debt]   = debtors[j]
    const amount = Math.min(credit, -debt)
    result.push({ from: debtor, to: creditor, amount })
    creditors[i][1] -= amount
    debtors[j][1]   += amount
    if (creditors[i][1] === 0) i++
    if (debtors[j][1]   === 0) j++
  }
  return result
}
```

The Splits tab shows the output of `minimizeTransfers` — minimum number of payments to clear all debts.

---

## Sync — adding a new member (join flow)

### Via QR code
1. Admin: Settings → Members → Add Member → Show QR
2. QR payload: `{ invite_id, group_id, group_name, group_color, split_enabled, income_tracking, created_by_name, expires_at, member_count, group_secret, signature }`
3. `signature = HMAC-SHA256(payload_without_signature, group_secret)`
4. New member scans → verifies signature → sees group preview → taps "Join"
5. App creates GroupMember, stores `group_secret` encrypted
6. Immediately initiates Local WiFi sync with admin to get full history
7. If not on same WiFi: admin exports JSON snapshot, shares manually

### Via JSON invite file
1. Admin exports invite file (group snapshot + invite payload including `group_secret`)
2. New member imports → joins with snapshot
3. Next sync uses normal delta flow

### 6-digit code
Removed — required a PeerJS signaling server. Replaced by QR-based WebRTC (Tier 1) and JSON invite (Tier 3).

---

## App boot sequence

Every launch runs this sequence before any route is rendered. Lives in `<AppBootstrap>` which wraps the router.

```
app launches
    │
    ▼
db.open()  ──── throws ──────────────────────► <StorageErrorScreen> (dead end)
    │
    ▼
keystore.get(1)
    │
    ├── null ───────────────────────────────► <Onboarding> (first launch)
    │
    ▼
User record exists?
    │
    ├── no ────────────────────────────────► <Onboarding> (keystore exists but no user — corrupted state, treat as fresh)
    │
    ▼
<PinScreen>  ──── correct PIN ──────────────► deriveKey → keyStore.setKey(key)
    │                                              │
    │                                              ▼
    │                                         processRecurrences(activeGroupId)
    │                                              │
    │                                              ▼
    │                                         <Router> → /  (Dashboard)
    │
    └── wrong PIN ──────────────────────────► show error, increment attempt counter
                                              (v2: lockout after 10 failed attempts)
```

```tsx
// src/App.tsx
export function App() {
  return (
    <AppBootstrap>        {/* handles db.open(), keystore check, PIN gate */}
      <RouterProvider router={router} />
    </AppBootstrap>
  )
}
```

`AppBootstrap` renders one of: `<StorageErrorScreen>`, `<Onboarding>`, `<PinScreen>`, or children (the actual app). It never renders children until `keyStore.key` is non-null.

---

## Onboarding flow (first launch)

```
Launch
  ↓
[No User found in DB / keystore empty]
  ↓
Screen 1: Welcome — "Your private group ledger"
  ↓
Screen 2: Create profile — Name + avatar color + PIN (required)
           → writes keystore (salt + pin_check), creates User record
  ↓
Screen 3: Choice — "Create a new group" | "Join existing group"
  ↓
[Create path]                        [Join path]
Screen 4: Group name + currency +    Screen 4: Scan invite QR | Import .shillak file
          fiscal year + split? +
          income tracking?
  ↓                                   ↓
Screen 5: Add members now or later   Screen 5: Syncing history...
  ↓                                   ↓
Dashboard                            Dashboard
```

### DB open failure
If `db.open()` throws (private browsing, storage blocked, quota exceeded), show a full-screen error: "Storage unavailable — Shillak requires persistent storage. Check your browser settings." Do not attempt to proceed. Provide a link to browser-specific instructions.

---

## Screen map (5 bottom nav tabs)

### 1. Dashboard (`/`)
- Active group switcher (top, pill carousel)
- Month selector (swipeable)
- Total spend vs budget ring chart
- Budget bars per category
- Quick-add FAB
- Upcoming recurring transactions (next 7 days)
- Recent transactions (last 5)

### 2. Transactions (`/transactions`)
- Search + filter (date range, category, person, type)
- Grouped by date
- Each card: category icon + color, amount, owner avatar
- Swipe left: soft delete. Swipe right: edit.

### 3. Budgets (`/budgets`)
- Monthly budget bars
- Savings goals with progress bars
- Admin edits inline
- Month-over-month sparklines

### 4. Splits (`/splits`) — only if `group.split_enabled`
- Minimum-transfer net balances (who pays whom)
- Unsettled split list
- Tap → breakdown + mark settled
- "Settle all with [person]" shortcut

### 5. Settings (`/settings`)
- Group: name, currency, fiscal year, toggles
- Members: list, roles, transfer admin, remove
- Categories: list, add, reorder, edit
- Sync: last sync status, open sync sheet
- Profile: name, PIN change, identity backup export
- Data: export, import, clear, archived groups
- Security: rotate group sync key (Phase 4)

---

## Key UX patterns

### Quick add (FAB)
Bottom sheet: amount numpad → category pill row → note → date → split toggle → submit → optimistic update → Dexie write.

### Conflict resolver
Triggered by `ConflictLog.resolution === 'pending'`. Card: entity type, "Your version" vs "Their version". Actions: Keep mine / Keep theirs / View full record. Never auto-resolved for budget/goal.

### Sync sheet (3 tabs)
- Tab 1: Local WiFi — Step 1 shows offer QR, Step 2 scans answer QR, then shows progress
- Tab 2: QR Batch — chunk carousel + missing-chunk indicator
- Tab 3: JSON — export + import buttons
- Sync log: last N SyncEvent records

### Group switcher
Pill row at Dashboard top. Tap: switch. Long press: context menu. Archived groups shown greyed. "+" to create or join.

### Archived groups
- Archived when last member leaves
- Read-only (no new txns, no edits)
- Accessible: Settings → Archived Groups
- Can export JSON snapshot
- Cannot rejoin — create new group

---

## Identity backup

```ts
interface IdentityBackup {
  version: 1
  user_id: string
  display_name: string
  avatar_color: string
  salt: string        // from keystore — needed to re-derive key on new device
  pin_check: string   // from keystore — verifies PIN on restore
  exported_at: number
}
```

Exported as `.shillak-id`. Not additionally encrypted — contains no transaction data. `pin_check` is already AES-GCM ciphertext requiring the PIN to verify.

**Restore:** New device → import `.shillak-id` → enter PIN → derive key from `backup.salt` → verify → restore User + keystore → show "Join a group" screen.

---

## PWA config

```ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icons/*.png'],
  manifest: {
    name: 'Shillak',
    short_name: 'Shillak',
    description: 'Private group budget tracker',
    theme_color: '#0f0f0f',
    background_color: '#0f0f0f',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: []
  }
})
```

**Service worker constraint:** The Workbox service worker caches the app shell only. It must **never** read or write IndexedDB — it has no access to the in-memory CryptoKey and would either crash or produce unencrypted writes. Do not register a Share Target or Background Sync handler that touches Dexie.

---

## Recurrence processing

On app launch and every foreground event:

```ts
async function processRecurrences(groupId: string, currentUserId: string) {
  // Only process own recurrences — never increment another user's vector clock
  const due = await db.recurrences
    .where('next_due').belowOrEqual(Date.now())
    .and(r => r.group_id === groupId && r.owner_id === currentUserId && r.active)
    .toArray()

  for (const rec of due) {
    // Catch up fully in one launch — loop until next_due > today
    let dueDate = rec.next_due
    while (dueDate <= Date.now()) {
      const existing = await db.transactions
        .where('[recurrence_id+date]')
        .equals([rec.recurrence_id, dueDate])
        .first()

      if (!existing) {
        const seq = await incrementVectorClock(groupId, currentUserId)
        await db.transactions.add({
          ...rec.template,
          txn_id: crypto.randomUUID(),
          date: dueDate,
          recurrence_id: rec.recurrence_id,
          author_seq: seq,
          split_id: null,
          deleted_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }

      dueDate = advanceDate(dueDate, rec.frequency, rec.interval)
      if (rec.end_date && dueDate > rec.end_date) break
    }

    await db.recurrences.update(rec.recurrence_id, {
      next_due: dueDate,
      last_generated_at: Date.now(),
    })
  }
}
```

---

## `advanceDate` — recurrence date arithmetic

Month-end arithmetic in JavaScript overflows silently (Jan 31 + 1 month → Mar 2). Always clamp to the last valid day of the target month.

```ts
// src/lib/utils.ts
export function advanceDate(
  date: number,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval: number
): number {
  const d = new Date(date)
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + interval)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval)
      break
    case 'monthly': {
      const targetMonth = d.getMonth() + interval
      const day = d.getDate()
      // Set to 1st of target month first, then clamp day
      d.setDate(1)
      d.setMonth(targetMonth)
      // Clamp: last day of target month
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(day, lastDay))
      break
    }
    case 'yearly': {
      const day = d.getDate()
      const month = d.getMonth()
      d.setFullYear(d.getFullYear() + interval)
      // Handle Feb 29 → Feb 28 on non-leap years
      const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate()
      d.setDate(Math.min(day, lastDay))
      break
    }
  }
  // Strip time — store date-only as start of day UTC
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}
```

All `Transaction.date` values must be midnight UTC (start of day). Use `Date.UTC(y, m, d)` — never `Date.now()` — when setting a date-only field.

---

## Money — integer arithmetic

All monetary amounts stored as **integers in the smallest currency unit.**

| Currency | Unit | Example |
|----------|------|---------|
| INR | paise | ₹1,234.56 stored as `123456` |
| USD | cents | $12.34 stored as `1234` |

```ts
// src/lib/utils.ts

/** Convert rupees (user input) to paise (storage) */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100)  // Math.round avoids 1.005 * 100 = 100.49999...
}

/** Format paise for display */
export function formatCurrency(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(paise / 100)
}

/** fx_rate stored as basis points (integer). 1 USD = 83.50 INR → stored as 835000 */
export function applyFxRate(amountInOriginal: number, fxRateBasisPoints: number): number {
  return Math.round((amountInOriginal * fxRateBasisPoints) / 10000)
}
```

**Never accept a `number` with a decimal as an amount anywhere in the codebase.** Form inputs parse to paise immediately via `toPaise()`. All arithmetic (budget comparisons, split totals, balance calculations) operates on integers only.

---

## Indian defaults

```ts
// src/db/seeds.ts
// Always use createDefaultCategories(groupId, userId) — stamps all required fields.

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Groceries',     icon: 'shopping-cart',  color: '#22c55e' },
  { name: 'Rent',          icon: 'home',           color: '#6366f1' },
  { name: 'Transport',     icon: 'car',            color: '#3b82f6' },
  { name: 'EMI',           icon: 'credit-card',    color: '#ef4444' },
  { name: 'Utilities',     icon: 'zap',            color: '#f59e0b' },
  { name: 'Health',        icon: 'heart-pulse',    color: '#ec4899' },
  { name: 'Entertainment', icon: 'tv',             color: '#8b5cf6' },
  { name: 'Dining',        icon: 'utensils',       color: '#f97316' },
  { name: 'Shopping',      icon: 'bag',            color: '#14b8a6' },
  { name: 'Education',     icon: 'book-open',      color: '#06b6d4' },
  { name: 'Insurance',     icon: 'shield',         color: '#84cc16' },
  { name: 'Fuel',          icon: 'fuel',           color: '#eab308' },
  { name: 'Household',     icon: 'wrench',         color: '#64748b' },
  { name: 'Personal Care', icon: 'sparkles',       color: '#f43f5e' },
  { name: 'Other',         icon: 'circle-dot',     color: '#888888' },
]

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary',             icon: 'briefcase',   color: '#22c55e' },
  { name: 'Freelance',          icon: 'laptop',      color: '#3b82f6' },
  { name: 'Investment Returns', icon: 'trending-up', color: '#f59e0b' },
  { name: 'Other Income',       icon: 'plus-circle', color: '#888888' },
]
```

- Default currency: INR (₹)
- Formatting: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
- Fiscal year: April (month 4)

---

## Storage quota

```ts
// Check before saving any attachment
async function checkStorageQuota(): Promise<{ ok: boolean; usedPercent: number }> {
  const { usage, quota } = await navigator.storage.estimate()
  const usedPercent = ((usage ?? 0) / (quota ?? 1)) * 100
  return { ok: usedPercent < 80, usedPercent }
}
```

- Hard limit: 5MB per attachment (enforce at upload)
- Warn user when overall quota > 80%
- Block attachment upload when quota > 90%
- Safari default IndexedDB cap: ~50MB — surface this clearly if `quota < 100MB`

---

## Build commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
pnpm lint
```

---

## Development priorities (build order)

### Phase 1 — Core (MVP) ✅ COMPLETE
1. ShillakDB subclass (`EncryptedTable` wrapper) + keystore + encryption
2. `AppBootstrap` boot sequence + React Router v6 skeleton
3. `lib/utils.ts` — `toPaise`, `formatCurrency`, `advanceDate`, `applyFxRate`
4. Onboarding (profile + first group + PIN)
5. Dashboard (monthly summary, budget bars, spending donut, monthly bar chart)
6. Quick-add FAB + bottom sheet
7. Transaction list

### Phase 2 — Groups ✅ COMPLETE
6. Group settings + member management (admin invariant enforced)
7. Category management
8. Recurrence setup UI
9. Multi-group switcher (GroupSwitcher pill row on Dashboard)

### Phase 3 — Sync ✅ COMPLETE
10. ✅ JSON export/import (`src/sync/json.ts` + Settings Data section)
11. ✅ Local WiFi sync (WebRTC, manual SDP via QR) — `src/sync/webrtc.ts`
12. ✅ QR batch sync — `src/sync/qr.ts`
13. ✅ Sync sheet UI (3 tabs: WiFi / QR Batch / History) — `src/components/sync/SyncSheet.tsx`
14. ✅ QR display + scanner — `src/components/sync/QRDisplay.tsx`, `QRScanner.tsx`
15. ✅ Conflict resolver UI — `src/components/sync/ConflictResolver.tsx`
16. ✅ Transport encryption — `src/sync/transport.ts` (HKDF from group_secret)
17. ✅ Vector clock + delta — `src/sync/vector-clock.ts`
18. ✅ Apply delta + admin invariant — `src/sync/conflict.ts`
19. ⬜ Invite member via QR (GroupChoiceScreen "Join" still disabled — needs invite flow)

### Phase 4 — Polish ✅ MOSTLY COMPLETE
14. ✅ Splits tab + minimum-transfer algorithm
15. ✅ Charts (SpendingDonut, MonthlyBar, GoalProgress with recharts + shadcn ChartContainer)
16. ✅ Type filter on transactions (All/Expense/Income chips)
17. ✅ Transaction edit sheet (TransactionEditSheet)
18. ✅ Budget overrun alerts (AlertTriangle banners on BudgetsPage, ≥80% threshold)
19. ✅ App lock (PIN gate, Page Visibility API, BroadcastChannel multi-tab)
20. ✅ PIN change (re-encryption with progress UI — ChangePinSheet)
21. ✅ Identity backup export/restore (`.shillak-id` — Settings + GroupChoiceScreen)
22. ✅ Storage quota warnings (Settings → Data section, bar + warn/block messages)
23. ✅ Full transaction search (date range, category, person filters + collapsible filter panel)
24. ✅ Swipe gestures on transaction cards (left = delete, right = edit via SwipeCard component)
25. ✅ Budget month-over-month sparklines (6-bar SVG per budget card, last 6 months)
26. ✅ PWA — offline support, install prompt, update banner (`PWAManager.tsx`, `registerType: 'prompt'`, workbox navigateFallback + cleanupOutdatedCaches)
27. ⬜ Group secret rotation (Settings → Security → "Rotate sync key")
28. ⬜ Biometric unlock (WebAuthn as PIN shortcut — Phase 4 v2)
29. ⬜ Second group creation / join from inside the app (Settings or GroupSwitcher "+")

---

## Key constraints for Claude Code

- **All amounts are integers (paise).** Never store decimal rupees. Parse user input with `toPaise()` immediately. All arithmetic on integers only.
- **All dates are midnight UTC.** Use `Date.UTC(y, m, d)` for date-only fields. Never `Date.now()` for a transaction date.
- **`advanceDate` for all recurrence arithmetic.** Never manipulate `Date` month fields directly — use the clamping helper.
- **Router: React Router v6.** Routes defined in `src/App.tsx`. `<AppBootstrap>` gates all routes behind PIN unlock.
- **No route renders without a valid key.** `<AppBootstrap>` must return null/spinner/lock screen if `keyStore.key === null`.
- **No backend.** No Express, Supabase, Firebase, or any server. Dexie only.
- **No localStorage for sensitive data.** Encrypted Dexie layer only.
- **TypeScript strict.** No `any`. No `as unknown`.
- **Mobile first.** Max 430px. Test at 390px.
- **Soft deletes only.** Never `db.transactions.delete()`. Always `deleted_at = Date.now()`.
- **Encryption via ShillakDB subclass**, not Dexie hooks. Hooks are sync; Web Crypto is async.
- **`keystore` table is never encrypted.** All other tables always are.
- **Service worker never touches Dexie.** No background sync, no share target handlers that read/write DB.
- **`key.store.ts` never uses Zustand persist middleware.** Session memory only.
- **Multi-tab lock via BroadcastChannel.** Lock one tab → all tabs lock.
- **Only process own recurrences** (`owner_id === currentUserId`). Catch up fully in one loop per launch.
- **Never increment another user's vector clock.** `incrementVectorClock` asserts `userId === currentUserId`.
- **Admin invariant enforced after every sync apply.** 0 admins → promote oldest. 2+ admins → keep newest updated_at.
- **Conflict resolution never silent for budget/goal.** Always ConflictLog + user prompt.
- **Vector clock per group.** Stamp `author_seq` on every write.
- **One AES key per device.** Never per-group keys.
- **`group_secret` as HMAC key.** Never `group_id`.
- **`useLiveQuery` for raw reads. TanStack Query for derived values only.** Never mix for same source.
- **Never spread raw seed constants** into Dexie. Always `createDefaultCategories(groupId, userId)`.
- **QR chunk target ≤600 bytes** of raw data (leaves room for encryption overhead + base64 + JSON wrapper).
- **DB open failure → full-screen error.** Never silently fail or proceed without storage.
- **Attachment hard limit: 5MB.** Warn at 80% storage quota. Block at 90%.
- **Dexie schema versioning:** lock version 1. All future changes use `db.version(N).stores().upgrade()` with key in memory.

---

*Last updated: architecture reviewed by senior developer — schema locked, build not started.*
*Built with Claude Code. Context window: see this file.*
