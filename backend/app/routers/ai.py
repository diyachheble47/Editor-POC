import asyncio
import logging
import os
from typing import AsyncIterator, Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from .. import gemini
from ..ai_blocks import MAX_BLOCKS, clean_html, parse_block_line
from ..relevance import ASKED_3D, block_text, is_relevant
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
def text_stream(system: str, user: str, **options) -> AsyncIterator[str]:
    return gemini.gemini_text_stream(system, user, **options)


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


# Interactive pages and 3D models are the hardest thing the model writes, so they get a stronger model and
# some thinking. Both can be changed in .env without touching code.
HTML_MODEL = os.getenv("GEMINI_MODEL_HTML", "gemini-3.5-flash")
HTML_MODELS = [HTML_MODEL, os.getenv("GEMINI_MODEL_HTML_FALLBACK", "gemini-3.8-flash"), ""]  # "" = the normal model
HTML_THINKING = os.getenv("GEMINI_THINKING_HTML", "low")
HTML_TIMEOUT_MS = 240_000  # a rich 3D page is a long answer; the usual 90 s is not enough


async def make_widget(prompt: str, current: str = "", three_d: bool = False) -> Optional[str]:
    """One interactive widget from the dedicated HTML prompt (bigger budget than an inline block). None if unusable."""
    user = f"Teacher's request:\n{prompt.strip()}"
    if three_d:
        user += "\n\nThis must be a real 3D model built with the T3 kit, rich in detail, as described in the 3D rules."
    if current.strip():
        user += f"\n\n--- current code ---\n{current.strip()}\n--- end of current code ---"
    # The strong models are sometimes overloaded (503), slow, or give an unusable page: try the next one,
    # ending with the normal model.
    for name in HTML_MODELS:
        try:
            opts = {"model": name, "thinking": HTML_THINKING, "timeout_ms": HTML_TIMEOUT_MS} if name else {}
            answer = "".join([piece async for piece in text_stream(HTML_SYSTEM, user, **opts)])
        except Exception:  # noqa: BLE001
            log.warning("html model %s failed", name or "(default)", exc_info=True)
            continue
        code = clean_html(answer)
        if code:
            return code
        log.warning("html model %s gave an unusable page (%d chars)", name or "(default)", len(answer))
    return None


NEEDS_3D_SYSTEM = (
    "You decide whether a lesson topic needs a rotatable 3D model. Answer YES only when the topic is mainly about a "
    "physical structure whose shape and parts a student must see from all sides: anatomy or an organ, a cell or "
    "organelle, a molecule's or crystal's shape, the solar system or a planet, a machine or engine, a building or "
    "bridge, a landform or volcano, a skeleton, a plant or flower. Answer NO for abstract, numerical, historical, "
    "language, process or procedure topics (maths, interest, grammar, laws, events, algorithms). Reply with exactly "
    "one word: YES or NO."
)


async def needs_3d(title: str, description: str) -> bool:
    """Whether the topic itself calls for a 3D model (the model's cheap, quick judgement on the topic)."""
    try:
        answer = "".join([p async for p in text_stream(NEEDS_3D_SYSTEM, f"Topic: {title}\nDetails: {description}")])
    except Exception:  # noqa: BLE001 - no 3D is the safe answer
        log.warning("3D check failed", exc_info=True)
        return False
    return answer.strip().upper().startswith("YES")


@router.post("/html")
async def generate_html(body: HtmlRequest):
    """One interactive widget as a single HTML page (not streamed: it only works whole)."""
    if not gemini.is_configured():
        raise HTTPException(503, "The AI is not set up: GEMINI_API_KEY is missing on the server.")
    try:
        code = await make_widget(body.prompt, body.current, three_d=bool(ASKED_3D.search(body.prompt)))
    except Exception:  # noqa: BLE001 - surfaced to the user as a message
        log.exception("AI html generation failed")
        raise HTTPException(502, "The AI service returned an error. Try again in a moment.") from None
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

        # A 3D model is built beside the document, not inline: the teacher said "3D", or the topic itself needs
        # one (a quick YES/NO on the topic). It starts now and is placed into the document once it is ready.
        topic = f"{body.title}. {body.description}"
        go_3d = body.kind != "edit" and bool(ASKED_3D.search(topic) or await needs_3d(body.title, body.description))
        job = asyncio.create_task(make_widget(f"3D model: {topic}", three_d=True)) if go_3d else None

        async def take_3d(wait: bool):
            """The finished 3D block, or None if there is none (yet)."""
            nonlocal job
            if job is None or (not wait and not job.done()):
                return None
            task, job = job, None
            try:
                code = await task
            except Exception:  # noqa: BLE001 - the rest of the document is still good
                log.exception("3D model failed")
                return None
            return {"type": "html", "title": f"3D model: {body.title}"[:80], "code": code} if code else None

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
                    if go_3d and html_blocks == 0:
                        # The model's own page is replaced by the dedicated 3D build that is already running.
                        log.info("using the dedicated 3D build instead of the inline html block")
                        continue
                    wants_3d = block.get("title", "").upper().startswith("3D")
                    if html_blocks >= 2 or not (wants_3d or is_relevant("html", topic)):
                        log.info("dropped unrequested html block")
                        continue
                    html_blocks += 1
                    # A page written inline is small. Build it again with the dedicated HTML prompt (own
                    # budget, stronger model, 3D rules) and keep the inline one if that fails.
                    try:
                        better = await make_widget(
                            f"{block.get('title') or 'Interactive activity'}. This sits in a document titled "
                            f"'{body.title}'. {body.description}",
                            three_d=wants_3d,
                        )
                        if better:
                            block["code"] = better
                    except Exception:  # noqa: BLE001 - the inline page is still usable
                        log.exception("dedicated html pass failed, keeping the inline page")
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
                if html_blocks == 0 and blocks >= 6 and (extra := await take_3d(wait=False)):
                    html_blocks += 1
                    blocks += 1
                    yield frame({"t": "block", "block": extra})
                if blocks >= MAX_BLOCKS:
                    break
            if html_blocks == 0 and (extra := await take_3d(wait=True)):
                html_blocks += 1
                blocks += 1
                yield frame({"t": "block", "block": extra})
        except Exception:  # noqa: BLE001 - surfaced to the user as a message
            log.exception("AI generation failed")
            yield frame({"t": "error", "message": "The AI service returned an error. Try again in a moment."})
            return
        finally:
            if job is not None:  # the document ended or the client left: stop building the 3D model
                job.cancel()
        if blocks == 0:
            yield frame({"t": "error", "message": "The AI returned nothing usable. Try again."})
            return
        yield frame({"t": "done", "blocks": blocks})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
