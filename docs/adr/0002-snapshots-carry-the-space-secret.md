# Snapshots carry the Space secret in plaintext

**Status:** accepted

A `.shillak` Snapshot is written as plain JSON and includes the whole `group` row, so it
contains `groupSecret` — the HMAC key behind invite signatures and the HKDF input behind
Sync session transport encryption. The other two Couriers encrypt their payloads *with*
that secret; the Snapshot ships it. This looks like an oversight and isn't, so it's
recorded here to stop it being "fixed" without the trade-off being re-made.

## Decision

The Snapshot is a backup of a Space, not merely of its Ledger. It carries the Space's
identity, which is what lets it restore onto a fresh device with nothing else in hand.
Treat the file as being as sensitive as the PIN, and say so where it's exported.

## Considered and rejected

- **Strip `groupSecret`; restore becomes join-by-invite, then import.** Rejected because it
  breaks the one case where a Snapshot is the only route: a lost or wiped device with no
  second device left to invite from. There is no server and no account, so an invite
  requires another live Member — which a single-device household doesn't have.
- **Encrypt the file with a separate passphrase at export.** Rejected because it adds a
  second secret the user can lose, in an app with no recovery service behind it. Losing
  the passphrase and losing the file have the same outcome, so the protection mostly
  converts "backup compromised" into "backup unusable".

## Consequences

- The export flow must tell the user what the file contains. A Snapshot handed to someone
  else hands them the Space, not a read-only copy of it.
- A Snapshot cannot be used as a "share my numbers" artefact. If that's ever wanted, it
  needs to be a different export that omits the `group` row entirely.
