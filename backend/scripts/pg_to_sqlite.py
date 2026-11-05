"""One-off copy of the old Postgres data into the new SQLite database.

Usage (inside the api container, with the old `db` container still running
and reachable, and the SQLite schema already applied by `alembic upgrade head`):

    pip install asyncpg
    python scripts/pg_to_sqlite.py \
        --pg postgresql://climate_app:<password>@db:5432/climate_iot \
        --sqlite /data/climate_iot.db

Rows keep their original ids, so foreign keys and command ids stay valid.
Refuses to run if any target table already has rows. Everything is written
in one transaction: if anything fails, the SQLite file is left unchanged.
"""

import argparse
import asyncio
import json
import sqlite3
from datetime import datetime, timezone

import asyncpg

# FK order: parents before children.
TABLES = {
    "devices": ["id", "hardware_id", "device_type", "name", "last_heartbeat_at", "created_at"],
    "device_states": ["id", "device_id", "desired_state", "reported_state", "updated_at"],
    "telemetry": ["id", "device_id", "temperature", "humidity", "recorded_at"],
    "commands": ["id", "device_id", "type", "payload", "status", "result", "created_at", "completed_at"],
}


def to_sqlite(value):
    # Same naive-UTC text format SQLAlchemy's SQLite DateTime (and so
    # app.db.types.UTCDateTime) stores.
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value  # asyncpg returns jsonb and enums as str already


async def read_postgres(url: str) -> dict[str, list[tuple]]:
    conn = await asyncpg.connect(url)
    try:
        return {
            table: [
                tuple(to_sqlite(v) for v in row)
                for row in await conn.fetch(f"SELECT {', '.join(cols)} FROM {table} ORDER BY id")
            ]
            for table, cols in TABLES.items()
        }
    finally:
        await conn.close()


def write_sqlite(path: str, data: dict[str, list[tuple]]) -> None:
    db = sqlite3.connect(path)
    try:
        db.execute("PRAGMA foreign_keys=ON")
        for table in TABLES:
            if db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]:
                raise SystemExit(f"{table} already has rows; refusing to copy into a non-empty database")
        with db:  # one transaction
            for table, cols in TABLES.items():
                placeholders = ", ".join("?" for _ in cols)
                db.executemany(
                    f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})",
                    data[table],
                )
        for table in TABLES:
            copied = db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            status = "ok" if copied == len(data[table]) else "MISMATCH"
            print(f"{table:14} postgres={len(data[table]):6}  sqlite={copied:6}  {status}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pg", required=True, help="Postgres URL (postgresql://user:pass@host:port/db)")
    parser.add_argument("--sqlite", required=True, help="Path to the migrated SQLite file")
    args = parser.parse_args()
    write_sqlite(args.sqlite, asyncio.run(read_postgres(args.pg)))


if __name__ == "__main__":
    main()
