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

    app/
      main.py            the app, CORS, and the routers it mounts
      routers/           every route; each only checks the request and calls a service
        ai.py              /ai/documents, /ai/generate, /ai/chat, /ai/status
        documents.py       /documents ..., autosave, replay, the saved AI chat
        export.py          /export/pdf
      services/          the work, as plain functions
        document_store.py    documents and their editor state (the database side)
        chat_store.py        the AI chat saved with a document
        document_generation.py  a whole document, or an edit of one, as a stream
        block_generation.py     one block of a chosen type
        widget_generation.py    interactive pages and 3D, and the "does this need 3D" check
        block_parser.py      reads and cleans what the model returns
        relevance.py         drops visuals a topic never mentions
        llm.py, gemini.py    talking to the model (tests swap llm.text_stream for a fake)
        pdf_export.py        HTML to PDF
      prompts/           every prompt sent to the model
        blocks.py            the block format
        documents.py         workbook, lesson, lesson plan
        edit.py              changing a document, adding one block
        widgets.py           interactive pages, 3D, the 3D check
        examples/            the worked 3D scenes shown to the model
      utils/             the rest
        db.py                SQLite schema and connection (data/notebook.db)
        schemas.py           the request and response models
        sse.py               one Server-Sent Events frame
        export_assets/       print.css for the PDF
    data/                created at runtime, gitignored

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
| POST | `/ai/generate` | one block of a type (`quiz`, `table`, `graph`, `html` ...): `{type, prompt, hint, current}` gives `{block}`. `current` is a widget's code to change (`html` only) |
| POST | `/ai/chat` | change the document as asked, streamed: `{instruction, context, history}` (the last 20 turns reach the model) |
| GET | `/ai/status` | whether the AI is set up |

The streamed routes send Server-Sent Events: `start`, then `open` / `text` / `close` for text and `block` for
everything else, then `done` (or `error`).

Saves send the `baseRevision` they loaded; a stale one gets `409` with the
server's revision, so one tab can't silently overwrite another.
