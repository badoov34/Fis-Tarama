"""Uygulama yapılandırması — tüm ayarlar .env dosyasından okunur."""
import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


def get_database_url() -> str:
    """Veritabanı URL'sini al — Render, Docker ve lokal ortamlar için uyumlu."""
    url = os.getenv("DATABASE_URL", "")

    if not url:
        # Lokal geliştirme
        return "postgresql://fis_user:fis_sifre@localhost:5432/fis_tarama"

    # Render PostgreSQL URL düzeltmesi
    # Render "postgres://" ile başlayabilir, SQLAlchemy "postgresql://" bekler
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Render sslmode parametresi ekler, bu hata verebilir
    # psycopg2 için sslmode yönetimi
    if "?" in url:
        base, params = url.split("?", 1)
        # sslmode parametresi varsa koru, yoksa ekle
        if "sslmode" not in params:
            params += "&sslmode=require"
        url = f"{base}?{params}"
    else:
        # Hiç parametre yoksa sslmode ekle (Render için gerekli)
        if os.getenv("RENDER"):
            url += "?sslmode=require"

    return url


class Settings(BaseSettings):
    # Veritabanı
    database_url: str = get_database_url()

    # JWT
    jwt_secret: str = os.getenv("JWT_SECRET", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_days: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "365"))

    # Sunucu
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    # OCR
    tesseract_lang: str = os.getenv("TESSERACT_LANG", "tur")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")

    # Yükleme
    upload_dir: str = os.getenv("UPLOAD_DIR", "./uploads")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))

    # Ortam
    environment: str = os.getenv("ENVIRONMENT", "development")

    class Config:
        env_file = ".env"


settings = Settings()

if not settings.jwt_secret:
    raise RuntimeError(
        "JWT_SECRET ortam değişkeni ayarlanmamış! "
        ".env dosyasına JWT_SECRET=guclu-bir-sifre ekleyin."
    )
