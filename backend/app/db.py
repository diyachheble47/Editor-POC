import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

DATA_DIR = Path(os.environ.get("NOTEBOOK_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DB_PATH = DATA_DIR / "notebook.db"

# Single-user stub, same placeholder the frontend's Dexie records use. Real
# accounts later change how this is obtained, not the tables around it.
LOCAL_OWNER_ID = "local-user"

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id             TEXT PRIMARY KEY,
    owner_id       TEXT NOT NULL,
    title          TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    word_count     INTEGER NOT NULL DEFAULT 0,
    revision       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS document_segments (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    heading     TEXT,
    state       TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE (document_id, position)
);
CREATE TABLE IF NOT EXISTS ai_chats (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    messages    TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)


def get_conn() -> Iterator[sqlite3.Connection]:
    # One connection per request, used one step at a time. FastAPI may run a
    # request's dependency and handler on different worker threads.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
