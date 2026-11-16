import re
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse

from ..db import ASSET_DIR, get_conn
from ..schemas import AssetOut

router = APIRouter(prefix="/assets", tags=["assets"])

# Same id space as the frontend's assetStore.ts keys (a node's modelId, a
# UUID). Restricting the characters also keeps ids safe to use as file names.
ASSET_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")
MAX_BYTES = 100 * 1024 * 1024


def valid_id(asset_id: str) -> str:
    if not ASSET_ID.match(asset_id):
        raise HTTPException(400, "Invalid asset id")
    return asset_id


def to_asset(row: sqlite3.Row) -> AssetOut:
    return AssetOut(
        assetId=row["asset_id"],
        filename=row["filename"],
        mimeType=row["mime_type"],
        size=row["size"],
        createdAt=row["created_at"],
    )


@router.get("", response_model=list[AssetOut])
def list_assets(conn: sqlite3.Connection = Depends(get_conn)):
    return [to_asset(r) for r in conn.execute("SELECT * FROM asset_metadata ORDER BY created_at DESC")]


@router.put("/{asset_id}", response_model=AssetOut)
def put_asset(asset_id: str, file: UploadFile, conn: sqlite3.Connection = Depends(get_conn)):
    valid_id(asset_id)
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    (ASSET_DIR / asset_id).write_bytes(data)
    conn.execute(
        """
        INSERT INTO asset_metadata (asset_id, filename, mime_type, size, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (asset_id) DO UPDATE SET
            filename = excluded.filename, mime_type = excluded.mime_type, size = excluded.size
        """,
        (
            asset_id,
            file.filename or asset_id,
            file.content_type or "application/octet-stream",
            len(data),
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    return to_asset(conn.execute("SELECT * FROM asset_metadata WHERE asset_id = ?", (asset_id,)).fetchone())


@router.get("/{asset_id}")
def get_asset(asset_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    valid_id(asset_id)
    row = conn.execute("SELECT * FROM asset_metadata WHERE asset_id = ?", (asset_id,)).fetchone()
    path = ASSET_DIR / asset_id
    if row is None or not path.exists():
        raise HTTPException(404, "Asset not found")
    return FileResponse(path, media_type=row["mime_type"], filename=row["filename"])


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str, conn: sqlite3.Connection = Depends(get_conn)):
    valid_id(asset_id)
    (ASSET_DIR / asset_id).unlink(missing_ok=True)
    conn.execute("DELETE FROM asset_metadata WHERE asset_id = ?", (asset_id,))
    return Response(status_code=204)
