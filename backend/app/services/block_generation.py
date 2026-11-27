"""One new block of a type the teacher picked (the slash menu's Generate)."""

import logging
from typing import Optional

from ..prompts.edit import SINGLE_BLOCK_SYSTEM
from . import llm
from .block_parser import parse_block_line
from .relevance import ASKED_3D, is_relevant
from .widget_generation import make_widget

log = logging.getLogger("notebook.ai")

async def generate_block(block_type: str, prompt: str, hint: str = "", current: str = "") -> Optional[dict]:
    """One new block of `block_type` about `prompt`, or None when the model gave nothing usable.

    `hint` tells the model what to make when a type has two uses (a table, or a table with formulas).
    `current` is a widget's existing code, when the teacher asks for a change to it (type "html" only).
    """
    wanted = f"{prompt.strip()}. It must be {hint.strip()}." if hint.strip() else prompt.strip()
    if block_type == "html":
        # A page only works whole, and gets the dedicated (stronger, longer) HTML pass.
        code = await make_widget(wanted, current, three_d=bool(ASKED_3D.search(prompt)))
        return {"type": "html", "title": prompt.strip()[:80], "code": code} if code else None
    user = f"Add ONE new {block_type} block about: {wanted} Nothing else: no heading, no title, no intro text, and no other block."
    lines = llm.lines_from(llm.text_stream(SINGLE_BLOCK_SYSTEM, user))
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
