"""Writing a whole document (or a change to one) as a stream of events the editor builds from."""

import asyncio
import logging
import os
from typing import AsyncIterator, Sequence

from ..prompts.documents import build_system_prompt, build_user_prompt
from ..utils.sse import sse
from . import llm
from .block_parser import MAX_BLOCKS, parse_block_line
from .relevance import ASKED_3D, block_text, is_relevant
from .widget_generation import make_widget, needs_3d

log = logging.getLogger("notebook.ai")


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
            async for line in llm.lines_from(llm.text_stream(system, user)):
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
