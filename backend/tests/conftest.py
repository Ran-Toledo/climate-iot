"""Test setup: a throwaway SQLite file with the current schema.

DATABASE_URL must be set before app.db.session is imported (it builds the
engine at import time), hence the module-level env setup here.
"""

import os
import tempfile
from pathlib import Path

_db_dir = tempfile.mkdtemp(prefix="climateiot-tests-")
_db_path = Path(_db_dir) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path.as_posix()}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402

from app.db.base import Base  # noqa: E402
import app.models  # noqa: E402,F401  (registers the tables on Base.metadata)
from app.main import app as full_app, device_app  # noqa: E402

TEST_KEY = "test-device-key-not-a-real-secret"

_sync_engine = create_engine(f"sqlite:///{_db_path.as_posix()}")
Base.metadata.create_all(_sync_engine)
_sync_engine.dispose()


@pytest.fixture
def device_key(monkeypatch):
    monkeypatch.setenv("DEVICE_API_KEY", TEST_KEY)
    return TEST_KEY


@pytest.fixture
def no_device_key(monkeypatch):
    monkeypatch.delenv("DEVICE_API_KEY", raising=False)


@pytest.fixture
def device_client():
    with TestClient(device_app) as client:
        yield client


@pytest.fixture
def internal_client():
    with TestClient(full_app) as client:
        yield client
