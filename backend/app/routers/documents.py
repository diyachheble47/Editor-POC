"""The document routes: list, create, rename, delete, autosave, replay a saved document, and the AI chat saved
with it. The work is in services/document_store.py and services/chat_store.py."""

import asyncio
import sqlite3

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from ..services import chat_store, document_store
from ..utils.db import get_conn
from ..utils.schemas import ChatAppend, ChatIn, ChatOut, DocumentCreate, DocumentOut, DocumentPatch, SegmentIn, SegmentOut
from ..utils.sse import sse

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentOut])
def list_documents(conn: sqlite3.Connection = Depends(get_conn)):
    return document_store.list_documents(conn)


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(body: DocumentCreate, conn: sqlite3.Connection = Depends(get_conn)):
    return document_store.create_document(conn, body)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    return document_store.get_document(conn, doc_id)


@router.patch("/{doc_id}", response_model=DocumentOut)
def patch_document(doc_id: str, body: DocumentPatch, conn: sqlite3.Connection = Depends(get_conn)):
    return document_store.update_document(conn, doc_id, body)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    document_store.delete_document(conn, doc_id)
    return Response(status_code=204)


# no seprate segmets append in doc json
@router.get("/{doc_id}/segments/{position}", response_model=SegmentOut)
def get_segment(doc_id: str, position: int, conn: sqlite3.Connection = Depends(get_conn)):
    return document_store.get_segment(conn, doc_id, position)


@router.put("/{doc_id}/segments/{position}", response_model=DocumentOut)
def save_segment(doc_id: str, position: int, body: SegmentIn, conn: sqlite3.Connection = Depends(get_conn)):
    """The autosave call: stores the editor state and bumps the revision."""
    return document_store.save_segment(conn, doc_id, position, body)


@router.get("/{doc_id}/stream")
async def stream_document(
    doc_id: str,
    chunk: int = Query(24, ge=1, le=200),
    delay_ms: int = Query(6, ge=0, le=1000),
    block_delay_ms: int = Query(80, ge=0, le=5000),
    conn: sqlite3.Connection = Depends(get_conn),
):
    """Streams the saved document as Server-Sent Events (text/event-stream).

    The row is read up front (the DB connection closes when the handler
    returns); only the sending is paced. 404 if the document was never saved.
    """
    state, revision = document_store.load_state_for_replay(conn, doc_id)

    async def body():
        for n, event in enumerate(document_store.stream_events(state, chunk), start=1):
            if event["t"] == "start":
                event["revision"] = revision
            yield sse(event, n)
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


# The AI agent panel's conversation for one document, so reopening the document brings the chat back.
@router.get("/{doc_id}/ai-chat", response_model=ChatOut)
def get_ai_chat(doc_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    return ChatOut(messages=chat_store.read_chat(conn, doc_id))


@router.post("/{doc_id}/ai-chat/messages", response_model=ChatOut)
def append_ai_chat(doc_id: str, body: ChatAppend, conn: sqlite3.Connection = Depends(get_conn)):
    """Adds messages to the end of the saved chat; it never replaces what is there."""
    return ChatOut(messages=chat_store.append_chat(conn, doc_id, body.messages))


@router.put("/{doc_id}/ai-chat", response_model=ChatOut)
def put_ai_chat(doc_id: str, body: ChatIn, conn: sqlite3.Connection = Depends(get_conn)):
    """Replaces the whole saved chat (the agent panel does this when a message's status changes)."""
    return ChatOut(messages=chat_store.replace_chat(conn, doc_id, body.messages))
