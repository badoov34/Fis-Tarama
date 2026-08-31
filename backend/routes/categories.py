"""Kategori CRUD — kullanıcının özel kategorilerini yönetir."""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Category, User
from schemas import CategoryCreate, CategoryOut
from routes.auth import get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[dict])
def list_categories(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Kullanıcının kategorilerini listele — sistem + özel kategoriler."""
    user = get_current_user(authorization, db)

    # Sistem kategorileri (user_id=None) + kullanıcının özel kategorileri
    cats = db.query(Category).filter(
        (Category.user_id == None) | (Category.user_id == user.id)
    ).all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "icon": c.icon or "📁",
            "is_default": c.is_default,
            "is_custom": c.user_id == user.id,
        }
        for c in cats
    ]


@router.post("", response_model=dict)
def create_category(
    data: CategoryCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Yeni özel kategori oluştur."""
    user = get_current_user(authorization, db)

    # Aynı isimde kategori var mı kontrol et (kullanıcı + sistem)
    existing = db.query(Category).filter(
        Category.name == data.name,
        ((Category.user_id == None) | (Category.user_id == user.id))
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu isimde bir kategori zaten var")

    cat = Category(
        name=data.name,
        user_id=user.id,
        icon=data.icon or "📁",
        is_default=False,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)

    return {
        "id": cat.id,
        "name": cat.name,
        "icon": cat.icon,
        "is_default": False,
        "is_custom": True,
    }


@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Özel kategoriyi sil — sadece kullanıcıya ait olanlar silinebilir."""
    user = get_current_user(authorization, db)

    cat = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user.id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı veya silinemez")
    if cat.is_default:
        raise HTTPException(status_code=400, detail="Varsayılan kategoriler silinemez")

    db.delete(cat)
    db.commit()
    return {"ok": True, "message": f"'{cat.name}' kategorisi silindi"}
