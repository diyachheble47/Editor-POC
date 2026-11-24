from contextlib import asynccontextmanager

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import ai, documents, export

# backend/.env holds GEMINI_API_KEY (never committed).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Teacher Notebook API", lifespan=lifespan)

# The Vite dev server (and `vite preview`) run on these origins.
# Any private-LAN address (192.168.x, 10.x, 172.16-31.x) is also allowed, so the app
# opened on another device on the same network can reach this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_origin_regex=r"^http://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(ai.router)
app.include_router(export.router)


@app.get("/health")
def health():
    return {"status": "ok"}
