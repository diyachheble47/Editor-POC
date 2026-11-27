from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class DocumentOut(BaseModel):
    id: str
    title: str
    createdAt: str
    updatedAt: str
    schemaVersion: int
    wordCount: int
    revision: int
    ownerId: str


class DocumentCreate(BaseModel):
    id: str | None = None
    title: str = "Untitled"


class DocumentPatch(BaseModel):
    title: str | None = None
    wordCount: int | None = Field(default=None, ge=0)
    baseRevision: int


class SegmentIn(BaseModel):
    # The editor's `{ version, state }` envelope, stored as-is.
    state: Any
    heading: str | None = None
    title: str | None = None
    wordCount: int | None = Field(default=None, ge=0)
    baseRevision: int


class SegmentOut(BaseModel):
    documentId: str
    position: int
    heading: str | None
    state: Any
    updatedAt: str
    revision: int



class ChatMessage(BaseModel):
    id: str = Field(max_length=64)
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=4000)
    kind: str | None = Field(default=None, max_length=20)
    status: str | None = Field(default=None, max_length=20)
    peek: str | None = Field(default=None, max_length=600)
    at: int = 0


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(max_length=200)


class ChatOut(BaseModel):
    messages: list[ChatMessage]


class ChatAppend(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


# ── AI requests ──────────────────────────────────────────────────────────────────────────────

# What a block request can ask for: exactly one block of one of these types.
BLOCK_TYPES = (
    "drawing", "table", "quiz", "html", "equation", "math", "graph", "geometry",
    "molecule", "circuit", "matrix", "flowchart", "chart",
)

MAX_SOURCES = 3
MAX_SOURCE_CHARS = 120_000
MAX_SOURCES_TOTAL = 150_000


class SourceText(BaseModel):
    """A document the teacher attached; only its text is ever sent here."""

    name: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)


class DocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    # Text of the document the agent was opened on; when present the result is
    # built from it instead of from the title alone.
    context: str = Field(default="", max_length=30000)
    kind: Literal["workbook", "lesson_plan", "lesson"]
    # Documents to write from ("/agent workbook from a file").
    sources: list[SourceText] = Field(default_factory=list, max_length=MAX_SOURCES)

    @model_validator(mode="after")
    def _sources_fit(self):
        if sum(len(s.text) for s in self.sources) > MAX_SOURCES_TOTAL:
            raise ValueError("The attached documents are too long.")
        return self


class BlockRequest(BaseModel):
    type: Literal[BLOCK_TYPES]  # type: ignore[valid-type]
    prompt: str = Field(min_length=1, max_length=2000)
    # Tells the model what to make when two choices share a type (a table, or a table with formulas).
    hint: str = Field(default="", max_length=300)
    # A widget's current code, when the teacher is asking for a change to it (type "html" only).
    current: str = Field(default="", max_length=20000)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


MAX_CHAT_TURNS = 20


class ChatRequest(BaseModel):
    title: str = Field(default="Untitled", max_length=120)
    instruction: str = Field(min_length=1, max_length=2000)
    # The document's blocks (or the selected ones), numbered as the editor sends them.
    context: str = Field(default="", max_length=30000)
    # The conversation so far, oldest first, so a follow-up can be understood. The last MAX_CHAT_TURNS are used.
    history: list[ChatTurn] = Field(default_factory=list, max_length=100)


# ── PDF export ───────────────────────────────────────────────────────────────────────────────

class PdfIn(BaseModel):
    title: str = Field(default="Untitled", max_length=300)
    html: str = Field(max_length=20_000_000)  # the document body, already rendered
    styles: str = Field(default="", max_length=5_000_000)  # the app's block styles
    baseUrl: str = Field(default="", max_length=300)  # where the app's fonts/assets live
