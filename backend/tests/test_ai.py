import json

import pytest

from app.ai_blocks import parse_block_line, sanitize_block

from .test_api import client  # noqa: F401  (fixture)


def frames(res):
    parsed = [dict(line.split(": ", 1) for line in f.splitlines()) for f in res.text.split("\n\n") if f]
    return [json.loads(p["data"]) for p in parsed]


def fake_model(*pieces):
    async def stream(system, user):
        for p in pieces:
            yield p

    return lambda system, user: stream(system, user)


BODY = {"title": "Acids", "description": "class 10", "kind": "lesson"}


def test_sanitize_accepts_known_blocks_and_fixes_small_problems():
    assert sanitize_block({"type": "heading", "level": 9, "text": " Hi "}) == {"type": "heading", "level": 2, "text": "Hi"}
    assert sanitize_block({"type": "equation", "latex": "a^2+b^2=c^2"}) == {"type": "math", "latex": "a^2+b^2=c^2"}
    assert sanitize_block({"type": "equation", "latex": "\\frac{a}{b}"})["latex"] == "\\frac{a}{b}"
    assert sanitize_block({"type": "equation", "chem": "2H2 + O2 -> 2H2O"})["value"] == "2H2 + O2 -> 2H2O"
    assert sanitize_block({"type": "callout", "variant": "nope", "text": "x"})["variant"] == "info"
    assert sanitize_block({"type": "numbered", "items": ["a", "", 5, "b"]})["items"] == ["a", "b"]


def test_sanitize_rejects_unknown_or_empty_blocks():
    for bad in (None, "x", {"type": "script", "text": "x"}, {"type": "paragraph", "text": "  "}, {"type": "bullets", "items": []}):
        assert sanitize_block(bad) is None


def test_parse_line_ignores_fences_blank_and_junk():
    assert parse_block_line("```json") is None
    assert parse_block_line("") is None
    assert parse_block_line("not json at all") is None
    assert parse_block_line('{"type":"paragraph","text":"ok"}') == {"type": "paragraph", "text": "ok"}
    assert parse_block_line('1. {"type":"paragraph","text":"ok"},') == {"type": "paragraph", "text": "ok"}


def test_status_reports_whether_a_key_is_set(client, monkeypatch):  # noqa: F811
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.get("/ai/status").json() == {"configured": False}
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    assert client.get("/ai/status").json() == {"configured": True}


def test_generate_without_a_key_is_503(client, monkeypatch):  # noqa: F811
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = client.post("/ai/generate", json=BODY)
    assert res.status_code == 503 and "GEMINI_API_KEY" in res.json()["detail"]


def test_generate_rejects_bad_input(client, monkeypatch):  # noqa: F811
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    assert client.post("/ai/generate", json={**BODY, "kind": "poem"}).status_code == 422
    assert client.post("/ai/generate", json={**BODY, "title": ""}).status_code == 422


