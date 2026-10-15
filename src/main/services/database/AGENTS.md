# src/main/services/database — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail).

## Purpose

sql.js persistence for the desktop/document agent learning loop: trajectory recording, per-step history, failure records, and versioned migrations. Chat history is NOT stored here — `langchain/agent.ts` sessions are in-memory only.

## Ownership

- `database-manager.ts` (428 lines) — `DatabaseManager` singleton, disk persistence, all read/write methods.
- `schema.ts` (220 lines) — migration definitions, runner, row interfaces, stats.
- `index.ts` (20 lines) — the module's public re-export surface: manager class + singleton accessors (`:6-9`) and schema symbols incl. `runMigrations`, `getDatabaseStats`, `MIGRATIONS`, `SCHEMA_VERSION`, all row types (`:11-20`). If it isn't re-exported here, it isn't public.

## Local Contracts

- **Engine is `sql.js`, NOT better-sqlite3.** `database-manager.ts:8` and `schema.ts` import `initSqlJs`/`Database` from `sql.js`; the `dbSizeBytes: 0` comment at `schema.ts:217` records the sql.js pragma limitation. `better-sqlite3` is declared in `package.json` and imported by nothing (only mentioned in a comment at `src/main/main.ts:22`) — do not use it or cite it as the storage layer.
- **Applied ledger**: the `migrations` table (id, name, applied_at) written at `schema.ts:127-129` is what `runMigrations` reads back (`:109-116`) to make relaunches idempotent. Deleting rows there re-runs migrations against a live file; deleting the db file resets everything.
- **Persistence model**: pure-JS SQLite in memory, flushed to disk via `fs.writeFileSync` on every write (`persistToDisk`, `database-manager.ts:142-146`, called at `:108,199,417`).
  - There is no WAL; a crash mid-write can lose the last write. Keep writes coarse and batched.
- **sql.js API split**: `db.exec(sql)` handles DDL/multi-statement and returns result arrays (`schema.ts:106-112,125-126`); `db.run(sql, params)` is the parameterised single-statement form (`schema.ts:127-129`). Use `run` with `?` placeholders for inserts — never string-interpolate values into SQL here.
- **Migrations**: exactly 4 in `MIGRATIONS` (`schema.ts:30-97`), all `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`:
  - id 1 `create_desktop_trajectories` (`:32-48`), id 2 `create_desktop_trajectory_steps` (`:50-67`), id 3 `create_desktop_failures` (`:69-85`), id 4 `create_migrations_table` (`:87-96`).
- **Runner**: `runMigrations` (`schema.ts:104-141`) ensures the migrations table first (`:106-107`), skips applied ids (`:118-122`), and wraps each pending migration in `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` (`:125-134`), rethrowing on failure.
- **Row interfaces** mirror tables 1:1 (`schema.ts:145-180`): `TrajectoryRow` (`:145`, incl. `subtasks_json`), `TrajectoryStepRow` (`:155`), `FailureRow` (`:166`), `MigrationRow` (`:176`). Manager methods deal in these types, never raw rows.
- **Manager methods**: write path examples `saveTrajectory` (`database-manager.ts:151`, its own `BEGIN TRANSACTION`/`COMMIT`/`ROLLBACK` at `:159-204`) and `recordFailure` (`:309`). Public API is only what `index.ts:5-21` re-exports.
- **File location**: single db file at `app.getPath('userData')/desktop-agent.db` (`database-manager.ts:57-58`), dir created on demand (`:70`). The path is fixed at construction; there is no runtime relocation and no second file. Nothing else opens it.
- **Access pattern**: module-level singleton via `initializeDatabaseManager` / `getDatabaseManager` (re-exported `index.ts:6-9`); there is no second connection and no pooling — all writes serialise through it.
- **Stats**: `getDatabaseStats` (`schema.ts`, re-exported `index.ts:12`) counts tables/trajectories/failures from `sqlite_master`; `dbSizeBytes` is hardwired 0 (`:217`) — do not build features on it. The boot health check is `dbManager.stats()` (`main.ts:80`), logging trajectory/failure counts.
- **Callers**: boot initialises the manager at `src/main/main.ts:77-84` inside `try/catch` - failure degrades to `log.warn`, app runs without persistence. **The desktop writer is gone**: `desktop/desktop-memory.ts` was deleted at the Pi cutover and the Pi agent does not record trajectories, so tables 1-3 now receive **no writes at all**. The one live consumer is `document/document-memory.ts` (`:22,47`), which still calls `getDatabaseManager()`. The tables, migrations and manager methods all survive and are still correct; they are just unwritten. Do not delete them on that basis - the schema is a contract, the missing writer is a gap.
- **`close()` is on the quit path, and is deliberately last.** It shipped with **zero** production callers (only `database-manager.test.ts`), leaving the sql.js handle unclosed at exit. It is now the `database` step of `buildShutdownSteps()` in `src/main/main.ts`, ordered last because it calls `persistToDisk()` and should capture anything written during teardown. Because boot wraps init in `try/catch` and degrades to a warn, the manager may not exist — the step catches `getDatabaseManager()`'s "not initialized" throw and logs at debug, because a database that never opened is not a shutdown failure. A new persistent handle in this folder follows the same rule: register its release with `main.ts` in the change that acquires it.

## Work Guidance

- Boot wiring lives outside this folder: `initializeDatabaseManager()` at `src/main/main.ts:79`; its failure/degrade policy is `src/main/AGENTS.md`'s contract, not ours.
- Add-a-table recipe (all five steps, in order): ① new `MIGRATIONS` entry with a fresh sequential `id` and `IF NOT EXISTS` SQL ② bump `SCHEMA_VERSION` (`schema.ts:20`) — but know that it is **log-only** (`:140`), never compared against applied migrations, and still reads `1` despite four migrations existing; idempotency comes from the `migrations` ledger, not from it ③ add the row interface (`:145-180` region) ④ add manager method modelled on `saveTrajectory:151` / `recordFailure:309` (transaction + `persistToDisk()`) ⑤ re-export from `index.ts:5-21`.
- Migrations are append-only and immutable once shipped — never edit an existing entry's SQL or renumber its `id`; the applied ledger is keyed on `id` (`schema.ts:118`) and changing it re-triggers or skips migrations on existing databases.
- All SQL goes through `DatabaseManager`; renderer/main callers never open the db file directly.
- Because every write flushes the whole file, keep trajectory writes batched per task (one `saveTrajectory`, not per step outside a transaction).
- Index names follow `idx_<table>_<column>` (`schema.ts:44-46,64-65,81-82`); match the convention when adding indexes to a new migration.
- Column style is snake_case matching the row interface 1:1; JSON-encoded list columns use the `_json` suffix (`subtasks_json`, `TrajectoryRow` `:146-151`).
- Error surface: a failing migration throws out of `runMigrations` and aborts init — the only visible symptom is the `log.warn` at `main.ts:83`. Read the `[DB]` error lines in `database-manager.ts` (`:206,338`) when diagnosing writes.

## Verification

- `database-manager.test.ts` covers the sql.js layer. Gates: `npm run typecheck`, then `npm run dev` and confirm the `Applied migration …` / `All migrations complete. Schema version: N` log lines from the runner. `node_modules` is installed here, so all three gates run; `sql.js` is pure JS + wasm and needs no native-dep step (root rail Stack).
- After adding a migration, the smoke check is the new `Applied migration <id>` line once (and only once) plus `getDatabaseStats().tableCount` incrementing — current truth is 4 tables (`desktop_trajectories`, `desktop_trajectory_steps`, `desktop_failures`, `migrations`).

## Child DOX Index

No child docs.
