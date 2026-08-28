"""Pydantic shemaları — API giriş/çıkış doğrulama."""
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============================================================================
# Kullanıcı
# ============================================================================

class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = ""
    company_name: Optional[str] = ""

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    company_name: str = ""
    avatar_url: str = ""
    created_at: datetime

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ============================================================================
# Gider
# ============================================================================

class ExpenseCreate(BaseModel):
    total_amount: float = Field(..., gt=0, description="KDV dahil toplam tutar")
    net_amount: Optional[float] = None           # Matrah
    vat_rate: Optional[float] = None             # %0, %1, %10, %20
    vat_amount: Optional[float] = None           # Hesaplanan KDV
    vendor_name: Optional[str] = ""
    receipt_date: Optional[date] = None
    receipt_number: Optional[str] = ""
    category: Optional[str] = "diger"
    description: Optional[str] = ""
    is_manually_edited: Optional[bool] = False


class ExpenseUpdate(BaseModel):
    total_amount: Optional[float] = None
    net_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    vendor_name: Optional[str] = None
    receipt_date: Optional[date] = None
    receipt_number: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_manually_edited: Optional[bool] = None


class VatItemIn(BaseModel):
    """Tek bir KDV satırı — frontend'den gelen."""
    vat_rate: float
    total_amount: Optional[float] = 0
    net_amount: Optional[float] = 0
    vat_amount: Optional[float] = 0


class ExpenseFromScan(BaseModel):
    """OCR tarama sonucundan gider oluşturma isteği."""
    image_filename: str = ""
    total_amount: float = Field(..., gt=0, description="KDV dahil toplam tutar")
    net_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    vat_items: Optional[List[VatItemIn]] = None  # Çoklu KDV satırları
    vendor_name: Optional[str] = ""
    receipt_date: Optional[str] = None  # ISO format: YYYY-MM-DD
    receipt_number: Optional[str] = ""
    category: Optional[str] = "diger"
    description: Optional[str] = ""
    is_manually_edited: Optional[bool] = False


class ExpenseOut(BaseModel):
    id: str
    user_id: str
    total_amount: float
    net_amount: Optional[float]
    vat_rate: Optional[float]
    vat_amount: Optional[float]
    vendor_name: str
    receipt_date: Optional[date]
    receipt_number: str
    category: str
    description: str
    period_start: Optional[date]
    period_end: Optional[date]
    receipt_image_path: str
    ocr_confidence: Optional[float]
    is_manually_edited: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VatItem(BaseModel):
    """Tek bir KDV satırı — çoklu KDV oranları için."""
    vat_rate: float
    total_amount: Optional[float] = None
    net_amount: Optional[float] = None
    vat_amount: Optional[float] = None


class OCRResult(BaseModel):
    """OCR sonucu — otomatik çıkarılan veriler."""
    total_amount: Optional[float] = None
    net_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    vat_items: Optional[List[VatItem]] = None  # Çoklu KDV satırları
    vendor_name: Optional[str] = ""
    receipt_date: Optional[date] = None
    receipt_number: Optional[str] = ""
    category: Optional[str] = None  # OCR kategori önerisi
    confidence: Optional[float] = None
    raw_text: str = ""
    suggestion: Optional[str] = None  # Kullanıcıya mesaj


# ============================================================================
# Kategori
# ============================================================================

class CategoryCreate(BaseModel):
    name: str

class CategoryOut(BaseModel):
    id: str
    name: str
    is_default: bool
    created_at: datetime


# ============================================================================
# Rapor
# ============================================================================

class PeriodReport(BaseModel):
    """10 günlük dönem raporu."""
    period_start: date
    period_end: date
    period_label: str  # "1-10 Ağustos 2026" gibi
    total_amount: float
    net_amount: float
    vat_amount: float
    expense_count: int
    expenses: List[ExpenseOut]


class MonthlyReport(BaseModel):
    """Aylık toplam rapor."""
    year: int
    month: int
    month_label: str  # "Ağustos 2026" gibi
    periods: List[PeriodReport]
    grand_total_amount: float
    grand_total_net: float
    grand_total_vat: float
    grand_expense_count: int
