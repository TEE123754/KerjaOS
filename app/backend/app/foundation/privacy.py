"""Local normalization and redaction. External inference stays disabled in M1."""
import re
import unicodedata
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException


def normalize_document_text(value: str, limit: int = 60000) -> str:
    value = unicodedata.normalize("NFKC", value)
    return "".join(char for char in value if char in "\n\t" or not unicodedata.category(char).startswith("C"))[:limit]


def redact_text(value: str) -> str:
    value = normalize_document_text(value)
    value = re.sub(r"\b\d{6}[- ]?\d{2}[- ]?\d{4}\b", "[ID REDACTED]", value)
    value = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[EMAIL REDACTED]", value)
    value = re.sub(r"(?<!\w)\+?\d[\d ()-]{7,}\d(?!\w)", "[PHONE REDACTED]", value)
    return value


def cipher(key: str) -> Fernet:
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError):
        raise HTTPException(503, "Encryption is not configured") from None


def decrypt(key: str, value: str | bytes) -> bytes:
    try:
        return cipher(key).decrypt(value.encode() if isinstance(value, str) else value)
    except InvalidToken:
        raise HTTPException(503, "Encrypted data is unavailable") from None
