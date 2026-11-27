from fastapi.testclient import TestClient

from app.main import app
from app.services.pdf_export import _allowed

client = TestClient(app)


def test_pdf_export_returns_a_pdf():
    r = client.post("/export/pdf", json={"title": "Cells & Tissues", "html": "<h1>Hello</h1><p>World</p>"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    assert "Cells_Tissues.pdf" in r.headers["content-disposition"]


def test_pdf_export_does_not_fetch_foreign_urls():
    html = '<img src="http://169.254.169.254/latest/meta-data"><p>ok</p>'
    r = client.post("/export/pdf", json={"title": "x", "html": html, "baseUrl": "http://localhost:5173"})
    assert r.status_code == 200  # the blocked image is skipped, the PDF still builds


def test_allowed_urls():
    base = "http://localhost:5173"
    assert _allowed("data:image/png;base64,AAAA", "")
    assert _allowed("http://localhost:5173/assets/font.woff2", base)
    assert not _allowed("http://localhost:9999/x", base)
    assert not _allowed("http://169.254.169.254/", base)
    assert not _allowed("http://localhost:5173/x", "https://example.com")  # public origin never trusted
    assert not _allowed("file:///etc/passwd", base)


def test_thumbnail_hosts_are_https_and_listed_only():
    assert _allowed("https://phet.colorado.edu/sims/html/x/latest/x-600.png", "")
    assert _allowed("https://img.youtube.com/vi/abc/hqdefault.jpg", "")
    assert not _allowed("http://phet.colorado.edu/x.png", "")
    assert not _allowed("https://phet.colorado.edu.evil.com/x.png", "")
    assert not _allowed("https://user@phet.colorado.edu/x.png", "")
    assert not _allowed("https://example.com/x.png", "")
