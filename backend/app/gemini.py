"""Thin wrapper around the Gemini API. The key is read from the environment
(backend/.env) and never leaves the server."""
import os
from typing import AsyncIterator, Optional

# Google retires and adds models often (newest ones can be overloaded and time
# out); set GEMINI_MODEL in .env to change this without touching code.
DEFAULT_MODEL = "gemini-3.1-flash-lite"
REQUEST_TIMEOUT_MS = 90_000


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY", "").strip())


def _thinking_level():
    from google.genai import types

    name = os.getenv("GEMINI_THINKING", "minimal").strip().upper()
    return getattr(types.ThinkingLevel, name, types.ThinkingLevel.MINIMAL)


def _thinking_config(model: str, level: Optional[str]):
    """The thinking setting for a model: 2.5 models take a token budget, newer ones a named level."""
    from google.genai import types

    if level is None:
        return types.ThinkingConfig(thinking_level=_thinking_level())
    if model.startswith("gemini-2.5"):
        budget = {"MINIMAL": 0, "LOW": 1024, "MEDIUM": 4096, "HIGH": 8192}.get(level.upper(), 1024)
        return types.ThinkingConfig(thinking_budget=max(budget, 128) if "pro" in model else budget)
    return types.ThinkingConfig(thinking_level=getattr(types.ThinkingLevel, level.upper(), types.ThinkingLevel.LOW))


async def gemini_text_stream(
    system: str, user: str, model: Optional[str] = None, thinking: Optional[str] = None,
    timeout_ms: int = REQUEST_TIMEOUT_MS,
) -> AsyncIterator[str]:
    """Yields the model's reply as text pieces while it is being generated.

    `model` / `thinking` override the defaults for one call (the 3D pass uses a stronger model)."""
    from google import genai  # imported here so the rest of the API works without it
    from google.genai import types

    client = genai.Client(
        api_key=os.environ["GEMINI_API_KEY"].strip(),
        http_options=types.HttpOptions(timeout=timeout_ms),  # never hang forever
    )
    name = (model or os.getenv("GEMINI_MODEL", DEFAULT_MODEL)).strip() or DEFAULT_MODEL
    stream = await client.aio.models.generate_content_stream(
        model=name,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.7,
            # A 3-4 page document is far more than the default output allowance; cutting off mid-stream
            # would silently drop its last sections.
            max_output_tokens=32768,
            # The model "thinks" before its first word, which can take 30s+ and
            # looks like a hang. Writing a lesson doesn't need much of it.
            thinking_config=_thinking_config(name, thinking),
        ),
    )
    async for chunk in stream:
        if chunk.text:
            yield chunk.text
