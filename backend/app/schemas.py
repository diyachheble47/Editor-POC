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

