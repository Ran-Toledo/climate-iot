# Climate IoT — PostgreSQL → SQLite Migration Plan

Plan for replacing the `db` (Postgres 16) service with a SQLite file owned
by the `api` container. Branch: `feature/sqlite-migration` (from `dev`).

**Why:** one fewer container, no credentials, a single file to back up.
The workload fits SQLite easily: one real device writing roughly every 5
seconds (telemetry, heartbeat, command poll), and one human using the UI.

**What stays the same:** the HTTP API contract, the frontend, the ESP32
firmware and the device simulator. Only the backend's storage layer,
Alembic, Docker Compose, env vars and docs change.

## Audit: what's Postgres-specific today

| # | Where | What | Severity |
|---|---|---|---|
| 1 | `backend/app/services/telemetry_service.py` `list_telemetry` | `func.extract("epoch", …)` on an interval and `.distinct(bucket)` (Postgres `DISTINCT ON`). Neither exists in SQLite. This is the graph query. | **Breaks**: query errors |
| 2 | All `DateTime(timezone=True)` columns | SQLite has no timestamp type and drops tz info, so values read back as naive `datetime`s. `device_service.py` does `datetime.now(timezone.utc) - device.last_heartbeat_at`, which raises `TypeError` (aware minus naive). This affects every device response that includes `online`. | **Breaks**: 500s |
| 3 | `ondelete="CASCADE"` FKs | SQLite ignores foreign keys unless `PRAGMA foreign_keys=ON` is set **per connection**. Without it, `delete_device` would leave orphaned state, telemetry and command rows. | **Silent data bug** |
| 4 | `models/command.py`, `models/device_state.py` | `sqlalchemy.dialects.postgresql.JSONB` | **Breaks**: import and DDL |
| 5 | `models/command.py` `status` | `Enum(..., native_enum=True)`, which creates the Postgres type `command_status` | DDL fails |
| 6 | `alembic/versions/0001_initial_schema.py` | `postgresql.JSONB`, `postgresql.ENUM(...).create()/.drop()` | Migration fails |
| 7 | `alembic/versions/0002_drop_telemetry_co2.py` | `op.drop_column`. SQLite ≥ 3.35 can do this, but Alembic's SQLite support expects batch mode for ALTERs | Fragile |
| 8 | `requirements.txt` | `asyncpg` driver | Swap |
| 9 | `docker-compose.yml`, `.env(.example)` | `db` service, healthcheck, `db_data` volume, internal `data` network, `POSTGRES_*`, `DATABASE_URL` | Remove/replace |
| 10 | README, `TODO.md` | Postgres mentions, the `psql` shell command, "JSONB" under Known simplifications, the architecture diagram | Docs |

These are fine as-is and need no change:
- `func.now()` server defaults, which become `CURRENT_TIMESTAMP` (UTC) in SQLite.
- `String(n)` lengths. SQLite doesn't enforce them, but Pydantic already validates input.
- JSON mutation. Services build a new dict and reassign it
  (`device_state.desired_state = merged`), so change tracking works without
  `MutableDict`.
- `order_by`/`limit`, `select`, unique indexes and `db.delete` all work the same.
- No `SELECT … FOR UPDATE`, `RETURNING`, upserts or `ILIKE` anywhere.

## Changes

### 1. Driver and engine (`backend/requirements.txt`, `backend/app/db/session.py`)

- Replace `asyncpg` with `aiosqlite`.
- Set `DATABASE_URL=sqlite+aiosqlite:////data/climate_iot.db`. Four slashes
  make it an absolute path inside the container.
