import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException

from app.core.config import settings


def _is_localhost_host(hostname: str) -> bool:
    lowered = hostname.strip().lower()
    return lowered in {"localhost", "127.0.0.1", "::1"}


def _is_blocked_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True

    return any(
        [
            addr.is_private,
            addr.is_loopback,
            addr.is_link_local,
            addr.is_multicast,
            addr.is_reserved,
            addr.is_unspecified,
        ]
    )


def _host_matches_allowlist(hostname: str) -> bool:
    raw = settings.webhook_callback_allowed_domains.strip()
    if not raw:
        return True

    host = hostname.lower().strip(".")
    for item in [entry.strip().lower().strip(".") for entry in raw.split(",") if entry.strip()]:
        if host == item or host.endswith(f".{item}"):
            return True
    return False


def validate_callback_url_security(callback_url: str) -> None:
    parsed = urlparse(callback_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Callback URL must use http or https")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="Callback URL hostname is required")

    hostname = parsed.hostname
    is_local = _is_localhost_host(hostname)

    if parsed.scheme == "http" and not (settings.environment == "dev" and settings.webhook_callback_allow_http_localhost and is_local):
        raise HTTPException(status_code=400, detail="Insecure callback URL (http) is not allowed")

    if not _host_matches_allowlist(hostname):
        raise HTTPException(status_code=400, detail="Callback URL domain is not allowlisted")

    if not settings.webhook_callback_block_private_networks:
        return

    if settings.environment == "dev" and settings.webhook_callback_allow_http_localhost and is_local:
        return

    resolved_port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = socket.getaddrinfo(hostname, resolved_port, proto=socket.IPPROTO_TCP)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Callback hostname could not be resolved: {exc}") from exc

    for entry in addresses:
        ip = entry[4][0]
        if _is_blocked_ip(ip):
            raise HTTPException(status_code=400, detail="Callback URL resolves to restricted/private network")
