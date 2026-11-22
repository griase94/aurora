# Shiftbook's domain

Every rule of the product, each beside the test that proves it. The domain is one module: `apply(state, command,
ctx)` in `src/lib/domain/apply.ts` is the only way the world changes, it is synchronous and pure (no Svelte, no
DOM, no real time, no randomness), and the session in `src/lib/session/` is the only way a screen reaches it.

**How this file grows.** One block per rule family, each under its own heading. A family that is not built yet is
a heading with one line; the lane that builds it writes its block and edits no other. Test references are
`file › test name`, both under `tests/unit/`.

## The dispatcher

`apply` looks up the command's family in a handler table that names every family from the first day. A family
that is not built yet refuses every command with `invalid` and `detail.reason: "not built"`.

| Rule                                                                                                   | Proven by                                                       |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `apply` is pure: the same state, command and context give the same outcome, and the input is untouched | `apply.stamp.test.ts › apply: the dispatcher › is pure…`        |
| Every family but `stamp` is a stub that refuses with `invalid`, reason "not built"                     | `apply.stamp.test.ts › every family but stamp is a stub…`       |
| An unknown command type is refused, also one named like a property every object has ("constructor")    | `apply.stamp.test.ts › refuses a command type it does not know` |
| Every command family has its handler file and only `apply.ts` lists them                               | `registries.test.ts`                                            |

## Permissions

`can(world, actor, action)` reads the role from the world, never from the actor, so a stale persona cannot act
beyond its role. Every handler asks it; the screens ask it too, to explain why a control is missing.

| Rule                                                                                          | Proven by                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| An owner may do everything                                                                    | `permissions.test.ts › an owner may do everything`       |
| A manager manages staff, badges, shifts and tips; never reopens a period nor changes settings | `permissions.test.ts › a manager manages staff…`         |
| A manager closes periods and exports only while the owner's switch allows it                  | `permissions.test.ts › a manager closes periods…`        |
| An employee sees their own data, stamps and confirms their own period, nothing else           | `permissions.test.ts › an employee sees their own data…` |
| The role is read from the world, not from the actor                                           | `permissions.test.ts › the role is read from the world…` |
| An unknown or inactive person may do nothing                                                  | `permissions.test.ts › an unknown or inactive person…`   |
| A kiosk may only stamp; the system actor may do everything                                    | `permissions.test.ts › a kiosk may only stamp…`          |

## stamp (rules 1 to 3)

A scan at a kiosk. The employee chooses nothing: an open shift ends now, else a shift begins now.

| Rule                                                                                                                                   | Proven by                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A scan without an open shift begins one now                                                                                            | `apply.stamp.test.ts › rule 1, stamp › a scan without an open shift begins one now…` |
| The next valid scan ends it, to the minute                                                                                             | `apply.stamp.test.ts › the next valid scan ends it…`                                 |
| An open shift from yesterday ends at the next scan                                                                                     | `apply.stamp.test.ts › an open shift from yesterday ends…`                           |
| An unknown code is refused with `unknown_token` and changes nothing                                                                    | `apply.stamp.test.ts › an unknown code is refused…`                                  |
| A locked or replaced badge is refused with `locked_token`                                                                              | `apply.stamp.test.ts › a locked or replaced badge…`                                  |
| A person who is not active is refused with `inactive_person`                                                                           | `apply.stamp.test.ts › a person who is not active…`                                  |
| A second scan within `scanRepeatSeconds` is a `duplicate_scan` with the earlier result and books nothing                               | `apply.stamp.test.ts › a second scan within scanRepeatSeconds…`                      |
| Instants are minute-exact, so the window reaches one minute further: two scans seconds apart across a minute boundary are a repeat too | `apply.stamp.test.ts › a double scan two seconds apart across a minute boundary…`    |
| A branch that does not exist is refused at the location field                                                                          | `apply.stamp.test.ts › a branch that does not exist…`                                |
| A kiosk stamps only at its own branch; anything else is `forbidden` at the location field                                              | `apply.stamp.test.ts › a kiosk stamps only at its own branch`                        |
| A person stamps only with their own badge; a colleague's is `forbidden` at the code field                                              | `apply.stamp.test.ts › a person stamps only their own badge…`                        |
| Rule 2, minute-exact: an instant is truncated to its minute when it is taken; nothing is rounded                                       | `apply.stamp.test.ts › rule 2, minute-exact`, `time.test.ts › rule 2, minute-exact`  |
| Rule 3, open shifts: an open shift turns into a warning at the threshold and is never ended by itself                                  | `apply.stamp.test.ts › rule 3, open shifts`                                          |

## person

Not built yet: creating, editing and retiring people, with the tenant's personnel fields.

