# Teacher Notebook backend

FastAPI + SQLite. Documents are stored as JSON, 3D model files on disk.

## Run

    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn app.main:app --reload --port 8000

Interactive API docs: http://localhost:8000/docs

## Test

    .venv/bin/python -m pytest

## Layout

- `app/main.py` — app, CORS for the Vite dev server
- `app/db.py` — SQLite schema and connection (`data/notebook.db`)
- `app/routers/documents.py` — documents and the autosave endpoint
- `data/` — created at runtime, gitignored

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/documents` | list documents |
| POST | `/documents` | create (optional `id`, `title`) |
| GET/PATCH/DELETE | `/documents/{id}` | read, rename, delete |
| GET | `/documents/{id}/segments/{n}` | load the editor state |
| PUT | `/documents/{id}/segments/{n}` | autosave: `{state, baseRevision}` |

Saves send the `baseRevision` they loaded; a stale one gets `409` with the
server's revision, so one tab can't silently overwrite another.