- Add a `connect` event listener on `engine.sync_engine` that runs, on every
  new connection:
  - `PRAGMA foreign_keys=ON` (fixes #3)
  - `PRAGMA journal_mode=WAL` (reads don't block the writer: the UI polls
    while the device writes)
  - `PRAGMA busy_timeout=5000` (writers wait briefly instead of failing with
    "database is locked")
- Put the listener somewhere both `session.py` and `alembic/env.py` can use,
  so migrations also run with foreign keys on.

### 2. Timestamps: a UTC-aware column type (fixes #2)

Add `app/db/types.py` with a `UTCDateTime` `TypeDecorator` over `DateTime`:
- On write, convert aware values to UTC and strip tzinfo, so everything is
  stored as naive UTC in one consistent format. Reject naive input, to catch
  bugs early.
- On read, attach `timezone.utc`.

Use it for `devices.last_heartbeat_at`/`created_at`,
`device_states.updated_at`, `telemetry.recorded_at` and
`commands.created_at`/`completed_at`. API responses keep their `+00:00`
offsets, so the frontend's date handling is unaffected.

Note: rows written via `server_default=func.now()` are stored as
`YYYY-MM-DD HH:MM:SS` (no microseconds). Python-written rows include
microseconds. Both sort and compare correctly as text because the prefix
format is identical. To be uniform anyway, switch those defaults to Python
defaults (`default=lambda: datetime.now(timezone.utc)`).

### 3. JSON and enum columns (fixes #4, #5)

- `JSONB` becomes `sqlalchemy.JSON` (stored as TEXT in SQLite). Keep
  `server_default="{}"`.
- `Enum(CommandStatus, native_enum=True)` becomes `native_enum=False`, which
  stores a `VARCHAR` and adds a `CHECK` constraint. Keep the same
  `values_callable`.

### 4. Telemetry bucketing query (fixes #1)

Keep the same behaviour: split the window into `limit` equal-width buckets,
return the **latest** reading in each, ordered oldest bucket first. Replace
`DISTINCT ON` with a window function, which SQLite has supported since 3.25:

```python
offset_s = (func.unixepoch(Telemetry.recorded_at, "subsec")
            - func.unixepoch(since_utc_naive, "subsec"))   # exact seconds; SQLite >= 3.42
bucket = cast(func.floor(offset_s / bucket_seconds), Integer)  # floor() needs SQLite >= 3.35 math functions
ranked = (
    select(Telemetry.id, bucket.label("bucket"),
           func.row_number().over(partition_by=bucket,
                                  order_by=Telemetry.recorded_at.desc()).label("rn"))
    .where(...same device/window filters...)
    .subquery()
)
stmt = (select(Telemetry)
        .join(ranked, ranked.c.id == Telemetry.id)
        .where(ranked.c.rn == 1)
        .order_by(ranked.c.bucket))
```

- Checked in the current `api` image (`python:3.13-slim`, SQLite 3.46.1):
  `floor()`, window functions and `unixepoch(..., 'subsec')` all work.
  Avoid `julianday()` arithmetic: it's floating-point days, and a
  10-second gap came back as 9.99998 s, which can push a reading on a
  bucket boundary into the wrong bucket.
- If `floor()` isn't available in the image's SQLite build, use
  `CAST(offset_s / bucket_seconds AS INTEGER)`. The offset is never negative
  here, because `recorded_at >= since`, and truncation equals floor for
  non-negative values.
- Pass `since` as naive UTC, the same convention as `UTCDateTime`.
- The existing `(device_id)` and `(recorded_at)` indexes are enough at this
  data volume (about 10k rows today). A composite
  `(device_id, recorded_at)` index would be a cheap upgrade.

### 5. Alembic (fixes #6, #7)

Recommended: **start a fresh migration history.** There's one deployment
and the data is copied over separately (step 7), so the Postgres-specific
history has nothing to protect.
- Replace `0001` and `0002` with a single new `0001_initial_schema.py`
  written against generic types: `sa.JSON`, a non-native `sa.Enum`, `UTCDateTime`
  (or `sa.DateTime`), and no `co2` column. Keep the same index names.
- In `alembic/env.py`, set `render_as_batch=True` in both `context.configure`
  calls, so future ALTERs work on SQLite.

Alternative: keep the history and make both migrations dialect-aware
(`op.get_bind().dialect.name`). That's more code for no benefit here.

### 6. Docker Compose, env and image

- **`docker-compose.yml`:**
  - Delete the `db` service, the `db_data` volume and the `data` network.
  - Drop `api`'s `depends_on: db: condition: service_healthy` and its
    `data` network membership.
  - Add a named volume `api_data:/data` to `api`.
- **`.env` and `.env.example`:**
  - Remove `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`.
  - Set `DATABASE_URL=sqlite+aiosqlite:////data/climate_iot.db`.
- **`backend/Dockerfile`:** `RUN mkdir -p /data`. Optionally run
  `alembic upgrade head` before uvicorn in `CMD`, so a fresh volume gets its
  schema automatically. Today that's a manual README step.
- **Backups:** copy one file. With WAL mode, take the copy using SQLite's
  backup API rather than a plain `cp` while the API is running:
  `python -c "import sqlite3; s=sqlite3.connect('/data/climate_iot.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d)"`.

### 7. Carrying over existing data

Postgres currently holds 2 devices, 10,209 telemetry rows and 89 commands.
Add a one-off script, `backend/scripts/pg_to_sqlite.py`:
1. Read every table from Postgres (sync `psycopg`, or `asyncpg` installed
   just for the script) in FK order: `devices`, `device_states`,
   `telemetry`, `commands`.
2. Insert into the already-migrated SQLite file with **explicit ids**, so
   foreign keys and command ids stay valid. Convert timestamps to naive UTC
   and JSONB to JSON text.
3. Check that row counts match per table.

**Cut-over:**
1. `docker compose stop api`, so the ESP32's writes pause. It retries, and
   readings during the gap are lost, which is acceptable.
2. Bring up the new `api` and run `alembic upgrade head` into the new volume.
3. Run the copy script against the old `db` container. Keep the old `db`
   service and volume around (e.g. under a temporary compose profile) until
   the copy is verified.
4. Start the `api`, check that the UI shows history and the device is
   online, then remove the old `db_data` volume.

If history doesn't matter, skip the script and start empty. The ESP32
re-registers itself on its next request.

### 8. Docs

- **README:**
  - Architecture diagram.
  - Quick start: two services, no db healthcheck.
  - "Network access": no Postgres bullet. Give the shell command as
    `docker compose exec api python -m sqlite3 /data/climate_iot.db`
    (Python 3.13 ships a sqlite3 CLI).
  - Env var table: `DATABASE_URL`.
  - Stopping/resetting: `down -v` wipes `api_data`.
  - Known simplifications: JSON columns instead of JSONB.
- **`TODO.md`:** mark the SQLite item done.
- **`device-simulator`, firmware, frontend:** no changes.

## Verification (no test suite exists, so this is manual)

1. A fresh `docker compose down -v && docker compose up --build -d` starts
   with no `db` container, and `alembic upgrade head` succeeds.
2. Simulator profile: it registers, heartbeats and sends telemetry, and the
   device shows `online: true`. This exercises fix #2.
3. Push a command through the UI. It's delivered via `commands/next`, the
   result is acknowledged, and `reported_state` updates. Check the JSON
   columns round-trip.
4. Graph ranges 1H/24H/7D/30D all return evenly spread points, oldest first,
   at most `limit`. Compare against Postgres output on the copied data for
   the same window, which should match closely.
5. Deleting a device removes its state, telemetry and commands, with no
   orphans: `SELECT count(*) FROM telemetry WHERE device_id NOT IN (SELECT id FROM devices)`
   returns 0. This exercises fix #3.
6. The ESP32 stays online through the cut-over and reconnects on its own.
7. Under normal load, no "database is locked" errors in `docker compose logs api`.

## Risks and trade-offs

- **Single writer.** Fine for one or a few devices. Many devices writing
  every few seconds would contend. WAL plus `busy_timeout` covers the
  current scale.
- **Concurrency guarantees.** The command-dedup guard (409 on a second
  acknowledgement) is a read-then-check in application code, and SQLite's
  serialized writes keep that at least as safe as on Postgres.
- **Type looseness.** SQLite won't reject wrong-typed values at the DB
  layer. Pydantic validation at the API boundary is the real guard, which
  is already the case for the JSON columns.
- **Rollback:** no longer possible with data. The cut-over was verified
  (integrity check, no orphan rows, history back to 2026-08-26 present)
  and the old Postgres volume, `climateiot_db_data`, was deleted on
  2026-11-07. The Postgres version of the code is still on `main`
  (`b0c4171`) until `main` is updated, but starting it would give an
  empty database: `scripts/pg_to_sqlite.py` only copies Postgres into
  SQLite, not back. To undo a bad change now, restore a SQLite backup
  instead (see "Backups" above; `climate_iot.backup-2026-11-06.db` in the
  `api_data` volume is the one taken before migration 0002).
