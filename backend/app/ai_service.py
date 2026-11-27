"""The AI work itself, apart from HTTP: calling the model, building documents, blocks and chat edits.

Routes (routers/ai.py) validate a request and hand it here, so the old and the new routes share one implementation.
"""

import asyncio
import logging
import os
from typing import AsyncIterator, Optional, Sequence

from . import gemini
from .ai_blocks import MAX_BLOCKS, clean_html, parse_block_line
from .ai_prompts import HTML_SYSTEM, SINGLE_BLOCK_SYSTEM, build_system_prompt, build_user_prompt
from .relevance import ASKED_3D, block_text, is_relevant
from .sse import sse

log = logging.getLogger("notebook.ai")

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



def document_stream(
    kind: str,
    title: str,
    description: str,
    context: str = "",
    sources: Sequence[tuple[str, str]] = (),
    history: Sequence[tuple[str, str]] = (),
) -> AsyncIterator[bytes]:
    """A document (or an edit of one) as Server-Sent Events.

    Events: `start`; for headings/paragraphs `open` + several `text` + `close` (so they can be shown typing);
    for everything else one `block`; then `done`. An `error` event ends the stream early.
    `history` is the chat so far (role, text); only an edit uses it.
    """
    typing_delay = int(os.getenv("AI_TYPING_DELAY_MS", "15")) / 1000
    sources = tuple(sources) if kind != "edit" else ()
    system = build_system_prompt(kind, from_sources=bool(sources))
    user = build_user_prompt(title, description, context, kind, sources, tuple(history))

    async def events():
        n = 0
        blocks = 0
        html_blocks = 0
        # What the document is about so far: the request, then the text as it is written.
        seen = f"{title} {description} {context[:5000]} " + " ".join(t[:5000] for _, t in sources)

        def frame(event: dict) -> bytes:
            nonlocal n
            n += 1
            return sse(event, n)

        yield frame({"t": "start"})

        # A 3D model is built beside the document, not inline: the teacher said "3D", or the topic itself needs
        # one (a quick YES/NO on the topic). It starts now and is placed into the document once it is ready.
        topic = f"{title}. {description}"
        go_3d = kind != "edit" and bool(ASKED_3D.search(topic) or await needs_3d(title, description))
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
            return {"type": "html", "title": f"3D model: {title}"[:80], "code": code} if code else None

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
                            f"'{title}'. {description}",
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

    return events()


# What the slash menu's "Generate" can make: exactly one block of one of these types.
BLOCK_TYPES = (
    "drawing", "table", "quiz", "html", "equation", "math", "graph", "geometry",
    "molecule", "circuit", "matrix", "flowchart", "chart",
)


async def generate_block(block_type: str, prompt: str, hint: str = "") -> Optional[dict]:
    """One new block of `block_type` about `prompt`, or None when the model gave nothing usable.

    `hint` tells the model what to make when a type has two uses (a table, or a table with formulas).
    """
    wanted = f"{prompt.strip()}. It must be {hint.strip()}." if hint.strip() else prompt.strip()
    if block_type == "html":
        # A page only works whole, and gets the dedicated (stronger, longer) HTML pass.
        code = await make_widget(wanted, three_d=bool(ASKED_3D.search(prompt)))
        return {"type": "html", "title": prompt.strip()[:80], "code": code} if code else None
    user = f"Add ONE new {block_type} block about: {wanted} Nothing else: no heading, no title, no intro text, and no other block."
    lines = lines_from(text_stream(SINGLE_BLOCK_SYSTEM, user))
    try:
        async for line in lines:
            block = parse_block_line(line)
            if block is None or block["type"] != block_type:
                continue
            # A circuit, molecule or geometry block the request never mentions is left out.
            if not is_relevant(block["type"], f"{prompt} {hint}"):
                log.info("dropped off-topic %s block", block_type)
                continue
            return block
    finally:
        await lines.aclose()  # stop asking the model as soon as one block is in hand
    return None