## token

Not built yet: issuing, locking and replacing badges. Codes are drawn by the committing tab and replayed from the
log (see the storage format below).

## shift (rule 4, corrections)

Not built yet: `shift.correct` and `shift.add`, each with a reason, refusing an end before the begin, an overlap
and a closed period.

## conflict (rule 9, offline stamps)

Not built yet: a queued stamp that no longer fits becomes a conflict with one proposed change; resolving it
applies or discards that change with a reason.

## device (rule 11)

Not built yet: a kiosk's report of its clock, its waiting stamps and its failed deliveries.

## tip (rule 5)

Not built yet: entries per tip-eligible person, changes and removals with a reason.

## import

Not built yet: card-tips files, skipping rows already imported and reporting them.

## period (rules 6 and 8)

The period arithmetic is built; the commands that request confirmations, close and reopen are not.

| Rule                                                                                                                                                 | Proven by                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A period starts on the tenant's start day, clamped to the last day of a shorter month (start days 1, 21, 29, 30, 31; April, February, leap February) | `periods.test.ts › rule 6, periods: the start day is clamped…` |
| A shift belongs to the period of its begin, as a local date at its location (the edge shift from 22:00 on the last day)                              | `periods.test.ts › rule 6, membership…`                        |
| `periodStatus`: `closed`, else `confirming`, else `review` once the end has passed, else `running`                                                   | `periods.test.ts › rule 6, periodStatus`                       |

## confirmation (rule 7)

Not built yet: a person confirms a period's version; the version is a hash over the hashed fields only, so a
confirmation turns stale without an invalidation step.

## settings

Not built yet: the tenant's thresholds, start day and personnel fields.

## roles

Not built yet: the owner's switch that lets managers close periods and export.

## Audit (rule 10)

| Rule                                                                                             | Proven by                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Every accepted command by a person or a kiosk appends at least one event; a refusal appends none | `apply.stamp.test.ts › rule 10, audit` |
| `apply` appends the handler's events itself, so no handler can forget the trail                  | `apply.stamp.test.ts › rule 10, audit` |

## Time

Shifts are instants; a branch has an IANA zone; wall times exist only where a person reads or types them. The
implementation runs on `@internationalized/date` behind `src/lib/domain/time.ts` (ledger row G-018) until the kit's
date engine has instants.

| Rule                                                                                              | Proven by                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| The runtime's zone data has the 2026 transitions of Berlin and Helsinki (checked before any rule) | `time.test.ts › the runtime's time-zone data`                           |
| A night shift over the autumn change lasts 8 h and includes the change (+1 h)                     | `time.test.ts › the time table › a night shift over the autumn change…` |
| A night shift over the spring change lasts 6 h and includes the change (−1 h)                     | `time.test.ts › a night shift over the spring change…`                  |
| In 02:50 summer time, out 02:10 winter time is 20 minutes with two offsets                        | `time.test.ts › a scan in the repeated hour…`                           |
| A wall time in the spring gap is refused with the time an hour later as a suggestion              | `time.test.ts › a wall time typed into the spring gap…`                 |
| A wall time in the repeated hour offers both instants and picks neither                           | `time.test.ts › a wall time typed into the repeated hour…`              |
| Another branch changes by its own zone                                                            | `time.test.ts › the same night in Helsinki…`                            |
| A shift over midnight counts for the day of its begin                                             | `time.test.ts › a shift over midnight…`                                 |
| Each branch's time in its own zone                                                                | `time.test.ts › a branch in another zone…`                              |
| Nothing reads the device's zone                                                                   | `time.test.ts › a device far away`                                      |

## Money

Amounts are integer minor units from the field to the export. Sums are integer additions.

| Rule                                                                     | Proven by                                 |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| Sums equal the entries for any list of random amounts, and stay integers | `money.test.ts › sums equal the entries…` |
| A float is refused, so it can never enter a sum                          | `money.test.ts › refuses a float…`        |
| No screen divides by 100, calls `toFixed` or `parseFloat`                | `kit-only.test.ts`                        |

## Selectors and issues

Selectors are pure functions of the world (and `now` where time matters), one file per area, all re-exported by
`selectors/index.ts`. `issues` is the one place that knows what is wrong: it asks every area's source and orders
the result.

| Rule                                                                                                 | Proven by                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A shift open past the threshold blocks its period, with the fix                                      | `issues.test.ts › issues: open_too_long`    |
| Blockers first, then the oldest first, then by id                                                    | `issues.test.ts › issues: the order`        |
| Every kind's source is asked                                                                         | `issues.test.ts › asks every kind's source` |
| `periodSummary` adds the recorded minutes and counts who is at work; areas not built answer `null`   | `issues.test.ts › periodSummary`            |
| Every domain state and every issue kind has a face and a message key; the normal states have no pill | `issues.test.ts › faces…`                   |
| Every selector area has its file and the index re-exports it                                         | `registries.test.ts`                        |

