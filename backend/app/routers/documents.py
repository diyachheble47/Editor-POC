import asyncio
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

from ..db import LOCAL_OWNER_ID, get_conn
from ..schemas import DocumentCreate, DocumentOut, DocumentPatch, SegmentIn, SegmentOut

router = APIRouter(prefix="/documents", tags=["documents"])


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


@router.get("", response_model=list[DocumentOut])
def list_documents(conn: sqlite3.Connection = Depends(get_conn)):
    rows = conn.execute(
        "SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC", (LOCAL_OWNER_ID,)
    ).fetchall()
    return [to_doc(r) for r in rows]


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(body: DocumentCreate, conn: sqlite3.Connection = Depends(get_conn)):
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


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    return to_doc(get_doc_row(conn, doc_id))


@router.patch("/{doc_id}", response_model=DocumentOut)
def patch_document(doc_id: str, body: DocumentPatch, conn: sqlite3.Connection = Depends(get_conn)):
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


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    get_doc_row(conn, doc_id)
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    return Response(status_code=204)


@router.get("/{doc_id}/segments/{position}", response_model=SegmentOut)
def get_segment(doc_id: str, position: int, conn: sqlite3.Connection = Depends(get_conn)):
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


@router.put("/{doc_id}/segments/{position}", response_model=DocumentOut)
def save_segment(
    doc_id: str, position: int, body: SegmentIn, conn: sqlite3.Connection = Depends(get_conn)
):
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


def _sse(event: dict, event_id: int) -> bytes:
    # One Server-Sent Event: `id`, `event` (the type), `data` (JSON), blank line.
    data = json.dumps(event, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event['t']}\ndata: {data}\n\n".encode()


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


@router.get("/{doc_id}/stream")
async def stream_document(
    doc_id: str,
    chunk: int = Query(3, ge=1, le=200),
    delay_ms: int = Query(35, ge=0, le=1000),
    block_delay_ms: int = Query(600, ge=0, le=5000),
    conn: sqlite3.Connection = Depends(get_conn),
):
    """Streams the saved document as Server-Sent Events (text/event-stream).

    The row is read up front (the DB connection closes when the handler
    returns); only the sending is paced. 404 if the document was never saved.
    """
    doc = get_doc_row(conn, doc_id)
    seg = conn.execute(
        "SELECT state FROM document_segments WHERE document_id = ? AND position = 0", (doc_id,)
    ).fetchone()
    if seg is None:
        raise HTTPException(404, "Segment not found")
    state = json.loads(seg["state"])
    revision = doc["revision"]

    async def body():
        for n, event in enumerate(stream_events(state, chunk), start=1):
            if event["t"] == "start":
                event["revision"] = revision
            yield _sse(event, n)
            # Text is paced per piece; a whole block (model, equation,
            # circuit...) gets a longer beat so you can see it land.
            pause = {"text": delay_ms, "open": delay_ms * 4, "block": block_delay_ms}.get(event["t"], 0)
            if pause:
                await asyncio.sleep(pause / 1000)

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
