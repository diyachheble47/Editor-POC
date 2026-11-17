import json


def sse(event: dict, event_id: int) -> bytes:
    """One Server-Sent Event frame: `id`, `event` (the type), `data` (JSON), blank line."""
    data = json.dumps(event, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event['t']}\ndata: {data}\n\n".encode()
