from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup


MIME_TO_EXTENSION: dict[str, str] = {
    "text/html": ".html",
    "text/markdown": ".md",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "application/zip": ".zip",
}

SKIP_EXTENSIONS = (
    ".7z",
    ".avi",
    ".css",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".png",
    ".rar",
    ".svg",
    ".webm",
    ".webp",
    ".xml",
    ".xsd",
    ".zip",
)
WIKI_NOISE_MARKERS = (
    "/Ajuda:",
    "/Arquivo:",
    "/Category:",
    "/Categoria:",
    "/Discussao",
    "/Especial:",
    "/File:",
    "/Ficheiro:",
    "/Help:",
    "/MediaWiki:",
    "/Portal:",
    "/Predefinicao:",
    "/Project:",
    "/Special:",
    "/Talk:",
    "/Template:",
    "/User:",
    "/Usuario:",
    "/Wikipedia:",
    "/w/index.php",
    "action=",
    "diff=",
    "oldid=",
    "printable=",
    "returnto=",
    "title=especial:",
    "title=special:",
)
MULTISPACE_RE = re.compile(r"\n{3,}")
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class CrawledWikiPage:
    url: str
    title: str
    markdown: str


def _normalize_content_type(content_type: str | None) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _infer_extension(name: str, content_type: str) -> str:
    current_ext = Path(name).suffix.lower()
    if current_ext:
        return name
    mime = _normalize_content_type(content_type)
    guessed_ext = MIME_TO_EXTENSION.get(mime, ".txt")
    return f"{name}{guessed_ext}"


def _normalize_url(url: str, base_url: str | None = None) -> str:
    absolute = urljoin(base_url, url) if base_url else url
    without_fragment, _ = urldefrag(absolute)
    return without_fragment.rstrip("/")


def _ascii_fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _is_crawlable_internal_url(url: str, root_domain: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if parsed.netloc != root_domain:
        return False
    lowered = _ascii_fold(unquote(url)).lower()
    if lowered.endswith(SKIP_EXTENSIONS):
        return False
    return not any(marker.lower() in lowered for marker in WIKI_NOISE_MARKERS)


def _extract_internal_links(html: str, base_url: str, root_domain: str) -> list[str]:
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return []
    seen: set[str] = set()
    links: list[str] = []
    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not href:
            continue
        normalized = _normalize_url(href, base_url=base_url)
        if normalized in seen:
            continue
        if _is_crawlable_internal_url(normalized, root_domain):
            seen.add(normalized)
            links.append(normalized)
    return links


def _html_to_markdown_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "aside"]):
        tag.extract()
    for selector in (
        "#mw-navigation",
        "#mw-head",
        "#mw-panel",
        ".mw-jump-link",
        ".vector-page-toolbar",
        ".sidebar",
        ".toc",
    ):
        for node in soup.select(selector):
            node.extract()
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    text = soup.get_text("\n", strip=True)
    text = MULTISPACE_RE.sub("\n\n", text).strip()
    return title, text


def _fetch_url(client: httpx.Client, url: str, timeout_seconds: float) -> httpx.Response:
    response = client.get(
        url,
        timeout=max(4.0, timeout_seconds),
        headers={"User-Agent": DEFAULT_USER_AGENT},
    )
    response.raise_for_status()
    return response


def _crawl_wiki_as_markdown(
    start_url: str,
    *,
    max_pages: int,
    max_depth: int,
    max_seconds: float,
    max_bytes: int,
) -> bytes:
    start_url = _normalize_url(start_url)
    root_domain = urlparse(start_url).netloc
    if not root_domain:
        raise ValueError("Invalid URL")

    queue: list[tuple[str, int]] = [(start_url, 0)]
    queued: set[str] = {start_url}
    seen: set[str] = set()
    pages: list[CrawledWikiPage] = []
    started_at = time.monotonic()

    with httpx.Client(follow_redirects=True) as client:
        while queue and len(pages) < max_pages:
            if (time.monotonic() - started_at) >= max_seconds:
                break

            current_url, depth = queue.pop(0)
            queued.discard(current_url)
            if current_url in seen:
                continue
            if not _is_crawlable_internal_url(current_url, root_domain):
                continue
            seen.add(current_url)

            try:
                response = _fetch_url(client, current_url, timeout_seconds=20.0)
            except Exception:
                continue

            content_type = _normalize_content_type(response.headers.get("content-type"))
            if not content_type.startswith("text/html"):
                continue

            html = response.text or ""
            title, text = _html_to_markdown_text(html)
            if text:
                markdown = f"## {title or current_url}\n\nSource: {current_url}\n\n{text}\n"
                pages.append(CrawledWikiPage(url=current_url, title=title, markdown=markdown))

            if depth >= max_depth:
                continue
            for link in _extract_internal_links(html, base_url=current_url, root_domain=root_domain):
                if link not in seen and link not in queued:
                    queue.append((link, depth + 1))
                    queued.add(link)

    if not pages:
        raise ValueError("Could not crawl wiki pages from URL")

    header = f"# Wiki Crawl Snapshot\n\nStart URL: {start_url}\nPages crawled: {len(pages)}\n\n"
    body = "\n".join(page.markdown for page in pages)
    content = f"{header}{body}".encode("utf-8", errors="ignore")
    if len(content) > max_bytes:
        content = content[:max_bytes]
    return content


def download_url_content(
    url: str,
    max_bytes: int,
    *,
    crawl_internal_links: bool = True,
    crawl_max_pages: int = 20,
    crawl_max_depth: int = 2,
    crawl_timeout_seconds: float = 45.0,
) -> tuple[bytes, str, str]:
    with httpx.Client(follow_redirects=True, timeout=25.0, headers={"User-Agent": DEFAULT_USER_AGENT}) as client:
        response = client.get(url)
        response.raise_for_status()
        data = response.content

    if len(data) > max_bytes:
        raise ValueError("Downloaded file exceeds max size")

    content_type = _normalize_content_type(response.headers.get("content-type"))
    resolved_name = response.url.path.split("/")[-1] if response.url and response.url.path else ""
    name = resolved_name or url.split("?")[0].split("/")[-1] or "remote_file"
    name = _infer_extension(name, content_type)

    if crawl_internal_links and content_type.startswith("text/html"):
        try:
            markdown_bytes = _crawl_wiki_as_markdown(
                str(response.url),
                max_pages=max(1, int(crawl_max_pages)),
                max_depth=max(0, int(crawl_max_depth)),
                max_seconds=max(10.0, float(crawl_timeout_seconds)),
                max_bytes=max_bytes,
            )
            wiki_name = Path(name).stem or "wiki"
            return markdown_bytes, f"{wiki_name}.wiki.md", "text/markdown"
        except Exception:
            # Graceful fallback to single downloaded page if crawl cannot proceed.
            pass

    return data, name, content_type

