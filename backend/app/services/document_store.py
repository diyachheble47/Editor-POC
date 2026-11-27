"""Saved documents: the rows, the editor state of a document (its segments), and the replay of a saved document.

Everything here takes the open database connection, so a route only has to pass it in. A missing document is a 404
and a stale save a 409, raised here so every route answers the same way.
"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from ..utils.db import LOCAL_OWNER_ID
from ..utils.schemas import DocumentCreate, DocumentOut, DocumentPatch, SegmentIn, SegmentOut

def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_doc(row: sqlite3.Row) -> DocumentOut:
    return DocumentOut(
        id=row["id"],
        title=row["title"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        schemaVersion=row["schema_version"],
        wordCount=row["word_count"],
        revision=row["revision"],
        ownerId=row["owner_id"],
    )


def get_doc_row(conn: sqlite3.Connection, doc_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM documents WHERE id = ? AND owner_id = ?", (doc_id, LOCAL_OWNER_ID)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Document not found")
    return row


def check_revision(row: sqlite3.Row, base_revision: int) -> None:
    # Optimistic concurrency: a client saving from a stale copy gets a 409
    # instead of silently overwriting a newer save (e.g. from another tab).
    if base_revision != row["revision"]:
        raise HTTPException(
            409,
            detail={"message": "Revision conflict", "serverRevision": row["revision"]},
        )


def list_documents(conn: sqlite3.Connection) -> list[DocumentOut]:
    rows = conn.execute(
        "SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC", (LOCAL_OWNER_ID,)
    ).fetchall()
    return [to_doc(r) for r in rows]


def create_document(conn: sqlite3.Connection, body: DocumentCreate) -> DocumentOut:
    doc_id = body.id or f"doc-{uuid.uuid4().hex[:12]}"
    ts = now()
    try:
        conn.execute(
            "INSERT INTO documents (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (doc_id, LOCAL_OWNER_ID, body.title, ts, ts),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Document id already exists")
    return to_doc(get_doc_row(conn, doc_id))


def get_document(conn: sqlite3.Connection, doc_id: str) -> DocumentOut:
    return to_doc(get_doc_row(conn, doc_id))


def update_document(conn: sqlite3.Connection, doc_id: str, body: DocumentPatch) -> DocumentOut:
    row = get_doc_row(conn, doc_id)
    check_revision(row, body.baseRevision)
    conn.execute(
        "UPDATE documents SET title = ?, word_count = ?, updated_at = ?, revision = revision + 1 WHERE id = ?",
        (
            body.title if body.title is not None else row["title"],
            body.wordCount if body.wordCount is not None else row["word_count"],
            now(),
            doc_id,
        ),
    )
    return to_doc(get_doc_row(conn, doc_id))


def delete_document(conn: sqlite3.Connection, doc_id: str) -> None:
    get_doc_row(conn, doc_id)
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))


def get_segment(conn: sqlite3.Connection, doc_id: str, position: int) -> SegmentOut:
    doc = get_doc_row(conn, doc_id)
    seg = conn.execute(
        "SELECT * FROM document_segments WHERE document_id = ? AND position = ?", (doc_id, position)
    ).fetchone()
    if seg is None:
        raise HTTPException(404, "Segment not found")
    return SegmentOut(
        documentId=doc_id,
        position=position,
        heading=seg["heading"],
        state=json.loads(seg["state"]),
        updatedAt=seg["updated_at"],
        revision=doc["revision"],
    )


def save_segment(conn: sqlite3.Connection, doc_id: str, position: int, body: SegmentIn) -> DocumentOut:
    """The autosave call: stores the editor state and bumps the revision."""
    row = get_doc_row(conn, doc_id)
    check_revision(row, body.baseRevision)
    ts = now()
    conn.execute(
        """
        INSERT INTO document_segments (id, document_id, position, heading, state, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (document_id, position)
        DO UPDATE SET heading = excluded.heading, state = excluded.state, updated_at = excluded.updated_at
        """,
        (f"{doc_id}:seg{position}", doc_id, position, body.heading, json.dumps(body.state), ts),
    )
    conn.execute(
        "UPDATE documents SET updated_at = ?, word_count = ?, title = ?, revision = revision + 1 WHERE id = ?",
        (
            ts,
            body.wordCount if body.wordCount is not None else row["word_count"],
            body.title if body.title is not None else row["title"],
            doc_id,
        ),
    )
    return to_doc(get_doc_row(conn, doc_id))


def load_state_for_replay(conn: sqlite3.Connection, doc_id: str) -> tuple[dict, int]:
    """The saved editor state (segment 0) and the revision, read up front: the connection closes when the route returns."""
    doc = get_doc_row(conn, doc_id)
    seg = conn.execute(
        "SELECT state FROM document_segments WHERE document_id = ? AND position = 0", (doc_id,)
    ).fetchone()
    if seg is None:
        raise HTTPException(404, "Segment not found")
    return json.loads(seg["state"]), doc["revision"]


def stream_events(state: dict, chunk: int):
    """Turns a saved editor state into a sequence of small events.

    Text blocks (paragraphs, headings, quotes...) are opened empty and filled
    with short pieces of text, so the client can show them being "typed".
    Everything else (equations, models, circuits, lists, tables...) arrives
    whole, one event per top-level block.
    """
    blocks = (state.get("root") or {}).get("children") or []
    yield {"t": "start", "blocks": len(blocks)}
    for node in blocks:
        children = node.get("children")
        text_only = bool(children) and all(c.get("type") == "text" for c in children)
        if not text_only:
            yield {"t": "block", "node": node}
            continue
        yield {"t": "open", "node": {**node, "children": []}}
        for child in children:
            text = child.get("text", "")
            for i in range(0, max(len(text), 1), chunk):
                yield {"t": "text", "child": {**child, "text": text[i : i + chunk]}}
        yield {"t": "close"}
    yield {"t": "done"}
