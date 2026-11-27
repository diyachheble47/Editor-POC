"""Interactive pages and 3D models: one HTML page from the dedicated prompt, and the check of whether a topic needs 3D."""

import time
from typing import Optional

from ..prompts.widgets import HTML_SYSTEM, NEEDS_3D_SYSTEM
from . import llm
from .block_parser import clean_html
from ..utils.logger import get_logger

log = get_logger("ai")

# A rich 3D page is a long answer; the usual 90 s is not enough. The model is the same one as everywhere else
# (litellm_client.MODEL): there is no stronger or fallback model.
HTML_TIMEOUT_MS = 240_000
ATTEMPTS = 2  # the proxy is sometimes busy, or the page comes back unusable: one more try


async def make_widget(prompt: str, current: str = "", three_d: bool = False) -> Optional[str]:
    """One interactive widget from the dedicated HTML prompt (bigger time budget than an inline block). None if unusable."""
    user = f"Teacher's request:\n{prompt.strip()}"
    if three_d:
        user += "\n\nThis must be a real 3D model built with the T3 kit, rich in detail, as described in the 3D rules."
    if current.strip():
        user += f"\n\n--- current code ---\n{current.strip()}\n--- end of current code ---"
    started = time.perf_counter()
    for attempt in range(1, ATTEMPTS + 1):
        try:
            answer = "".join([piece async for piece in llm.text_stream(HTML_SYSTEM, user, timeout_ms=HTML_TIMEOUT_MS)])
        except Exception:  # noqa: BLE001
            log.warning("widget attempt %d/%d failed", attempt, ATTEMPTS, exc_info=True)
            continue
        code = clean_html(answer)
        if code:
            log.info("widget built (attempt %d): %d chars in %d ms", attempt, len(code), int((time.perf_counter() - started) * 1000))
            return code
        log.warning("widget attempt %d/%d gave an unusable page (%d chars)", attempt, ATTEMPTS, len(answer))
    return None


async def needs_3d(title: str, description: str) -> bool:
    """Whether the topic itself calls for a 3D model (the model's cheap, quick judgement on the topic)."""
    try:
        answer = "".join([p async for p in llm.text_stream(NEEDS_3D_SYSTEM, f"Topic: {title}\nDetails: {description}")])
    except Exception:  # noqa: BLE001 - no 3D is the safe answer
        log.warning("3D check failed", exc_info=True)
        return False
    return answer.strip().upper().startswith("YES")
