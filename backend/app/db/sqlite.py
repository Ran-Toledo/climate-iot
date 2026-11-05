"""Per-connection SQLite settings, shared by the app engine and Alembic."""

from sqlalchemy import event
from sqlalchemy.engine import Engine


def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    # SQLite ignores foreign keys (and so ON DELETE CASCADE) unless this is
    # set on every connection. delete_device relies on the cascade.
    cursor.execute("PRAGMA foreign_keys=ON")
    # WAL: readers (the UI polling) don't block the writer (the device).
    cursor.execute("PRAGMA journal_mode=WAL")
    # Wait up to 5s for a competing writer instead of failing immediately
    # with "database is locked".
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def configure_sqlite(engine: Engine) -> None:
    """Apply the pragmas to every new connection of a sync engine."""
    if engine.dialect.name == "sqlite":
        event.listen(engine, "connect", _set_sqlite_pragmas)
