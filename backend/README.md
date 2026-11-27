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
- `app/routers/documents.py` — documents, the autosave endpoint, the AI chat history
- `app/routers/ai.py` — the AI routes (request checks only)
- `app/ai_service.py` — the AI work: documents, single blocks, chat edits, widgets and 3D
- `app/ai_prompts.py`, `app/ai_blocks.py` — the prompts, and the checking of what the model returns
- `data/` — created at runtime, gitignored

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/documents` | list documents |
| POST | `/documents` | create (optional `id`, `title`) |
| GET/PATCH/DELETE | `/documents/{id}` | read, rename, delete |
| GET | `/documents/{id}/segments/{n}` | load the editor state |
| PUT | `/documents/{id}/segments/{n}` | autosave: `{state, baseRevision}` |
| GET | `/documents/{id}/ai-chat` | the saved AI chat of a document |
| POST | `/documents/{id}/ai-chat/messages` | add messages to the end of that chat (never replaces it) |
| PUT | `/documents/{id}/ai-chat` | replace the whole chat (older route) |

### AI

| Method | Path | Purpose |
|---|---|---|
| POST | `/ai/documents` | a workbook, lesson or lesson plan, streamed (`kind`, `title`, `description`, `context`, `sources`) |
| POST | `/ai/blocks` | one block of a type (`quiz`, `table`, `graph`, `html` ...): `{type, prompt, hint}` gives `{block}` |
| POST | `/ai/chat` | change the document as asked, streamed: `{instruction, context, history}` (the last 20 turns reach the model) |
| GET | `/ai/status` | whether the AI is set up |
| POST | `/ai/generate` | older route the editor still calls: one handler for every kind, same work as the three above |
| POST | `/ai/html` | older route: one interactive widget (`/ai/blocks` with type `html` does this) |

The streamed routes send Server-Sent Events: `start`, then `open` / `text` / `close` for text and `block` for
everything else, then `done` (or `error`).

Saves send the `baseRevision` they loaded; a stale one gets `409` with the
server's revision, so one tab can't silently overwrite another.