def test_generate_streams_blocks_from_the_model(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("AI_TYPING_DELAY_MS", "0")
    # Pieces deliberately cut mid-line, with a fence, junk and a forbidden block.
    monkeypatch.setattr(ai_router, "text_stream", fake_model(
        '```json\n{"type":"heading","level":1,"te',
        'xt":"Acids"}\n{"type":"paragraph","text":"Acids taste sour."}\n',
        '{"type":"script","text":"alert(1)"}\nrubbish\n{"type":"equation","chem":"HCl -> H+ + Cl-"}',
    ))
    events = frames(client.post("/ai/generate", json=BODY))

    assert [e["t"] for e in events if e["t"] in ("open", "block", "done", "error")] == ["open", "open", "block", "done"]
    assert events[0] == {"t": "start"} and events[-1] == {"t": "done", "blocks": 3}
    assert events[1]["block"] == {"type": "heading", "level": 1}
    typed = "".join(e["text"] for e in events if e["t"] == "text")
    assert typed == "AcidsAcids taste sour."
    assert [e["block"] for e in events if e["t"] == "block"] == [{"type": "equation", "value": "HCl -> H+ + Cl-"}]


def test_generate_reports_a_model_failure_without_leaking_details(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    monkeypatch.setenv("GEMINI_API_KEY", "super-secret-key")

    async def boom(system, user):
        raise RuntimeError("quota exceeded for key super-secret-key")
        yield ""  # pragma: no cover

    monkeypatch.setattr(ai_router, "text_stream", lambda s, u: boom(s, u))
    events = frames(client.post("/ai/generate", json=BODY))
    assert events[-1]["t"] == "error"
    assert "super-secret-key" not in json.dumps(events)


def test_generate_with_no_usable_output_is_an_error(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setattr(ai_router, "text_stream", fake_model("sorry, I cannot do that"))
    assert frames(client.post("/ai/generate", json=BODY))[-1]["t"] == "error"


def test_sanitize_table_and_matrix_are_rectangular_and_bounded():
    t = sanitize_block({"type": "table", "rows": [["Acid", "Formula"], ["HCl"], [None, 5]]})
    assert t == {"type": "table", "rows": [["Acid", "Formula"], ["HCl", ""], ["", "5"]]}
    assert len(sanitize_block({"type": "table", "rows": [["x"]] * 50})["rows"]) == 20
    assert len(sanitize_block({"type": "matrix", "rows": [[1] * 20] * 20})["rows"][0]) == 6
    assert sanitize_block({"type": "table", "rows": "no"}) is None


def test_sanitize_graph_keeps_safe_functions_and_clamps_points():
    g = sanitize_block({"type": "graph", "functions": ["x^2", "__import__('os')", "2*x+1"], "points": [[1, 2], [99, -99], ["a", 1]]})
    assert g["functions"] == ["x^2", "2*x+1"]
    assert g["points"] == [[1.0, 2.0], [10.0, -10.0]]
    assert sanitize_block({"type": "graph", "functions": ["__x__;"], "points": []}) is None


def test_sanitize_geometry_needs_real_shapes():
    ok = sanitize_block({"type": "geometry", "polygons": [[[0, 0], [4, 0], [0, 3]], [[0, 0], [1, 1]]], "segments": [[[0, 0], [5, 5]]]})
    assert len(ok["polygons"]) == 1 and len(ok["segments"]) == 1
    assert sanitize_block({"type": "geometry", "polygons": [], "segments": []}) is None


def test_sanitize_molecule_only_known_names():
    assert sanitize_block({"type": "molecule", "name": "Acetic Acid"}) == {"type": "molecule", "name": "acetic_acid"}
    assert sanitize_block({"type": "molecule", "name": "unobtainium"}) is None


def test_sanitize_circuit_drops_unknown_parts_and_dangling_wires():
    c = sanitize_block({
        "type": "circuit",
        "parts": [
            {"id": "b1", "type": "battery", "value": "9 V"},
            {"id": "r1", "type": "resistor"},
            {"id": "x", "type": "warp-core"},
            {"id": "r1", "type": "resistor"},
            {"id": "s1", "type": "switch", "closed": True},
        ],
        "wires": [["b1", "r1"], ["r1", "x"], ["r1", "r1"], ["r1", "s1"]],
    })
    assert [p["id"] for p in c["parts"]] == ["b1", "r1", "s1"]
    assert c["parts"][2]["closed"] is True
    assert c["wires"] == [["b1", "r1"], ["r1", "s1"]]
    assert sanitize_block({"type": "circuit", "parts": [{"id": "a", "type": "battery"}], "wires": []}) is None


def test_sanitize_quote_divider_and_code():
    assert sanitize_block({"type": "quote", "text": "q"}) == {"type": "quote", "text": "q"}
    assert sanitize_block({"type": "divider"}) == {"type": "divider"}
    assert sanitize_block({"type": "code", "language": "py thon!", "text": "print(1)"})["language"] == "plain"


def test_chart_and_flowchart_blocks_are_cleaned():
    # Both are now plain Mermaid text, cleaned the same way.
    from app.ai_blocks import sanitize_block
    chart = sanitize_block({"type": "chart", "code": '```mermaid\npie title T\n  "a" : 1\n  "b" : 2\n```'})
    assert chart == {"type": "chart", "code": 'pie title T\n  "a" : 1\n  "b" : 2'}
    assert sanitize_block({"type": "chart", "code": "pie title T\n  <script>alert(1)</script>"}) is None
    assert sanitize_block({"type": "chart", "code": ""}) is None
    flow = sanitize_block({"type": "flowchart", "code": "```mermaid\nflowchart TD\n  A --> B\n```"})
    assert flow == {"type": "flowchart", "code": "flowchart TD\n  A --> B"}
    assert sanitize_block({"type": "flowchart", "code": "flowchart TD\n  A --> B\n  <script>alert(1)</script>"}) is None
    assert sanitize_block({"type": "flowchart", "code": ""}) is None


def test_off_topic_visuals_are_dropped_but_on_topic_ones_stay():
    from app.relevance import block_text, is_relevant
    acids = "Acids, bases and salts. Class 10 chemistry lesson on pH"
    assert not is_relevant("circuit", acids)      # no circuits in a chemistry lesson
    assert not is_relevant("geometry", acids)
    assert is_relevant("molecule", acids)
    assert is_relevant("chart", acids) and is_relevant("flowchart", acids)  # never filtered
    assert is_relevant("circuit", "Series and parallel circuits")
    assert is_relevant("geometry", "Area of a triangle")
    assert not is_relevant("molecule", "Series and parallel circuits")
    # text written earlier in the document counts as context
    assert is_relevant("circuit", acids + " " + block_text({"text": "Now an electric circuit with a battery"}))



def test_keep_block_is_only_a_valid_reference():
    assert sanitize_block({"type": "keep", "ref": 3}) == {"type": "keep", "ref": 3}
    for bad in ({"type": "keep"}, {"type": "keep", "ref": -1}, {"type": "keep", "ref": "2"}, {"type": "keep", "ref": True}):
        assert sanitize_block(bad) is None


def test_edit_needs_document_and_instruction(client, monkeypatch):  # noqa: F811
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    base = {"title": "Acids", "kind": "edit"}
    assert client.post("/ai/generate", json={**base, "description": "make it easier"}).status_code == 422
    assert client.post("/ai/generate", json={**base, "context": "#0 paragraph: hi"}).status_code == 422


def test_edit_streams_keep_and_changed_blocks(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    seen = {}

    def model(system, user):
        seen["system"], seen["user"] = system, user
        return fake_model('{"type":"keep","ref":0}\n{"type":"paragraph","text":"Easier."}\n')(system, user)

    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setattr(ai_router, "text_stream", model)
    res = client.post("/ai/generate", json={
        "title": "Acids", "kind": "edit", "description": "make it easier", "context": "#0 heading(1): Acids",
    })
    events = frames(res)
    assert {"t": "block", "block": {"type": "keep", "ref": 0}} in events
    assert events[-1]["t"] == "done"
    assert "make it easier" in seen["user"] and "#0 heading(1): Acids" in seen["user"]
    assert "keep" in seen["system"]


def test_ai_chat_is_saved_per_document(client):  # noqa: F811
    doc = client.post("/documents", json={"title": "Chat doc"}).json()
    other = client.post("/documents", json={"title": "Other"}).json()
    assert client.get(f"/documents/{doc['id']}/ai-chat").json() == {"messages": []}
    msgs = [{"id": "m1", "role": "user", "text": "make a workbook", "kind": "workbook", "status": None, "peek": "Acids taste sour", "at": 1}]
    assert client.put(f"/documents/{doc['id']}/ai-chat", json={"messages": msgs}).status_code == 200
    assert client.get(f"/documents/{doc['id']}/ai-chat").json()["messages"][0]["text"] == "make a workbook"
    assert client.get(f"/documents/{doc['id']}/ai-chat").json()["messages"][0]["peek"] == "Acids taste sour"
    assert client.get(f"/documents/{other['id']}/ai-chat").json() == {"messages": []}
    assert client.put("/documents/nope/ai-chat", json={"messages": []}).status_code == 404
    bad = [{"id": "m", "role": "robot", "text": "x"}]
    assert client.put(f"/documents/{doc['id']}/ai-chat", json={"messages": bad}).status_code == 422


def test_section_toc_tabs_and_quiz_blocks_are_cleaned():
    assert sanitize_block({"type": "section", "text": " 1. Intro "}) == {"type": "section", "text": "1. Intro"}
    assert sanitize_block({"type": "section", "text": " "}) is None
    assert sanitize_block({"type": "toc", "junk": 1}) == {"type": "toc"}

    tabs = sanitize_block({"type": "tabs", "items": [{"title": "A", "text": "a"}, {"title": "", "text": "x"}, {"title": "B", "text": "b"}, "no"]})
    assert tabs == {"type": "tabs", "items": [{"title": "A", "text": "a"}, {"title": "B", "text": "b"}]}
    assert sanitize_block({"type": "tabs", "items": [{"title": "A", "text": "a"}]}) is None  # one tab is not tabs

    quiz = sanitize_block({"type": "quiz", "questions": [
        {"q": "2+2?", "options": ["3", "4", ""], "answer": 1, "why": "Four."},
        {"q": "bad answer index", "options": ["a", "b"], "answer": 5},
        {"q": "one option", "options": ["a"], "answer": 0},
        {"q": "bool answer", "options": ["a", "b"], "answer": True},
    ]})
    assert quiz == {"type": "quiz", "questions": [{"q": "2+2?", "options": ["3", "4"], "answer": 1, "why": "Four."}]}
    assert sanitize_block({"type": "quiz", "questions": []}) is None


def test_generate_types_a_section_heading_like_a_heading(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("AI_TYPING_DELAY_MS", "0")
    monkeypatch.setattr(ai_router, "text_stream", fake_model('{"type":"section","text":"1. Intro"}\n{"type":"toc"}\n'))
    events = frames(client.post("/ai/generate", json=BODY))
    kinds = [e["t"] for e in events]
    assert kinds[:4] == ["start", "open", "text", "close"] or "open" in kinds
    assert {"t": "open", "block": {"type": "section"}} in events
    assert {"t": "block", "block": {"type": "toc"}} in events
    assert "".join(e["text"] for e in events if e["t"] == "text") == "1. Intro"


GOOD_HTML = "<!doctype html><html><body><button onclick=\"document.title='x'\">Go</button></body></html>"


def test_clean_html_keeps_self_contained_pages_and_turns_away_network_code():
    from app.ai_blocks import clean_html

    assert clean_html("```html\n" + GOOD_HTML + "\n```") == GOOD_HTML
    for bad in ("", "   ", "no tags at all", None, 5,
                '<script src="https://cdn.x/y.js"></script>', "<script>fetch('/api')</script>",
                "<script>window.parent.document.body</script>", "<iframe src=x></iframe>",
                "<style>@import url(x)</style><p>x</p>", "<p>" + "a" * 21000 + "</p>"):
        assert clean_html(bad) is None


def test_html_endpoint_returns_the_widget_or_a_clear_error(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    monkeypatch.setenv("GEMINI_API_KEY", "x")
    seen = {}

    def model(system, user):
        seen["user"] = user
        return fake_model("```html\n", GOOD_HTML, "\n```")(system, user)

    monkeypatch.setattr(ai_router, "text_stream", model)
    res = client.post("/ai/html", json={"prompt": "a slider", "current": "<p>old</p>"})
    assert res.status_code == 200 and res.json() == {"code": GOOD_HTML}
    assert "a slider" in seen["user"] and "<p>old</p>" in seen["user"]

    monkeypatch.setattr(ai_router, "text_stream", fake_model("I cannot do that"))
    assert client.post("/ai/html", json={"prompt": "x"}).status_code == 422
    monkeypatch.delenv("GEMINI_API_KEY")
    assert client.post("/ai/html", json={"prompt": "x"}).status_code == 503
    assert client.post("/ai/html", json={"prompt": ""}).status_code == 422


def test_html_block_in_a_document_only_when_interactive_was_asked(client, monkeypatch):  # noqa: F811
    import app.routers.ai as ai_router

    line = json.dumps({"type": "html", "title": "Sim", "code": GOOD_HTML}) + "\n"
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("AI_TYPING_DELAY_MS", "0")
    monkeypatch.setattr(ai_router, "text_stream", fake_model('{"type":"paragraph","text":"hi"}\n' + line))

    plain = frames(client.post("/ai/generate", json=BODY))  # "Acids, class 10": nothing interactive asked
    assert not any(e.get("block", {}).get("type") == "html" for e in plain)

    asked = frames(client.post("/ai/generate", json={**BODY, "description": "include an interactive simulation"}))
    assert any(e.get("block", {}).get("type") == "html" for e in asked)
