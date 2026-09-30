import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from backend.config import settings

def get_fernet() -> Fernet:
    """
    Returns a Fernet instance using the configured ENCRYPTION_KEY.
    If the key is missing or invalid, it falls back to a deterministic but securely derived key
    from the SUPABASE_JWT_SECRET for local dev ease, though in production ENCRYPTION_KEY is required.
    """
    key = settings.encryption_key
    
    if not key:
        # Fallback for dev environments where encryption_key isn't set yet
        fallback_secret = settings.supabase_jwt_secret or "dev-fallback-secret"
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"jobfit-salt",
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(fallback_secret.encode())).decode()
    
    try:
        return Fernet(key.encode())
    except Exception as e:
        # If the key provided in .env is not a valid 32 url-safe base64-encoded bytes string
        raise ValueError(f"Invalid ENCRYPTION_KEY provided: {str(e)}")

def encrypt(text: str) -> str:
    """Encrypt a string and return the url-safe base64 encoded encrypted string."""
    if not text:
        return ""
    f = get_fernet()
    return f.encrypt(text.encode()).decode()

def decrypt(encrypted_text: str) -> str:
    """Decrypt a url-safe base64 encoded encrypted string and return the plaintext string."""
    if not encrypted_text:
        return ""
    f = get_fernet()
    return f.decrypt(encrypted_text.encode()).decode()
