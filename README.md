# Shillak

> **शिल्लक** — Marathi for *the balance left*. A privacy-first group finance app.

Shillak is a shared budget tracker for families, flatmates, and trip groups. No server, no login, no cloud. Your financial data never leaves your device.

---

## What it does

- **Track shared expenses** — log income, spending, and transfers across your group
- **Split bills** — see who owes whom with minimum-transfer settlement
- **Budget together** — set monthly limits per category, track savings goals
- **Sync offline** — exchange data via local WiFi (WebRTC), QR codes, or JSON file — no internet required
- **Multi-space** — one install can belong to multiple independent spaces (family, flatmates, trip)

---

## Privacy model

| What | How |
|------|-----|
| Storage | IndexedDB (browser-local only) |
| Encryption | AES-256-GCM, key derived from your PIN via PBKDF2 (200k iterations) |
| Sync | Direct device-to-device — WebRTC on local WiFi, QR batch, or JSON file |
| Server | None. Zero. Never. |
| Analytics | None |
| Accounts | None |

All data is encrypted at rest with a key that exists only in your device's memory while the app is unlocked. Closing the app or backgrounding for 5 minutes locks it automatically.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Local DB | Dexie.js v4 (IndexedDB) |
| Encryption | Web Crypto API (AES-GCM, PBKDF2, HKDF) |
| Sync | Native `RTCPeerConnection` (no signaling server) |
| State | Zustand + TanStack Query |
| PWA | vite-plugin-pwa + Workbox |

---

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. On first launch, set a PIN and create your first space.

```bash
pnpm build      # Production build
pnpm preview    # Preview production build
pnpm typecheck  # TypeScript check
pnpm lint       # Biome lint + format check
```

---

## Sync methods

**Local WiFi (WebRTC)** — both devices on the same network. SDP exchange via QR code, no STUN/TURN needed. Bidirectional, real-time.

**QR Batch** — offline, different locations. Exporter shows a carousel of QR chunks; importer scans each one. Unidirectional.

**JSON export/import** — async, any distance. Export a `.shillak` snapshot file, share it however you like, import on the other device.

---

## Joining a space

1. Admin opens **Settings → Members → Invite** and shows the QR
2. New member opens the app → taps **+** on the space switcher → **Join existing space** → scans QR
3. After joining, sync via **Settings → Sync** (WebRTC or JSON) to get the full transaction history

The invite QR is valid for 24 hours and contains the space's sync key. Generate a new one for each person.

---

## Architecture notes

- **Integer amounts** — all monetary values stored in the smallest currency unit (paise for INR, cents for USD). Never decimal rupees.
- **Soft deletes** — transactions are never hard-deleted; `deleted_at` timestamp used instead.
- **Vector clocks** — each device tracks its own sequence number per space. Sync deltas computed by comparing clocks.
- **Admin invariant** — every space must have exactly one admin. Enforced after every sync merge.
- **Recurrences** — each device only generates its own recurring transactions (by `owner_id`). No cross-device clock increment.

---

## Project structure

```
src/
├── crypto/       # PIN derivation, AES-GCM encrypt/decrypt, keystore bootstrap
├── db/           # Dexie schema, EncryptedTable wrapper, seeds
├── sync/         # WebRTC, QR chunks, JSON export, vector clock, conflict resolution, invite
├── stores/       # Zustand stores (app state, crypto key, sync status)
├── hooks/        # useLiveQuery wrappers
├── components/
│   ├── space/    # Space/group management sheets
│   ├── layout/   # BottomNav, SpaceSwitcher
│   ├── sync/     # SyncSheet, QRDisplay, QRScanner, ConflictResolver
│   ├── transaction/
│   ├── budget/
│   └── charts/
└── pages/
    ├── Dashboard/
    ├── Transactions/
    ├── Budgets/
    ├── Splits/
    └── Settings/
```

---
 