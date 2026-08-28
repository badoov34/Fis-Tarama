"""Veritabanı bağlantısı ve oturum yönetimi."""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

logger = logging.getLogger(__name__)

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Her istek için veritabanı oturumu oluşturur."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_column_if_missing(table_name, column_name, column_def):
    """Sütun eksikse ekle (basit migration)."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name=:tbl AND column_name=:col"
            ), {"tbl": table_name, "col": column_name})
            if result.fetchone() is None:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
                conn.commit()
                logger.info(f"✅ {table_name}.{column_name} sütunu eklendi")
    except Exception as e:
        logger.warning(f"Sütun ekleme atlandı ({table_name}.{column_name}): {e}")


def init_db():
    """Veritabanı tablolarını oluşturur ve gerekli migration'ları yapar."""
    Base.metadata.create_all(bind=engine)

    # Eksik sütunları ekle (mevcut veritabanını koruyarak)
    _add_column_if_missing("expenses", "is_deleted", "BOOLEAN DEFAULT FALSE")
    _add_column_if_missing("expenses", "deleted_at", "TIMESTAMP NULL")
    _add_column_if_missing("expenses", "vat_items_json", "TEXT DEFAULT ''")
    _add_column_if_missing("users", "company_name", "VARCHAR(255) DEFAULT ''")
    _add_column_if_missing("users", "avatar_url", "VARCHAR(500) DEFAULT ''")
    _add_column_if_missing("users", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
