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
