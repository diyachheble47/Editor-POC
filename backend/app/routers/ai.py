"""The AI routes. Each one checks the request and hands it to a service.

  POST /ai/documents   a whole workbook, lesson or lesson plan (streamed)
  POST /ai/generate    one block of a chosen type: quiz, table, graph, html ... (plain JSON)
  POST /ai/chat        change the open document as the teacher asks, with the chat so far (streamed)
  GET  /ai/status      whether the AI is set up
"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..services import block_generation, document_generation, gemini
from ..utils.schemas import MAX_CHAT_TURNS, BlockRequest, ChatRequest, DocumentRequest

log = logging.getLogger("notebook.ai")
router = APIRouter(prefix="/ai", tags=["ai"])


def _require_ai() -> None:
    if not gemini.is_configured():
        raise HTTPException(503, "The AI is not set up: GEMINI_API_KEY is missing on the server.")


def _events(gen) -> StreamingResponse:
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
def status():
    """Lets the UI tell whether the AI is set up, without exposing the key."""
    return {"configured": gemini.is_configured()}


@router.post("/documents")
async def generate_document(body: DocumentRequest):
    """Streams a workbook, lesson or lesson plan as Server-Sent Events.

    Events: `start`; for headings/paragraphs `open` + several `text` + `close` (so they can be shown typing);
    for everything else one `block`; then `done`. An `error` event ends the stream early.
    """
    _require_ai()
    sources = tuple((s.name, s.text) for s in body.sources)
    return _events(document_generation.document_stream(body.kind, body.title, body.description, body.context, sources))


@router.post("/generate")
async def generate_block(body: BlockRequest):
    """One block of the chosen type, as JSON: `{"block": {...}}` (not streamed: it is a single block)."""
    _require_ai()
    try:
        block = await block_generation.generate_block(body.type, body.prompt, body.hint, body.current)
    except Exception:  # noqa: BLE001 - surfaced to the user as a message
        log.exception("AI block generation failed")
        raise HTTPException(502, "The AI service returned an error. Try again in a moment.") from None
    if block is None:
        raise HTTPException(422, "The AI could not make that block. Try describing it differently.")
    return {"block": block}


@router.post("/chat")
async def chat(body: ChatRequest):
    """Edits the document as the instruction asks. Streams the revised blocks like POST /ai/documents does;
    blocks left as they were come as `keep` references."""
    _require_ai()
    if not body.instruction.strip():
        raise HTTPException(422, "Editing needs an instruction.")
    history = tuple((t.role, t.text) for t in body.history[-MAX_CHAT_TURNS:])
    return _events(document_generation.document_stream("edit", body.title, body.instruction, body.context, (), history))
