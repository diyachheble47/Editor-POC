# Teacher Notebook editor (POC)

A block editor for teachers, built on Lexical, with STEM blocks and AI generation.

- **Editor:** React 19, Lexical, Vite. Blocks: text, tables, spreadsheet, matrix, equations (KaTeX), graph (JSXGraph), geometry, chart, flowchart, electric circuit (React Flow), molecule (SmilesDrawer), code, image, 3D model, drawing.
- **Backend:** FastAPI + SQLite (`backend/`), SSE streaming, Gemini document generation (`/agent` and the top-bar button).
- **Files:** images and 3D models live in the browser's IndexedDB; the document stores only an `idb-asset:<id>` reference.

## Run

```bash
npm install
npm run dev                      # http://localhost:5173

cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env             # add GEMINI_API_KEY
.venv/bin/uvicorn app.main:app --port 8000 --reload
```

## Check

```bash
npx tsc -b && npx vitest run     # types and unit tests
npx oxlint src                   # lint
cd backend && .venv/bin/python -m pytest -q
```

More: `backend/README.md` (API), `STREAMING.md` (how documents stream in).
