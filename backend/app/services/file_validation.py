from pathlib import Path
import zipfile

from fastapi import HTTPException, status

from app.core.config import settings


ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".html", ".htm", ".md",
    ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".zip"
}
BLOCKED_EXTENSIONS = {".exe", ".dll", ".bat", ".ps1", ".cmd", ".msi", ".js", ".vbs", ".scr"}
ALLOWED_MIME_PREFIXES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument",
    "text/",
    "image/",
    "application/zip",
    "application/x-zip-compressed",
}
OCTET_STREAM_MIMES = {"application/octet-stream", "binary/octet-stream"}


def _is_allowed_mime(content_type: str | None) -> bool:
    if not content_type:
        return False
    return any(content_type.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES)


def validate_file_metadata(filename: str, content_type: str | None, size_bytes: int) -> None:
    ext = Path(filename).suffix.lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Blocked extension: {ext}")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported extension: {ext}")
    if size_bytes > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    if not _is_allowed_mime(content_type):
        normalized = (content_type or "").strip().lower()
        if normalized in OCTET_STREAM_MIMES and ext in ALLOWED_EXTENSIONS:
            return
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported MIME type: {content_type}")


def inspect_zip_for_blocked_files(zip_path: Path) -> list[str]:
    blocked_entries: list[str] = []
    with zipfile.ZipFile(zip_path) as archive:
        for entry in archive.namelist():
            ext = Path(entry).suffix.lower()
            if ext in BLOCKED_EXTENSIONS:
                blocked_entries.append(entry)
    return blocked_entries


def detect_office_macro(filename: str, content: bytes) -> bool:
    lower = filename.lower()
    is_office_xml = lower.endswith((".docx", ".pptx", ".xlsx"))
    if not is_office_xml:
        return False
    return b"vbaProject.bin" in content or b"_VBA_PROJECT" in content

