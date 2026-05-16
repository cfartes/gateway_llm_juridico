import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from app.core.config import settings


logger = logging.getLogger(__name__)


def _resolve_fernet_key(raw_key: str) -> bytes:
    """
    Accept both:
    - a valid Fernet key (urlsafe base64, 32-byte payload)
    - a passphrase/plain string (derived into Fernet-compatible key)
    """
    raw_bytes = raw_key.encode()
    try:
        Fernet(raw_bytes)
        return raw_bytes
    except Exception:
        derived = base64.urlsafe_b64encode(hashlib.sha256(raw_bytes).digest())
        logger.warning("ENCRYPTION_KEY is not a Fernet key; using deterministic SHA-256 derivation.")
        return derived


fernet = Fernet(_resolve_fernet_key(settings.encryption_key))


def encrypt_text(content: str) -> str:
    return fernet.encrypt(content.encode()).decode()


def decrypt_text(content: str) -> str:
    return fernet.decrypt(content.encode()).decode()

