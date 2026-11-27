"""Talking to the model: the one place a text stream comes from, so tests can swap in a fake model."""

from typing import AsyncIterator

from . import gemini


def text_stream(system: str, user: str, **options) -> AsyncIterator[str]:
    """The model's reply as text pieces. Callers use `llm.text_stream(...)` so a test can replace it."""
    return gemini.gemini_text_stream(system, user, **options)


async def lines_from(chunks: AsyncIterator[str]) -> AsyncIterator[str]:
    """Regroups text pieces into whole lines (the model writes one block per line)."""
    buffer = ""
    async for piece in chunks:
        buffer += piece
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            yield line
    if buffer:
        yield buffer
