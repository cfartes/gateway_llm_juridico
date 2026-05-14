from pathlib import Path
import httpx


def download_url_content(url: str, max_bytes: int) -> tuple[bytes, str, str]:
    with httpx.Client(follow_redirects=True, timeout=25.0) as client:
        response = client.get(url)
        response.raise_for_status()
        data = response.content

    if len(data) > max_bytes:
        raise ValueError("Downloaded file exceeds max size")

    name = url.split("?")[0].split("/")[-1] or "remote_file"
    content_type = response.headers.get("content-type", "application/octet-stream")
    return data, name, content_type or "application/octet-stream"

