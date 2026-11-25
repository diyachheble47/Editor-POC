import asyncio
import logging
import os
from typing import AsyncIterator, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from .. import gemini
from ..ai_blocks import MAX_BLOCKS, clean_html, parse_block_line
from ..relevance import block_text, is_relevant
from ..ai_prompts import HTML_SYSTEM, build_system_prompt, build_user_prompt
from ..sse import sse

log = logging.getLogger("notebook.ai")
router = APIRouter(prefix="/ai", tags=["ai"])


MAX_SOURCES = 3
MAX_SOURCE_CHARS = 120_000
MAX_SOURCES_TOTAL = 150_000


class SourceText(BaseModel):
    """A document the teacher attached; only its text is ever sent here."""

    name: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)


class GenerateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    # Text of the document the agent was opened on; when present the result is
    # built from it instead of from the title alone.
    context: str = Field(default="", max_length=30000)
    kind: Literal["workbook", "lesson_plan", "lesson", "edit"]
    # Documents to write from ("/agent workbook from a file").
    sources: list[SourceText] = Field(default_factory=list, max_length=MAX_SOURCES)

    @model_validator(mode="after")
    def _sources_fit(self):
        if sum(len(s.text) for s in self.sources) > MAX_SOURCES_TOTAL:
            raise ValueError("The attached documents are too long.")
        return self


class HtmlRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    # The widget's current code, when the teacher is asking for a change to it.
    current: str = Field(default="", max_length=20000)


# Looked up at call time so tests can swap it for a fake model.
def text_stream(system: str, user: str) -> AsyncIterator[str]:
    return gemini.gemini_text_stream(system, user)


async def lines_from(chunks: AsyncIterator[str]) -> AsyncIterator[str]:
    buffer = ""
    async for piece in chunks:
        buffer += piece
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            yield line
    if buffer:
        yield buffer


@router.get("/status")
def status():
    """Lets the UI tell whether the AI is set up, without exposing the key."""
    return {"configured": gemini.is_configured()}


@router.post("/html")
async def generate_html(body: HtmlRequest):
    """One interactive widget as a single HTML page (not streamed: it only works whole)."""
    if not gemini.is_configured():
        raise HTTPException(503, "The AI is not set up: GEMINI_API_KEY is missing on the server.")
    user = f"Teacher's request:\n{body.prompt.strip()}"
    if body.current.strip():
        user += f"\n\n--- current code ---\n{body.current.strip()}\n--- end of current code ---"
    try:
        answer = "".join([piece async for piece in text_stream(HTML_SYSTEM, user)])
    except Exception:  # noqa: BLE001 - surfaced to the user as a message
        log.exception("AI html generation failed")
        raise HTTPException(502, "The AI service returned an error. Try again in a moment.") from None
    code = clean_html(answer)
    if code is None:
        raise HTTPException(422, "The AI could not make a working widget from that. Try describing it differently.")
    return {"code": code}


@router.post("/generate")
async def generate(body: GenerateRequest):
    """Streams a generated document as Server-Sent Events.

    Events: `start`; for headings/paragraphs `open` + several `text` + `close`
    (so they can be shown typing); for everything else one `block`; then `done`.
    An `error` event ends the stream early.
    """
    if not gemini.is_configured():
        raise HTTPException(503, "The AI is not set up: GEMINI_API_KEY is missing on the server.")

    # Empty `context` is fine for "edit" — it just means an empty document
    # (nothing to keep), which the slash menu's "Generate" relies on to add
    # a single new block to a brand-new document. Only the instruction
    # itself is actually required.
    if body.kind == "edit" and not body.description.strip():
        raise HTTPException(422, "Editing needs an instruction.")

    typing_delay = int(os.getenv("AI_TYPING_DELAY_MS", "15")) / 1000
    sources = tuple((s.name, s.text) for s in body.sources) if body.kind != "edit" else ()
    system = build_system_prompt(body.kind, from_sources=bool(sources))
    user = build_user_prompt(body.title, body.description, body.context, body.kind, sources)

    async def events():
        n = 0
        blocks = 0
        html_blocks = 0
        # What the document is about so far: the request, then the text as it is written.
        seen = f"{body.title} {body.description} {body.context[:5000]} " + " ".join(t[:5000] for _, t in sources)

        def frame(event: dict) -> bytes:
            nonlocal n
            n += 1
            return sse(event, n)

        yield frame({"t": "start"})
        try:
            async for line in lines_from(text_stream(system, user)):
                block = parse_block_line(line)
                if block is None:
                    continue
                # Drop a circuit/molecule/geometry block the topic never mentions.
                if not is_relevant(block["type"], seen):
                    log.info("dropped off-topic %s block", block["type"])
                    continue
                # Interactive HTML only when the request itself asks for it, and not too many.
                if block["type"] == "html":
                    if html_blocks >= 2 or not is_relevant("html", f"{body.title} {body.description}"):
                        log.info("dropped unrequested html block")
                        continue
                    html_blocks += 1
                seen += " " + block_text(block)
                blocks += 1
                if block["type"] in ("heading", "paragraph", "section"):
                    meta = {k: v for k, v in block.items() if k != "text"}
                    yield frame({"t": "open", "block": meta})
                    text = block["text"]
                    for i in range(0, len(text), 3):
                        yield frame({"t": "text", "text": text[i : i + 3]})
                        if typing_delay:
                            await asyncio.sleep(typing_delay)
                    yield frame({"t": "close"})
                else:
                    yield frame({"t": "block", "block": block})
                if blocks >= MAX_BLOCKS:
                    break
        except Exception:  # noqa: BLE001 - surfaced to the user as a message
            log.exception("AI generation failed")
            yield frame({"t": "error", "message": "The AI service returned an error. Try again in a moment."})
            return
        if blocks == 0:
            yield frame({"t": "error", "message": "The AI returned nothing usable. Try again."})
            return
        yield frame({"t": "done", "blocks": blocks})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
