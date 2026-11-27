"""Logging for the whole backend: one format, one place that sets it up.

    LOG_LEVEL   DEBUG, INFO (default), WARNING or ERROR
    LOG_FILE    where the log file goes (default data/logs/app.log, 2 MB x 3 files); 0 turns the file off

Every line carries the id of the request it belongs to (also sent back as the X-Request-ID header), so one
request can be followed through the routes and services. Titles, prompts, document text and keys are never
logged: only sizes, counts, ids, models and timings.
"""

import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .db import DATA_DIR

ROOT = "notebook"
FORMAT = "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def get_logger(name: str) -> logging.Logger:
    """A logger under `notebook.`, e.g. get_logger("ai") is "notebook.ai"."""
    return logging.getLogger(f"{ROOT}.{name}")


def new_request_id() -> str:
    return uuid.uuid4().hex[:8]


def setup_logging() -> None:
    """Sets the handlers once. Safe to call again (a reload in tests, a second import)."""
    root = logging.getLogger(ROOT)
    if getattr(root, "_configured", False):
        return
    root._configured = True  # type: ignore[attr-defined]
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO")
    root.propagate = False  # not repeated by the root logger or uvicorn

    formatter = logging.Formatter(FORMAT)
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(formatter)
    stream.addFilter(_RequestIdFilter())
    root.addHandler(stream)

    target = os.getenv("LOG_FILE", "").strip()
    if target != "0":
        path = Path(target) if target else DATA_DIR / "logs" / "app.log"
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            file = RotatingFileHandler(path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
            file.setFormatter(formatter)
            file.addFilter(_RequestIdFilter())
            root.addHandler(file)
        except OSError:
            root.warning("Could not open the log file %s: logging to the console only", path)

    # One line per request comes from our own middleware (with the time it took), so uvicorn's is turned off.
    logging.getLogger("uvicorn.access").disabled = True


class RequestTimer:
    """Measures one request for the access line."""

    def __init__(self) -> None:
        self.start = time.perf_counter()

    @property
    def ms(self) -> int:
        return int((time.perf_counter() - self.start) * 1000)
