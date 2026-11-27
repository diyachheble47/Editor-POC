"""PDF export route. The rendering is in services/pdf_export.py."""

import logging
import re

from fastapi import APIRouter, HTTPException, Response

from ..services.pdf_export import render_pdf
from ..utils.schemas import PdfIn

router = APIRouter(prefix="/export", tags=["export"])
log = logging.getLogger(__name__)


@router.post("/pdf")
def export_pdf(body: PdfIn):
    try:
        pdf = render_pdf(body.title, body.html, body.styles, body.baseUrl)
    except ImportError:
        raise HTTPException(503, "PDF export needs WeasyPrint: pip install -r backend/requirements.txt")
    except Exception:  # noqa: BLE001 - surface a clean error, keep the detail in the log
        log.exception("PDF export failed")
        raise HTTPException(500, "Could not build the PDF")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", body.title).strip("_") or "document"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
