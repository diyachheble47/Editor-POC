from contextlib import asynccontextmanager

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .services import litellm_client
from .utils.db import DB_PATH, init_db
from .utils.logger import RequestTimer, get_logger, new_request_id, request_id_var, setup_logging
from .routers import ai, documents, export

# backend/.env holds LITELLM_BASE_URL and LITELLM_API_KEY (never committed).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
setup_logging()
log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    log.info("Backend started: database %s, AI %s", DB_PATH, "configured" if litellm_client.is_configured() else "NOT configured (set LITELLM_BASE_URL and LITELLM_API_KEY)")
    yield
    log.info("Backend stopped")


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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One line per request: method, path, status and how long the answer took to start.
    (A streamed answer is timed to its first byte, not to the end of the stream.)"""
    request_id = request.headers.get("x-request-id") or new_request_id()
    request_id_var.set(request_id)
    timer = RequestTimer()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("%s %s failed after %d ms", request.method, request.url.path, timer.ms)
        raise
    level = log.error if response.status_code >= 500 else log.warning if response.status_code >= 400 else log.info
    level("%s %s -> %d in %d ms", request.method, request.url.path, response.status_code, timer.ms)
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(documents.router)
app.include_router(ai.router)
app.include_router(export.router)


@app.get("/health")
def health():
    return {"status": "ok"}
