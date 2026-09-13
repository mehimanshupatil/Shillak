# Atomic multi-table writes via a staging layer, not a raw Dexie transaction

**Status:** accepted

Multi-table writes (recurrence generation, conflict resolution, sync apply) needed
atomicity — a crash or thrown error partway through shouldn't leave some tables written
and others not. The obvious fix, wrapping the sequence in `db.transaction('rw', tables,
fn)`, doesn't work here: every `EncryptedTable` read/write does an async Web Crypto
encrypt/decrypt call, and a real IndexedDB transaction auto-commits once no request is
pending and control returns to the event loop — it cannot stay open across that await.
Confirmed directly: a naive `db.transaction()` wrap threw `PrematureCommitError`, and
worse, a "rollback" test showed the first write had already committed despite the
thrown error — silent fake atomicity, worse than no transaction at all.

## Decision

`ShillakDB.atomically(fn)` runs in two phases instead. Phase 1 runs `fn` with every
`EncryptedTable` in "staging" mode: encryption still happens eagerly, but the actual
Dexie write is queued rather than executed, and `get`/`where`/`toArray` check the queue
first — so code inside the atomic block still sees its own not-yet-committed writes
(needed by `enforceAdminInvariant`, which reads members a prior step in the same
`applyDelta` call just wrote). Phase 2 replays the queued writes inside one real Dexie
transaction — now every call is a plain, already-encrypted `table.put()`, a pure
IDB-request promise with no further await on anything else, so it stays correctly
scoped.

## Considered and rejected

- **Wrap in `db.transaction()` directly.** Doesn't work — see above.
- **Accept the risk, skip atomicity for these paths.** Rejected for `applyDelta`
  specifically (the highest-stakes multi-table write, running after every sync) since
  the staging layer, once built, covers all three call sites for the same cost.

## Consequences

- Only `EncryptedTable` writes are covered. `keystoreTable` (unencrypted) isn't staged —
  don't write to it from inside an atomic block.
- Callers write normal-looking code (`await db.transactions.put(x)` etc.) inside
  `db.atomically(fn)` — the staging/replay split is invisible to them.

## Amendment — the consequences are now enforced, not advisory

The design above is unchanged. What changed is that the facts a caller had to hold in
their head are held by the code instead, after each one turned out to be reachable:

- **Atomic blocks cannot nest.** Staging is one shared buffer per table, so a second
  block opened while one is in flight overwrote it and the inner completion discarded
  the outer's writes. Reachable in the UI: the conflict resolver renders above the sync
  tabs while an apply is running. `atomically` now throws rather than silently losing
  writes. Compose by passing one block down, not by nesting.
- **The keystore rule is enforced.** Writes go through `db.keystore()`, which throws
  inside a block. Reads stay on `db.keystoreTable` and are always safe. `ChangePinSheet`
  and `importIdentityBackup` both write it deliberately after the block closes.
- **Reads no longer disagree with each other.** `first()` honours staged writes like
  `get`/`toArray`/`where`/`count` already did. `canDecryptWithKey` deliberately does
  not — a staged row was encrypted with the *active* key, so testing a candidate key
  against it would prove nothing — and now says so.
- **`endStaging()` was two operations wearing one name** — discard, and collect for
  replay — told apart only by whether the caller used the return value. It is now
  `discardStaged()` and `collectStaged()`.
- **Replay order is documented where it is enforced.** `conflict.ts` says categories
  must precede transactions; what actually guarantees it is the array order in
  `encryptedTables()`, which now carries the reason.
- **`where()` stopped claiming to filter soft-deletes.** It never did. The Ledger's
  own `ledgerFrom` is what decides which rows still count.
