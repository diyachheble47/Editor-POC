"""PDF export: turns the rendered document (HTML sent by the editor) into a PDF with WeasyPrint, so layout,
fonts and page breaks are controlled here rather than by the browser's print dialog."""

import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

PRINT_CSS = Path(__file__).resolve().parent.parent / "utils" / "export_assets" / "print.css"
_LOCAL_HOST = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$")


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
