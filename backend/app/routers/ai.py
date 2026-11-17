import asyncio
import logging
import os
from typing import AsyncIterator, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import gemini
from ..ai_blocks import MAX_BLOCKS, parse_block_line
from ..relevance import block_text, is_relevant
from ..ai_prompts import build_system_prompt, build_user_prompt
from ..sse import sse

log = logging.getLogger("notebook.ai")
router = APIRouter(prefix="/ai", tags=["ai"])


class GenerateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    # Text of the document the agent was opened on; when present the result is
    # built from it instead of from the title alone.
    context: str = Field(default="", max_length=30000)
    kind: Literal["workbook", "lesson_plan", "lesson"]


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


@router.post("/generate")
async def generate(body: GenerateRequest):
    """Streams a generated document as Server-Sent Events.

    Events: `start`; for headings/paragraphs `open` + several `text` + `close`
    (so they can be shown typing); for everything else one `block`; then `done`.
    An `error` event ends the stream early.
    """
    if not gemini.is_configured():
        raise HTTPException(503, "The AI is not set up: GEMINI_API_KEY is missing on the server.")

    typing_delay = int(os.getenv("AI_TYPING_DELAY_MS", "15")) / 1000
    system = build_system_prompt(body.kind)
    user = build_user_prompt(body.title, body.description, body.context)

    async def events():
        n = 0
        blocks = 0
        # What the document is about so far: the request, then the text as it is written.
        seen = f"{body.title} {body.description} {body.context[:5000]}"

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
                seen += " " + block_text(block)
                blocks += 1
                if block["type"] in ("heading", "paragraph"):
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
