"""PDF export: turns the rendered document (HTML sent by the editor) into a PDF
with WeasyPrint, so layout, fonts and page breaks are controlled here rather than
by the browser's print dialog."""
import logging
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/export", tags=["export"])
log = logging.getLogger(__name__)

PRINT_CSS = Path(__file__).resolve().parent.parent / "export_assets" / "print.css"
_LOCAL_HOST = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$")


class PdfIn(BaseModel):
    title: str = Field(default="Untitled", max_length=300)
    html: str = Field(max_length=20_000_000)  # the document body, already rendered
    styles: str = Field(default="", max_length=5_000_000)  # the app's block styles
    baseUrl: str = Field(default="", max_length=300)  # where the app's fonts/assets live


# Preview pictures of embedded videos / simulations (https only, these hosts only).
THUMB_HOSTS = {"img.youtube.com", "i.ytimg.com", "phet.colorado.edu"}


def _allowed(url: str, base: str) -> bool:
    """data: URIs, preview pictures from THUMB_HOSTS, and assets from the app's own
    (local-network) origin. Anything else is refused so a document cannot make the
    server fetch arbitrary URLs."""
    if url.startswith("data:"):
        return True
    p, b = urlparse(url), urlparse(base)
    if p.scheme == "https" and p.hostname in THUMB_HOSTS and not p.username and p.port in (None, 443):
        return True
    return bool(b.hostname and p.scheme in ("http", "https") and p.netloc == b.netloc and _LOCAL_HOST.match(b.hostname))


def render_pdf(title: str, html: str, styles: str, base_url: str = "") -> bytes:
    # Imported here so the API still starts when WeasyPrint's system libraries are missing.
    from weasyprint import CSS, HTML
    from weasyprint.text.fonts import FontConfiguration
    from weasyprint.urls import URLFetcher

    class LocalOnlyFetcher(URLFetcher):
        def fetch(self, url, headers=None):
            if not _allowed(url, base_url):
                raise ValueError(f"blocked: {url[:80]}")
            return super().fetch(url, headers)

    # No redirects: a redirect could leave the allowed origin.
    fetcher = LocalOnlyFetcher(allow_redirects=False)

    safe_title = (title or "Untitled").strip() or "Untitled"
    esc = safe_title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    doc = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{esc}</title></head><body><main class=\"pdf-page\">"
        '<header class="pdf-title-block"><p class="pdf-eyebrow">Teacher Notebook</p>'
        f'<h1 class="pdf-title">{esc}</h1><p class="pdf-date">{date.today().strftime("%d %B %Y")}</p></header>'
        f'<div class="editor-input">{html}</div></main></body></html>'
    )
    fonts = FontConfiguration()
    sheets = [CSS(string=styles, font_config=fonts, url_fetcher=fetcher, base_url=base_url or None)] if styles else []
    sheets.append(CSS(filename=str(PRINT_CSS), font_config=fonts))
    return HTML(string=doc, base_url=base_url or None, url_fetcher=fetcher).write_pdf(
        stylesheets=sheets, font_config=fonts
    )


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
