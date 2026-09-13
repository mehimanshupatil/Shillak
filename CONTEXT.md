# Shillak

Household finance for couples and families with pooled finances. Both partners treat
spending as "our money" — there are no IOUs and no splits, so the model has no concept of
who owes whom.

## Language

### The household

**Space**:
One household's finances, isolated from every other. A device may hold several.
_Avoid_: group, household, account, workspace — though note that code symbols keep the
`group*` spelling (`groupId`, `groupSecret`, `db.groups`); the rename is user-facing only.

**Member**:
A person who belongs to a Space.
_Avoid_: user, partner, participant.

### The ledger

**Ledger**:
A Space's transaction history — every Commit, Amend and Void that has ever landed.
_Avoid_: book, journal, history.

**Base currency**:
The Space's own currency. Every figure drawn from the Ledger is presented in it, whatever
currency the transaction was originally entered in.
_Avoid_: default currency, home currency, local currency.

**Draft**:
A validated statement of intent to change the Ledger, not yet part of it. A Draft names
what kind of change it is, so a transfer Draft and an expense Draft are different things
rather than one shape with unused fields.
_Avoid_: form state, input, payload, DTO.

**Commit**:
Adding a new transaction to the Ledger from a Draft.
_Avoid_: create, add, save, insert.

**Amend**:
Replacing an existing transaction's details from a Draft. The transaction keeps its
identity and its original author.
_Avoid_: edit, update, patch.

**Void**:
Withdrawing a transaction from the Ledger. A voided transaction is never erased — it stays
so that other Members' devices can learn it was withdrawn.
_Avoid_: delete, remove, archive.

### Sharing between devices

**Sync session**:
One negotiated exchange between two Members' devices, from the first scan to the
acknowledged apply. A session has exactly two participants and one initiator.
_Avoid_: connection, pairing, handshake, transfer.

**Courier**:
How the bytes of a Sync session cross between two devices. A Space's history can travel by
more than one Courier; which one is in use changes nothing about what arrives.
_Avoid_: channel, transport, tier.

**Delta**:
The records one device holds that its peer has not seen yet, determined by what each side
already knows of the other's history.
_Avoid_: diff, changeset, patch, payload.

**Snapshot**:
A complete copy of a Space taken at one moment, for restoring onto another device. Not a
Sync session — it has no peer and nothing is negotiated.
_Avoid_: backup, export, dump.

### Kinds of spending

**Transfer**:
Movement of money between two of the household's own accounts. It is neither spending nor
earning, so it never counts toward any expense or income figure.
_Avoid_: internal payment, move.

**Fixed outflow**:
Committed, non-discretionary spending — rent, an EMI, a SIP. A distinction that applies to
expenses only; income is never fixed.
_Avoid_: recurring, bill, mandatory expense.
