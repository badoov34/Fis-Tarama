"""SQLAlchemy ORM modelleri — veritabanı tablo tanımları."""
import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Float, Date, DateTime, Text, ForeignKey, Boolean, Integer
)
from sqlalchemy.dialects.postgresql import UUID
from database import Base


def new_id():
    return str(uuid.uuid4())


class User(Base):
    """Kullanıcı hesabı — giriş yapmak için."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_id)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), default="")
    company_name = Column(String(255), default="")  # Firma ismi (raporlarda kullanılır)
    avatar_url = Column(String(500), default="")  # Profil fotoğrafı
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Expense(Base):
    """Gider kaydı — fiş/fatura bilgileri."""
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=new_id)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    # Tutar bilgileri
    total_amount = Column(Float, nullable=False)       # KDV dahil toplam
    net_amount = Column(Float, nullable=True)           # Matrah (KDV hariç)
    vat_rate = Column(Float, nullable=True)             # KDV oranı (%0, %1, %10, %20)
    vat_amount = Column(Float, nullable=True)           # KDV tutarı

    # Fiş bilgileri (OCR ile otomatik çıkarılır)
    vendor_name = Column(String(255), default="")       # İş yeri adı
    receipt_date = Column(Date, nullable=True)          # Fiş tarihi
    receipt_number = Column(String(100), default="")    # Fiş/fatura numarası
    vkn = Column(String(20), default="")               # Vergi Kimlik Numarası / TCKN

    # Kategorilendirme
    category = Column(String(100), default="diger")     # Kategori
    description = Column(Text, default="")              # Açıklama/not

    # Dönem bilgisi (10 günlük periyotlar)
    period_start = Column(Date, nullable=True)          # Dönem başlangıcı
    period_end = Column(Date, nullable=True)            # Dönem bitişi

    # Fiş görseli
    receipt_image_path = Column(String(500), default="")  # Sunucudaki dosya yolu

    # Çoklu KDV satırları (JSON) — market fişlerinde %10+%20 gibi
    vat_items_json = Column(Text, default="")  # [{vat_rate, total_amount, net_amount, vat_amount}]

    # OCR durumu
    ocr_confidence = Column(Float, nullable=True)       # OCR güven skoru (0-100)
    ocr_raw_text = Column(Text, default="")             # Ham OCR metni (debug için)
    is_manually_edited = Column(Boolean, default=False)  # Manuel düzeltme yapıldı mı?

    # Çöp kutusu (soft delete)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)

    # Zaman damgaları
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Category(Base):
    """Gider kategorileri."""
    __tablename__ = "categories"

    id = Column(String(36), primary_key=True, default=new_id)
    name = Column(String(100), unique=True, nullable=False)
    is_default = Column(Boolean, default=False)  # Sistem kategorisi mi?
    created_at = Column(DateTime, default=datetime.utcnow)
