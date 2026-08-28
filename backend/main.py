"""Fiş Tarama ve Gider Takip Uygulaması — Ana API.

FastAPI backend: OCR tarama, gider CRUD, raporlama.
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings
from database import init_db
from models import Category
from database import SessionLocal
from utils.helpers import get_default_categories

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _cleanup_old_reports(upload_dir: str, max_age_hours: int = 24):
    """Eski rapor dosyalarını temizle — 24 saatten eski olanları sil."""
    import time
    reports_dir = os.path.join(upload_dir, "reports")
    if not os.path.exists(reports_dir):
        return

    now = time.time()
    max_age_seconds = max_age_hours * 3600
    cleaned = 0

    for filename in os.listdir(reports_dir):
        filepath = os.path.join(reports_dir, filename)
        try:
            if os.path.isfile(filepath):
                file_age = now - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.remove(filepath)
                    cleaned += 1
        except OSError:
            pass

    if cleaned > 0:
        logger.info(f"🗑️ {cleaned} eski rapor dosyası temizlendi")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama başlatıldığında çalışır — veritabanı tablolarını oluşturur."""
    logger.info("🚀 Fiş Tarama uygulaması başlatılıyor...")

    # Veritabanı tablolarını oluştur
    init_db()
    logger.info("✅ Veritabanı tabloları hazır")

    # Varsayılan kategorileri ekle (yoksa)
    db = SessionLocal()
    try:
        defaults = get_default_categories()
        for cat_name in defaults:
            existing = db.query(Category).filter(Category.name == cat_name).first()
            if not existing:
                cat = Category(name=cat_name, is_default=True)
                db.add(cat)
        db.commit()
        logger.info(f"✅ {len(defaults)} varsayılan kategori hazır")
    finally:
        db.close()

    # Upload klasörünü oluştur
    os.makedirs(settings.upload_dir, exist_ok=True)
    logger.info(f"✅ Upload klasörü: {settings.upload_dir}")

    # Eski rapor dosyalarını temizle (24 saatten eski)
    _cleanup_old_reports(settings.upload_dir)

    logger.info("🎯 Uygulama hazır!")
    yield
    logger.info("👋 Uygulama kapatılıyor...")


security = HTTPBearer(auto_error=False)

from fastapi.openapi.models import SecurityScheme
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token'ınızı buraya girin. Örnek: Bearer eyJhbGci..."
        }
    }
    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app = FastAPI(
    title="Fiş Tarama & Gider Takip API",
    description=(
        "Fiş/makbuz fotoğraflarını tarayarak KDV, tutar ve matrah bilgilerini "
        "otomatik çıkaran, aylık 10 günlük dönemler halinde rapor üreten API."
    ),
    version="1.0.0",
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True}
)
app.openapi = custom_openapi

# Rate Limiting — brute-force koruması
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — mobil uygulamadan erişim için
CORS_ORIGINS = ["*"] if settings.environment == "development" else [
    "http://localhost:19006",  # Expo Go
    "http://localhost:8081",    # Metro bundler
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Statik dosyalar (yüklenen fotoğraflar için)
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# Rotaları kaydet
from routes.auth import router as auth_router
from routes.expenses import router as expenses_router
from routes.reports import router as reports_router

app.include_router(auth_router)
app.include_router(expenses_router)
app.include_router(reports_router)


@app.get("/")
def root():
    """API kök endpointi — sağlık kontrolü."""
    # OCR motoru durumu
    try:
        from ocr.gemini_ocr import is_gemini_available
        gemini_ok = is_gemini_available()
    except Exception:
        gemini_ok = False

    return {
        "app": "Fiş Tarama & Gider Takip",
        "version": "1.1.0",
        "status": "çalışıyor",
        "ocr_engine": "Gemini AI" if gemini_ok else "Tesseract",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """Sağlık kontrolü — sunucu durumunu doğrula."""
    try:
        from ocr.gemini_ocr import is_gemini_available
        gemini_ok = is_gemini_available()
    except Exception:
        gemini_ok = False

    return {
        "status": "ok",
        "database": "connected",
        "ocr_engine": "Gemini AI" if gemini_ok else "Tesseract",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
