"""The model. Every AI call goes through the LiteLLM proxy (it speaks the OpenAI chat API), and always to the
same model, MODEL below: nothing else is ever asked for.

    LITELLM_BASE_URL   the proxy, e.g. https://litellm-dev.7seers.ai
    LITELLM_API_KEY    its key (backend/.env, never committed)
"""

import os
import time
from typing import AsyncIterator

from ..utils.logger import get_logger

log = get_logger("model")

MODEL = "gemini/gemini-3.1-flash-lite"
REQUEST_TIMEOUT_MS = 90_000


def is_configured() -> bool:
    return bool(os.getenv("LITELLM_API_KEY", "").strip() and os.getenv("LITELLM_BASE_URL", "").strip())


async def litellm_text_stream(system: str, user: str, timeout_ms: int = REQUEST_TIMEOUT_MS) -> AsyncIterator[str]:
    """Yields the model's reply as text pieces while it is being generated."""
    from openai import AsyncOpenAI  # imported here so the rest of the API starts without it

    client = AsyncOpenAI(
        api_key=os.environ["LITELLM_API_KEY"].strip(),
        base_url=os.environ["LITELLM_BASE_URL"].strip().rstrip("/"),
        timeout=timeout_ms / 1000,  # never hang forever
        max_retries=0,
    )
    started = time.perf_counter()
    sent = 0
    log.info("model call: %s (prompt %d chars)", MODEL, len(system) + len(user))
    try:
        stream = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.7,
            # A 3-4 page document is far more than a default output allowance; cutting off mid-stream
            # would silently drop its last sections.
            max_tokens=32768,
            stream=True,
        )
        async for chunk in stream:
            piece = chunk.choices[0].delta.content if chunk.choices else None
            if piece:
                sent += len(piece)
                yield piece
    finally:
        # also runs when the caller stops early or the client leaves
        log.info("model call done: %s, %d chars in %d ms", MODEL, sent, int((time.perf_counter() - started) * 1000))
        await client.close()
