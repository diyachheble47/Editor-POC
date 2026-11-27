"""The AI chat saved with each document, so reopening a document brings the conversation back."""

import json
import sqlite3

from ..utils.schemas import ChatMessage
from .document_store import get_doc_row, now

# The oldest messages are dropped past this many.
MAX_CHAT_MESSAGES = 200

_UPSERT = (
    "INSERT INTO ai_chats (document_id, messages, updated_at) VALUES (?, ?, ?) "
    "ON CONFLICT(document_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at"
)


def read_chat(conn: sqlite3.Connection, doc_id: str) -> list[dict]:
    get_doc_row(conn, doc_id)
    row = conn.execute("SELECT messages FROM ai_chats WHERE document_id = ?", (doc_id,)).fetchone()
    return json.loads(row["messages"]) if row else []


def append_chat(conn: sqlite3.Connection, doc_id: str, new: list[ChatMessage]) -> list[dict]:
    """Adds messages to the end. Unlike replace_chat, two open tabs cannot overwrite each other's messages."""
    messages = (read_chat(conn, doc_id) + [m.model_dump() for m in new])[-MAX_CHAT_MESSAGES:]
    conn.execute(_UPSERT, (doc_id, json.dumps(messages), now()))
    return messages


def replace_chat(conn: sqlite3.Connection, doc_id: str, messages: list[ChatMessage]) -> list[ChatMessage]:
    get_doc_row(conn, doc_id)
    conn.execute(_UPSERT, (doc_id, json.dumps([m.model_dump() for m in messages]), now()))
    return messages
