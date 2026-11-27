from typing import Any

from pydantic import BaseModel, Field


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
