import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from .. import ai_service, gemini
from ..ai_service import BLOCK_TYPES

log = logging.getLogger("notebook.ai")
router = APIRouter(prefix="/ai", tags=["ai"])

# The AI routes. The work itself lives in ai_service.py.
#
#   POST /ai/documents   a whole workbook, lesson or lesson plan (streamed)
#   POST /ai/generate    one block of a chosen type: quiz, table, graph, html ... (plain JSON)
#   POST /ai/chat        change the open document as the teacher asks, with the chat so far (streamed)
#   GET  /ai/status      whether the AI is set up

MAX_SOURCES = 3
MAX_SOURCE_CHARS = 120_000
MAX_SOURCES_TOTAL = 150_000


class SourceText(BaseModel):
    """A document the teacher attached; only its text is ever sent here."""

    name: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)


class DocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    # Text of the document the agent was opened on; when present the result is
    # built from it instead of from the title alone.
    context: str = Field(default="", max_length=30000)
    kind: Literal["workbook", "lesson_plan", "lesson"]
    # Documents to write from ("/agent workbook from a file").
    sources: list[SourceText] = Field(default_factory=list, max_length=MAX_SOURCES)

    @model_validator(mode="after")
    def _sources_fit(self):
        if sum(len(s.text) for s in self.sources) > MAX_SOURCES_TOTAL:
            raise ValueError("The attached documents are too long.")
        return self


class BlockRequest(BaseModel):
    type: Literal[BLOCK_TYPES]  # type: ignore[valid-type]
    prompt: str = Field(min_length=1, max_length=2000)
    # Tells the model what to make when two choices share a type (a table, or a table with formulas).
    hint: str = Field(default="", max_length=300)
    # A widget's current code, when the teacher is asking for a change to it (type "html" only).
    current: str = Field(default="", max_length=20000)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


MAX_CHAT_TURNS = 20


class ChatRequest(BaseModel):
    title: str = Field(default="Untitled", max_length=120)
    instruction: str = Field(min_length=1, max_length=2000)
    # The document's blocks (or the selected ones), numbered as the editor sends them.
    context: str = Field(default="", max_length=30000)
    # The conversation so far, oldest first, so a follow-up can be understood. The last MAX_CHAT_TURNS are used.
    history: list[ChatTurn] = Field(default_factory=list, max_length=100)


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
    return _events(ai_service.document_stream(body.kind, body.title, body.description, body.context, sources))


@router.post("/generate")
async def generate_block(body: BlockRequest):
    """One block of the chosen type, as JSON: `{"block": {...}}` (not streamed: it is a single block)."""
    _require_ai()
    try:
        block = await ai_service.generate_block(body.type, body.prompt, body.hint, body.current)
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
    return _events(ai_service.document_stream("edit", body.title, body.instruction, body.context, (), history))
