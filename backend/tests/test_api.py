import importlib
import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NOTEBOOK_DATA_DIR", str(tmp_path))
    import app.utils.db as db
    import app.routers.ai as ai_router
    import app.routers.documents as documents_router
    import app.main as main

    for module in (db, ai_router, documents_router, main):
        importlib.reload(module)
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_document_lifecycle_and_autosave(client):
    doc = client.post("/documents", json={"title": "Lesson 1"}).json()
    assert doc["revision"] == 0 and doc["ownerId"] == "local-user"

    state = {"version": 1, "state": {"root": {"children": []}}}
    saved = client.put(
        f"/documents/{doc['id']}/segments/0", json={"state": state, "wordCount": 5, "baseRevision": 0}
    ).json()
    assert saved["revision"] == 1 and saved["wordCount"] == 5

    seg = client.get(f"/documents/{doc['id']}/segments/0").json()
    assert seg["state"] == state

    renamed = client.patch(f"/documents/{doc['id']}", json={"title": "Lesson 2", "baseRevision": 1}).json()
    assert renamed["title"] == "Lesson 2" and renamed["revision"] == 2

    assert [d["id"] for d in client.get("/documents").json()] == [doc["id"]]
    assert client.delete(f"/documents/{doc['id']}").status_code == 204
    assert client.get(f"/documents/{doc['id']}").status_code == 404


def test_autosave_can_carry_the_title(client):
    doc = client.post("/documents", json={"title": "Old"}).json()
    saved = client.put(
        f"/documents/{doc['id']}/segments/0", json={"state": {}, "title": "New", "baseRevision": 0}
    ).json()
    assert saved["title"] == "New"


def test_stale_revision_is_rejected(client):
    doc = client.post("/documents", json={}).json()
    first = client.put(f"/documents/{doc['id']}/segments/0", json={"state": {}, "baseRevision": 0})
    assert first.status_code == 200
    stale = client.put(f"/documents/{doc['id']}/segments/0", json={"state": {"x": 1}, "baseRevision": 0})
    assert stale.status_code == 409
    assert stale.json()["detail"]["serverRevision"] == 1


def test_deleting_document_removes_its_segments(client):
    doc = client.post("/documents", json={"id": "d1"}).json()
    client.put("/documents/d1/segments/0", json={"state": {}, "baseRevision": doc["revision"]})
    client.delete("/documents/d1")
    assert client.get("/documents/d1/segments/0").status_code == 404


def test_duplicate_document_id_conflicts(client):
    client.post("/documents", json={"id": "same"})
    assert client.post("/documents", json={"id": "same"}).status_code == 409


def test_document_streams_as_events(client):
    doc = client.post("/documents", json={"title": "S"}).json()
    para = {"type": "paragraph", "children": [{"type": "text", "text": "Hello world", "format": 1}]}
    model = {"type": "model3d", "modelUrl": "idb-asset:abc"}
    state = {"root": {"type": "root", "children": [para, model]}}
    client.put(f"/documents/{doc['id']}/segments/0", json={"state": state, "baseRevision": 0})

    res = client.get(f"/documents/{doc['id']}/stream?chunk=5&delay_ms=0")
    assert res.headers["content-type"].startswith("text/event-stream")
    frames = [f for f in res.text.split("\n\n") if f]
    parsed = [dict(line.split(": ", 1) for line in f.splitlines()) for f in frames]
    assert all(p["event"] == json.loads(p["data"])["t"] for p in parsed)
    events = [json.loads(p["data"]) for p in parsed]

    assert [e["t"] for e in events] == ["start", "open", "text", "text", "text", "close", "block", "done"]
    assert events[0]["blocks"] == 2 and events[0]["revision"] == 1
    assert "".join(e["child"]["text"] for e in events if e["t"] == "text") == "Hello world"
    assert all(e["child"]["format"] == 1 for e in events if e["t"] == "text")
    assert events[6]["node"] == model


def test_streaming_a_never_saved_document_is_404(client):
    doc = client.post("/documents", json={"title": "Empty"}).json()
    assert client.get(f"/documents/{doc['id']}/stream").status_code == 404



def test_every_request_is_logged_with_an_id_and_no_document_text(client, caplog):
    import logging

    logging.getLogger("notebook").addHandler(caplog.handler)  # the app's logger does not pass lines on to the root one
    try:
        with caplog.at_level(logging.INFO, logger="notebook"):
            doc = client.post("/documents", json={"title": "Secret lesson title"})
            miss = client.get("/documents/nope")
    finally:
        logging.getLogger("notebook").removeHandler(caplog.handler)
    assert doc.status_code == 201 and miss.status_code == 404
    lines = [r.getMessage() for r in caplog.records]
    assert any(m.startswith("POST /documents -> 201 in ") for m in lines)
    assert any(m.startswith("GET /documents/nope -> 404 in ") for m in lines)
    assert any(r.levelno == logging.WARNING and "404" in r.getMessage() for r in caplog.records)  # a failed request stands out
    assert not any("Secret lesson title" in m for m in lines)  # titles and text are never logged
    assert doc.headers["x-request-id"] and doc.headers["x-request-id"] != miss.headers["x-request-id"]


def test_a_request_id_sent_by_the_caller_is_kept(client):
    assert client.get("/health", headers={"x-request-id": "abc123"}).headers["x-request-id"] == "abc123"
