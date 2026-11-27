import asyncio

from app.services import litellm_client


class _Chunk:
    def __init__(self, text):
        self.choices = [type("C", (), {"delta": type("D", (), {"content": text})()})()] if text is not None else []


def _fake_openai(calls):
    class FakeCompletions:
        async def create(self, **kwargs):
            calls["create"] = kwargs

            async def stream():
                for piece in ("Hel", None, "lo"):  # a chunk with no text (or no choices) is skipped
                    yield _Chunk(piece)

            return stream()

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client"] = kwargs
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

        async def close(self):
            calls["closed"] = True

    return FakeClient


def test_the_model_is_asked_through_litellm_and_always_the_same_one(monkeypatch):
    import openai

    calls = {}
    monkeypatch.setenv("LITELLM_API_KEY", " sk-test ")
    monkeypatch.setenv("LITELLM_BASE_URL", "https://proxy.example/")
    monkeypatch.setattr(openai, "AsyncOpenAI", _fake_openai(calls))

    async def run():
        return [p async for p in litellm_client.litellm_text_stream("be brief", "hi", timeout_ms=5000)]

    assert asyncio.run(run()) == ["Hel", "lo"]
    assert calls["client"]["base_url"] == "https://proxy.example"  # no trailing slash
    assert calls["client"]["api_key"] == "sk-test" and calls["client"]["timeout"] == 5
    sent = calls["create"]
    assert sent["model"] == "gemini/gemini-3.1-flash-lite" == litellm_client.MODEL
    assert sent["stream"] is True
    assert [m["role"] for m in sent["messages"]] == ["system", "user"]
    assert calls["closed"]  # the connection is closed when the stream ends


def test_the_ai_needs_both_a_key_and_a_proxy_address(monkeypatch):
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.setenv("LITELLM_API_KEY", "sk-x")
    assert litellm_client.is_configured() is False
    monkeypatch.setenv("LITELLM_BASE_URL", "https://proxy.example")
    assert litellm_client.is_configured() is True
    monkeypatch.setenv("LITELLM_API_KEY", "  ")
    assert litellm_client.is_configured() is False
