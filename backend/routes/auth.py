"""Kimlik doğrulama rotaları — giriş, kayıt, kullanıcı yönetimi."""
import bcrypt
import jwt
import os
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, Header, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import User
from schemas import UserCreate, UserLogin, UserOut, TokenOut
from config import settings

router = APIRouter(prefix="/api/auth", tags=["Kimlik Doğrulama"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=settings.access_token_expire_days),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """İsteğe bağlı kullanıcı doğrulama — token yoksa None döner."""
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access":
            return None
        user = db.query(User).filter(User.id == payload["sub"]).first()
        return user
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """Zorunlu kullanıcı doğrulama — token yoksa hata fırlatır."""
    user = get_current_user_optional(authorization, db)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapılmamış. Lütfen giriş yapın.")
    return user


def require_auth(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    """Dependency wrapper for get_current_user."""
    return get_current_user(authorization, db)


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/register", response_model=TokenOut)
def register(data: UserCreate, db: Session = Depends(get_db)):
    """Yeni kullanıcı kaydı."""
    email = data.email.lower().strip()

    # E-posta kontrolü
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")

    # İlk kullanıcı otomatik admin
    user_count = db.query(User).count()
    user = User(
        email=email,
        name=data.name or "",
        company_name=data.company_name or "",
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email)
    return TokenOut(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name or "",
            company_name=user.company_name or "",
            created_at=user.created_at,
        ),
    )


@router.post("/login", response_model=TokenOut)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """Kullanıcı girişi."""
    email = data.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-posta veya şifre yanlış")

    token = create_access_token(user.id, user.email)
    return TokenOut(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name or "",
            company_name=user.company_name or "",
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserOut)
def get_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Mevcut kullanıcı bilgisi."""
    user = get_current_user(authorization, db)
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name or "",
        company_name=user.company_name or "",
        avatar_url=getattr(user, 'avatar_url', '') or '',
        created_at=user.created_at,
    )


@router.put("/me")
def update_profile(
    name: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Kullanıcı profilini güncelle."""
    user = get_current_user(authorization, db)
    if name is not None:
        user.name = name
    if company_name is not None:
        user.company_name = company_name
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {
        "ok": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name or "",
            "company_name": user.company_name or "",
            "avatar_url": getattr(user, 'avatar_url', '') or '',
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
    }


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Avatar fotoğrafı yükle."""
    user = get_current_user(authorization, db)

    # Dosya boyutu kontrolü (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya çok büyük. Maksimum 5MB.")

    # Dosya uzantısı kontrolü
    allowed = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Sadece JPEG, PNG, WebP desteklenir.")

    # Klasör oluştur
    avatar_dir = os.path.join(settings.upload_dir, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    # Kaydet
    ext = file.filename.split(".")[-1] if "." in (file.filename or "") else "jpg"
    filename = f"{user.id}.{ext}"
    filepath = os.path.join(avatar_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    avatar_url = f"/uploads/avatars/{filename}"
    user.avatar_url = avatar_url
    user.updated_at = datetime.utcnow()
    db.commit()

    return {"ok": True, "avatar_url": avatar_url}


@router.delete("/me/avatar")
def delete_avatar(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Avatar fotoğrafını sil."""
    user = get_current_user(authorization, db)
    if user.avatar_url:
        filepath = os.path.join(settings.upload_dir, user.avatar_url.replace("/uploads/", ""))
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError:
                pass
    user.avatar_url = ""
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
