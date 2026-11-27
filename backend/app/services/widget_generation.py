"""Interactive pages and 3D models: one HTML page from the dedicated prompt, and the check of whether a topic needs 3D."""

import logging
import os
from typing import Optional

from ..prompts.widgets import HTML_SYSTEM, NEEDS_3D_SYSTEM
from . import llm
from .block_parser import clean_html

log = logging.getLogger("notebook.ai")

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
            answer = "".join([piece async for piece in llm.text_stream(HTML_SYSTEM, user, **opts)])
        except Exception:  # noqa: BLE001
            log.warning("html model %s failed", name or "(default)", exc_info=True)
            continue
        code = clean_html(answer)
        if code:
            return code
        log.warning("html model %s gave an unusable page (%d chars)", name or "(default)", len(answer))
    return None


async def needs_3d(title: str, description: str) -> bool:
    """Whether the topic itself calls for a 3D model (the model's cheap, quick judgement on the topic)."""
    try:
        answer = "".join([p async for p in llm.text_stream(NEEDS_3D_SYSTEM, f"Topic: {title}\nDetails: {description}")])
    except Exception:  # noqa: BLE001 - no 3D is the safe answer
        log.warning("3D check failed", exc_info=True)
        return False
    return answer.strip().upper().startswith("YES")
