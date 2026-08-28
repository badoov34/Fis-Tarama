"""Gider rotaları — CRUD işlemleri ve OCR tarama."""
import os
import uuid
import json
import logging
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session
from sqlalchemy import extract

from database import get_db
from models import Expense, Category
from schemas import ExpenseCreate, ExpenseUpdate, ExpenseOut, ExpenseFromScan, OCRResult, CategoryCreate, CategoryOut
from routes.auth import get_current_user
from models import User
from config import settings
from utils.helpers import (
    assign_period, recalculate_vat, get_default_categories, get_10day_periods
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/expenses", tags=["Giderler"])


def ensure_upload_dir():
    os.makedirs(settings.upload_dir, exist_ok=True)


def expense_to_dict(exp: Expense) -> dict:
    """Expense modelini dict'e çevir (API yanıtı için)."""
    # receipt_image_path'ten URL oluştur
    image_url = ""
    if exp.receipt_image_path:
        filename = os.path.basename(exp.receipt_image_path)
        image_url = f"/uploads/{filename}"

    return {
        "id": exp.id,
        "user_id": exp.user_id,
        "total_amount": exp.total_amount,
        "net_amount": exp.net_amount,
        "vat_rate": exp.vat_rate,
        "vat_amount": exp.vat_amount,
        "vendor_name": exp.vendor_name or "",
        "receipt_date": exp.receipt_date.isoformat() if exp.receipt_date else None,
        "receipt_number": exp.receipt_number or "",
        "category": exp.category or "diger",
        "description": exp.description or "",
        "period_start": exp.period_start.isoformat() if exp.period_start else None,
        "period_end": exp.period_end.isoformat() if exp.period_end else None,
        "receipt_image_path": exp.receipt_image_path or "",
        "receipt_image_url": image_url,
        "vat_items": json.loads(exp.vat_items_json) if exp.vat_items_json else None,
        "ocr_confidence": exp.ocr_confidence,
        "is_manually_edited": exp.is_manually_edited or False,
        "is_deleted": exp.is_deleted or False,
        "deleted_at": exp.deleted_at.isoformat() if exp.deleted_at else None,
        "created_at": exp.created_at.isoformat() if exp.created_at else None,
        "updated_at": exp.updated_at.isoformat() if exp.updated_at else None,
    }


# ============================================================================
# OCR TARAMA
# ============================================================================

@router.post("/scan")
async def scan_receipt(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Fiş fotoğrafını yükle ve OCR ile oku.

    1. Fotoğrafı sunucuya kaydeder
    2. Tesseract OCR ile metin çıkarır
    3. KDV, tutar, matrah bilgilerini otomatik belirler
    4. Sonucu döndürür (henüz kaydetmez — kullanıcı onaylayınca kaydedilir)
    """
    user = get_current_user(authorization, db)
    ensure_upload_dir()

    # Dosya boyutu kontrolü
    content = await file.read()
    max_size = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Dosya çok büyük. Maksimum {settings.max_upload_size_mb}MB olmalı.",
        )

    # Dosya uzantısı kontrolü
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/heic"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Sadece JPEG, PNG, WebP ve HEIC dosyaları desteklenir.",
        )

    # Dosyayı kaydet
    ext = file.filename.split(".")[-1] if "." in (file.filename or "") else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(settings.upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    # OCR ile oku — Hibrit: Önce Gemini, sonra Tesseract
    try:
        from ocr.processor import scan_receipt
        result = scan_receipt(filepath)
    except Exception as e:
        logger.error(f"OCR hatası: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Fotoğraf işlenirken bir hata oluştu. Lütfen tekrar deneyin.",
        )

    # Çoklu KDV satırlarını dict'e çevir
    vat_items_list = None
    if result.vat_items and len(result.vat_items) > 0:
        vat_items_list = [
            {
                "vat_rate": item.vat_rate,
                "total_amount": item.total_amount,
                "net_amount": item.net_amount,
                "vat_amount": item.vat_amount,
            }
            for item in result.vat_items
        ]

    return {
        "image_filename": filename,
        "image_path": filepath,
        "ocr_result": {
            "total_amount": result.total_amount,
            "net_amount": result.net_amount,
            "vat_rate": result.vat_rate,
            "vat_amount": result.vat_amount,
            "vat_items": vat_items_list,
            "vendor_name": result.vendor_name,
            "receipt_date": result.receipt_date.isoformat() if result.receipt_date else None,
            "receipt_number": result.receipt_number,
            "category": result.category,
            "confidence": result.confidence,
            "suggestion": result.suggestion,
        },
        "raw_text": result.raw_text,
    }


# ============================================================================
# GIDER CRUD
# ============================================================================

@router.get("", response_model=List[dict])
def list_expenses(
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Giderleri listele — filtreleme destekli. Silinmişler hariç."""
    user = get_current_user(authorization, db)

    query = db.query(Expense).filter(
        Expense.user_id == user.id,
        Expense.is_deleted == False,
    )

    if year and month:
        query = query.filter(
            extract("year", Expense.receipt_date) == year,
            extract("month", Expense.receipt_date) == month,
        )
    if category:
        query = query.filter(Expense.category == category)

    expenses = query.order_by(Expense.receipt_date.desc(), Expense.created_at.desc()).all()
    return [expense_to_dict(e) for e in expenses]


@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Tek bir giderin detayını getir."""
    user = get_current_user(authorization, db)
    exp = db.query(Expense).filter(
        Expense.id == expense_id, Expense.user_id == user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    # Silinmiş giderler sadece çöp kutusundan erişilebilir
    if exp.is_deleted:
        raise HTTPException(status_code=404, detail="Bu gider silinmiş")
    return expense_to_dict(exp)


@router.post("")
def create_expense(
    data: ExpenseCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Yeni gider kaydı oluştur."""
    user = get_current_user(authorization, db)

    # KDV hesapla
    vat = recalculate_vat(data.total_amount, data.vat_rate or 0, data.net_amount)

    # Fiş tarihini belirle
    receipt_date = data.receipt_date or date.today()

    # Dönem bilgisini hesapla
    period = assign_period(
        data.total_amount, vat["net_amount"],
        data.vat_rate or 0, vat["vat_amount"], receipt_date
    )

    exp = Expense(
        user_id=user.id,
        total_amount=data.total_amount,
        net_amount=vat["net_amount"],
        vat_rate=data.vat_rate,
        vat_amount=vat["vat_amount"],
        vendor_name=data.vendor_name or "",
        receipt_date=receipt_date,
        receipt_number=data.receipt_number or "",
        category=data.category or "diger",
        description=data.description or "",
        period_start=period["period_start"],
        period_end=period["period_end"],
        is_manually_edited=data.is_manually_edited or False,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return expense_to_dict(exp)


@router.post("/from-scan")
def create_expense_from_scan(
    data: ExpenseFromScan,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """OCR tarama sonucunu gider olarak kaydet."""
    user = get_current_user(authorization, db)

    # KDV hesapla
    vat = recalculate_vat(data.total_amount, data.vat_rate or 0, data.net_amount)

    # Tarihi çevir
    r_date = date.today()
    if data.receipt_date:
        try:
            r_date = date.fromisoformat(data.receipt_date)
        except ValueError:
            pass

    # Dönem hesapla
    period = assign_period(
        data.total_amount, vat["net_amount"],
        data.vat_rate or 0, vat["vat_amount"], r_date
    )

    # Dosya yolunu bul
    image_path = ""
    if data.image_filename:
        image_path = os.path.join(settings.upload_dir, data.image_filename)

    # KDV satırlarını JSON olarak kaydet
    vat_items_json = ""
    if data.vat_items and len(data.vat_items) > 0:
        vat_items_list = []
        for item in data.vat_items:
            vat_items_list.append({
                "vat_rate": item.vat_rate,
                "total_amount": item.total_amount or 0,
                "net_amount": item.net_amount or 0,
                "vat_amount": item.vat_amount or 0,
            })
        vat_items_json = json.dumps(vat_items_list)

    exp = Expense(
        user_id=user.id,
        total_amount=data.total_amount,
        net_amount=vat["net_amount"],
        vat_rate=data.vat_rate,
        vat_amount=vat["vat_amount"],
        vendor_name=data.vendor_name or "",
        receipt_date=r_date,
        receipt_number=data.receipt_number or "",
        category=data.category or "diger",
        description=data.description or "",
        period_start=period["period_start"],
        period_end=period["period_end"],
        receipt_image_path=image_path,
        vat_items_json=vat_items_json,
        is_manually_edited=data.is_manually_edited or False,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return expense_to_dict(exp)


@router.patch("/{expense_id}")
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Gider kaydını güncelle."""
    user = get_current_user(authorization, db)
    exp = db.query(Expense).filter(
        Expense.id == expense_id, Expense.user_id == user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")

    # Güncellenen alanları uygula
    updates = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(exp, field, value)
            updates[field] = value

    # Tutar veya KDV oranı değiştiyse yeniden hesapla
    if "total_amount" in updates or "vat_rate" in updates or "net_amount" in updates:
        total = exp.total_amount
        rate = exp.vat_rate or 0
        net = exp.net_amount if "net_amount" in updates else None

        vat = recalculate_vat(total, rate, net)
        exp.net_amount = vat["net_amount"]
        exp.vat_amount = vat["vat_amount"]

        # Dönem de değişebilir
        if exp.receipt_date:
            period = assign_period(total, vat["net_amount"], rate, vat["vat_amount"], exp.receipt_date)
            exp.period_start = period["period_start"]
            exp.period_end = period["period_end"]

    exp.updated_at = datetime.utcnow()
    exp.is_manually_edited = True

    db.commit()
    db.refresh(exp)
    return expense_to_dict(exp)


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Gider kaydını soft delete — çöp kutusuna taşı."""
    user = get_current_user(authorization, db)
    exp = db.query(Expense).filter(
        Expense.id == expense_id, Expense.user_id == user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if exp.is_deleted:
        raise HTTPException(status_code=400, detail="Bu gider zaten silinmiş")

    exp.is_deleted = True
    exp.deleted_at = datetime.utcnow()
    exp.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Gider çöp kutusuna taşındı"}


# ============================================================================
# ÇÖP KUTUSU
# ============================================================================

@router.get("/trash/list")
def list_trash(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Çöp kutusundaki silinmiş giderleri listele."""
    user = get_current_user(authorization, db)
    expenses = db.query(Expense).filter(
        Expense.user_id == user.id,
        Expense.is_deleted == True,
    ).order_by(Expense.deleted_at.desc()).all()
    return [expense_to_dict(e) for e in expenses]


@router.post("/{expense_id}/restore")
def restore_expense(
    expense_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Çöp kutusundan gideri geri yükle."""
    user = get_current_user(authorization, db)
    exp = db.query(Expense).filter(
        Expense.id == expense_id, Expense.user_id == user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if not exp.is_deleted:
        raise HTTPException(status_code=400, detail="Bu gider zaten aktif")

    exp.is_deleted = False
    exp.deleted_at = None
    exp.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Gider geri yüklendi"}


@router.delete("/{expense_id}/permanent")
def permanent_delete_expense(
    expense_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Gideri kalıcı olarak sil (çöp kutusundan)."""
    user = get_current_user(authorization, db)
    exp = db.query(Expense).filter(
        Expense.id == expense_id, Expense.user_id == user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")

    # Fotoğraf dosyasını da sil
    if exp.receipt_image_path and os.path.exists(exp.receipt_image_path):
        try:
            os.remove(exp.receipt_image_path)
        except OSError:
            pass

    db.delete(exp)
    db.commit()
    return {"ok": True, "message": "Gider kalıcı olarak silindi"}


# ============================================================================
# KATEGORİLER
# ============================================================================

@router.get("/categories/list")
def list_categories(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Gider kategorilerini listele."""
    user = get_current_user(authorization, db)

    defaults = get_default_categories()
    custom = db.query(Category).filter(Category.is_default == False).all()

    return {
        "defaults": defaults,
        "custom": [c.name for c in custom],
        "all": defaults + [c.name for c in custom],
    }


@router.post("/categories")
def create_category(
    data: CategoryCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Yeni gider kategorisi oluştur."""
    user = get_current_user(authorization, db)
    name = data.name.lower().strip()

    if not name:
        raise HTTPException(status_code=400, detail="Kategori adı boş olamaz")

    # Varsayılan kategorilerden biri mi?
    defaults = get_default_categories()
    if name in defaults:
        raise HTTPException(status_code=400, detail="Bu zaten bir sistem kategorisi")

    # Mevcut mu?
    existing = db.query(Category).filter(Category.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu kategori zaten var")

    cat = Category(name=name, is_default=False)
    db.add(cat)
    db.commit()
    return {"ok": True, "name": name}


@router.delete("/categories/{name}")
def delete_category(
    name: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Gider kategorisini sil."""
    user = get_current_user(authorization, db)
    name = name.lower().strip()

    # Varsayılan kategoriler silinemez
    defaults = get_default_categories()
    if name in defaults:
        raise HTTPException(status_code=400, detail="Sistem kategorileri silinemez")

    cat = db.query(Category).filter(Category.name == name).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")

    db.delete(cat)
    db.commit()
    return {"ok": True}
