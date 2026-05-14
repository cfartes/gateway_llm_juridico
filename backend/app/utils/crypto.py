from cryptography.fernet import Fernet

from app.core.config import settings


fernet = Fernet(settings.encryption_key.encode())


def encrypt_text(content: str) -> str:
    return fernet.encrypt(content.encode()).decode()


def decrypt_text(content: str) -> str:
    return fernet.decrypt(content.encode()).decode()