## The seeded world

`seedWorld(tenant, dataset)` is pure, memoised and frozen. Names are hand-written and invented; contact data is
fiction by construction (mail at `example.com`, phone numbers from the film-and-television ranges, accounts on a
bank code no bank holds).

| Rule                                                                                               | Proven by                                                  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The same bytes on every run, checked by a hash                                                     | `seed.test.ts › seed: determinism`                         |
| The scripted cases of the evening exist                                                            | `seed.test.ts › seed: the scripted cases of the evening`   |
| Every dataset is a consistent world                                                                | `seed.test.ts › seed: every dataset is a consistent world` |
| Seeding stays within its budget                                                                    | `seed.test.ts › seed: budgets`                             |
| No string of the example or of its generated data is unsafe to publish                             | `public-safety.test.ts`                                    |
| The domain and the world import no Svelte and no session, read no real time and draw no randomness | `registries.test.ts › the domain and the world stay pure`  |

## The session and its storage format

The session is the only way a screen reaches the world, and the browser's storage holds one ordered log per
tenant. The format is documented so that tests and the demo reach every state through it, with no test-only hooks.

```
shiftbook.v1.meta                          SessionMeta: schema version, first visit, clock, per-tenant dataset and persona, preferences
shiftbook.v1.head.<tenant>                 { epoch, seq }: the last envelope written
shiftbook.v1.log.<tenant>.<epoch>.<seq>    Envelope { seq, id, at, actor, command, codes? }: one key per accepted command
```

**A commit, step by step.** (1) Wait `prefs.latencyMs`. (2) Inside the origin-wide lock (Web Locks): repair the
meta (another schema, older than 12 hours, another seed); if `failNextSave` is set, clear it and resolve
`unavailable` with nothing logged; read the head, re-seed if the epoch moved, fold every envelope after this tab's
position; at the cap of 2,000 envelopes refuse with `unavailable`; take `now` from the stored clock; run `apply`
with ids from the log position (`shift_000412_1`); if accepted, write the envelope, then the head. (3) Outside
the lock: replace the world, tell the other tabs on the channel, resolve the outcome. A refusal is a value; the
promise never rejects.

| Rule                                                                                                                                   | Proven by                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Two tabs committing at once end with the same world and the same stored log                                                            | `session.test.ts › two sessions on one store commit at once…`                      |
| Fifty interleaved random commands in three tabs agree, and a fresh tab folds the same world                                            | `session.test.ts › fifty interleaved random commands…`                             |
| A dropped message is healed by the next commit, and by the page becoming visible                                                       | `session.test.ts › a dropped channel message is healed…`                           |
| A dataset switch starts a new epoch and re-seeds every tab                                                                             | `session.test.ts › an epoch change re-seeds the other session…`                    |
| `failNextSave` resolves `unavailable` once and writes nothing                                                                          | `session.test.ts › failNextSave resolves…`                                         |
| `latencyMs` delays the outcome by exactly that long; with the switches off nothing waits                                               | `session.test.ts › latencyMs delays the outcome…`                                  |
| A load is `loading` for `latencyMs`, then `ready`, or `error` once with `failNextLoad`; `reload` recovers; the world is never withheld | `session.test.ts › the load status…`                                               |
| Restore folds the stored log over the seed after mount; the first render is the seed's                                                 | `session.test.ts › restore folds the stored log…`                                  |
| A session older than 12 hours of real time starts over with a notice                                                                   | `session.test.ts › a session older than 12 hours…`                                 |
| A meta of another schema, and a log over another seed, are discarded with a notice                                                     | `session.test.ts › a meta of another schema…`, `› a log stored over another seed…` |
| A stored envelope that no longer applies starts the tenant over; it never yields a broken world                                        | `session.test.ts › a stored envelope that no longer applies…`                      |
| At the cap of 2,000 envelopes a commit is refused with `unavailable`, and a full log still restores                                    | `session.test.ts › at the cap…`                                                    |
| Without the Web Locks API the store runs single-tab: no lock, no channel, still one log                                                | `session.test.ts › single-tab mode…`                                               |
| A commit reads the clock inside the lock, so the log's instants never run backwards                                                    | `session.test.ts › a commit reads the clock inside the lock…`                      |
| The clock stands at the dataset's instant until restore, then runs live; the tick stops while hidden                                   | `session.test.ts › clock`                                                          |
| A screen reads the session from context; outside a tenant route that throws                                                            | `session.context.test.ts`                                                          |
