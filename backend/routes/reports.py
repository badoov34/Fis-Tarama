"""Rapor rotaları — aylık raporlar, 10 günlük dönemler, Excel/PDF dışa aktarma."""
import os
import uuid
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract

from database import get_db
from models import Expense
from routes.auth import get_current_user
from utils.helpers import get_10day_periods, MONTH_NAMES_TR
from utils.report_generator import generate_excel_report, generate_pdf_report
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["Raporlar"])


def get_period_expenses(db: Session, user_id: str, start: date, end: date):
    """Belirli bir dönemdeki giderleri getir."""
    expenses = db.query(Expense).filter(
        Expense.user_id == user_id,
        Expense.receipt_date >= start,
        Expense.receipt_date <= end,
    ).order_by(Expense.receipt_date.asc()).all()
    return expenses


def expense_to_dict(exp: Expense) -> dict:
    """Expense modelini dict'e çevir."""
    # vat_items_json'dan vat_items listesini çıkar
    vat_items = None
    if exp.vat_items_json:
        try:
            vat_items = json.loads(exp.vat_items_json)
        except (json.JSONDecodeError, TypeError):
            vat_items = None

    return {
        "id": exp.id,
        "total_amount": exp.total_amount,
        "net_amount": exp.net_amount,
        "vat_rate": exp.vat_rate,
        "vat_amount": exp.vat_amount,
        "vendor_name": exp.vendor_name or "",
        "receipt_date": exp.receipt_date.isoformat() if exp.receipt_date else None,
        "description": exp.description or "",
        "category": exp.category or "diger",
        "vat_items": vat_items,
    }


@router.get("/monthly")
def get_monthly_report(
    year: int = Query(..., description="Yıl"),
    month: int = Query(..., ge=1, le=12, description="Ay"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Aylık 10 günlük dönem bazlı rapor.

    Döner:
    - 3 dönem (1-10, 11-20, 21-son)
    - Her dönem için giderler ve toplamlar
    - Aylık genel toplam
    """
    user = get_current_user(authorization, db)
    periods = get_10day_periods(year, month)
    month_name = MONTH_NAMES_TR[month]

    periods_data = []
    grand_total = 0
    grand_net = 0
    grand_vat = 0
    grand_count = 0

    for period in periods:
        expenses = get_period_expenses(db, user.id, period["start"], period["end"])
        expense_list = [expense_to_dict(e) for e in expenses]

        period_total = sum(e.total_amount for e in expenses)
        period_net = sum(e.net_amount or 0 for e in expenses)
        period_vat = sum(e.vat_amount or 0 for e in expenses)

        periods_data.append({
            "period": period,
            "expenses": expense_list,
            "totals": {
                "total": round(period_total, 2),
                "net": round(period_net, 2),
                "vat": round(period_vat, 2),
                "count": len(expenses),
            },
        })

        grand_total += period_total
        grand_net += period_net
        grand_vat += period_vat
        grand_count += len(expenses)

    return {
        "year": year,
        "month": month,
        "month_label": f"{month_name} {year}",
        "periods": periods_data,
        "grand_totals": {
            "total": round(grand_total, 2),
            "net": round(grand_net, 2),
            "vat": round(grand_vat, 2),
            "count": grand_count,
        },
    }


@router.get("/monthly/excel")
def download_monthly_excel(
    year: int = Query(..., description="Yıl"),
    month: int = Query(..., ge=1, le=12, description="Ay"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Aylık raporu Excel olarak indir."""
    user = get_current_user(authorization, db)
    periods = get_10day_periods(year, month)
    month_name = MONTH_NAMES_TR[month]

    periods_data = []
    for period in periods:
        expenses = get_period_expenses(db, user.id, period["start"], period["end"])
        expense_list = [expense_to_dict(e) for e in expenses]

        period_total = sum(e.total_amount for e in expenses)
        period_net = sum(e.net_amount or 0 for e in expenses)
        period_vat = sum(e.vat_amount or 0 for e in expenses)

        periods_data.append({
            "period": period,
            "expenses": expense_list,
            "totals": {
                "total": round(period_total, 2),
                "net": round(period_net, 2),
                "vat": round(period_vat, 2),
                "count": len(expenses),
            },
        })

    # Excel dosyası üret
    os.makedirs(os.path.join(settings.upload_dir, "reports"), exist_ok=True)
    filename = f"gider_raporu_{year}_{month:02d}_{uuid.uuid4().hex[:8]}.xlsx"
    filepath = os.path.join(settings.upload_dir, "reports", filename)

    company_name = getattr(user, 'company_name', '') or ''
    generate_excel_report(periods_data, year, month, filepath, company_name=company_name)

    return FileResponse(
        path=filepath,
        filename=f"Gider_Raporu_{month_name}_{year}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/monthly/pdf")
def download_monthly_pdf(
    year: int = Query(..., description="Yıl"),
    month: int = Query(..., ge=1, le=12, description="Ay"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Aylık raporu PDF olarak indir."""
    user = get_current_user(authorization, db)
    periods = get_10day_periods(year, month)
    month_name = MONTH_NAMES_TR[month]

    periods_data = []
    for period in periods:
        expenses = get_period_expenses(db, user.id, period["start"], period["end"])
        expense_list = [expense_to_dict(e) for e in expenses]

        period_total = sum(e.total_amount for e in expenses)
        period_net = sum(e.net_amount or 0 for e in expenses)
        period_vat = sum(e.vat_amount or 0 for e in expenses)

        periods_data.append({
            "period": period,
            "expenses": expense_list,
            "totals": {
                "total": round(period_total, 2),
                "net": round(period_net, 2),
                "vat": round(period_vat, 2),
                "count": len(expenses),
            },
        })

    # PDF dosyası üret
    os.makedirs(os.path.join(settings.upload_dir, "reports"), exist_ok=True)
    filename = f"gider_raporu_{year}_{month:02d}_{uuid.uuid4().hex[:8]}.pdf"
    filepath = os.path.join(settings.upload_dir, "reports", filename)

    company_name = getattr(user, 'company_name', '') or ''
    generate_pdf_report(periods_data, year, month, filepath, company_name=company_name)

    return FileResponse(
        path=filepath,
        filename=f"Gider_Raporu_{month_name}_{year}.pdf",
        media_type="application/pdf",
    )


@router.get("/vat-summary")
def get_vat_summary(
    year: int = Query(..., description="Yıl"),
    month: int = Query(..., ge=1, le=12, description="Ay"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Aylık KDV dökümü — muhasebeciye vermek için.

    Her KDV oranı için toplam matrah, KDV ve gider sayısını gösterir.
    """
    user = get_current_user(authorization, db)

    expenses = db.query(Expense).filter(
        Expense.user_id == user.id,
        extract("year", Expense.receipt_date) == year,
        extract("month", Expense.receipt_date) == month,
    ).all()

    # KDV oranına göre grupla — çoklu KDV oranlı fişleri doğru orana分离 et
    vat_groups = {}
    for exp in expenses:
        # vat_items_json'dan çoklu KDV satırlarını kontrol et
        vat_items = None
        if exp.vat_items_json:
            try:
                vat_items = json.loads(exp.vat_items_json)
            except (json.JSONDecodeError, TypeError):
                vat_items = None

        if vat_items and len(vat_items) > 0:
            # Her KDV satırını ayrı orana ekle
            for item in vat_items:
                rate = int(item.get("vat_rate", 0))
                if rate not in vat_groups:
                    vat_groups[rate] = {"net": 0, "vat": 0, "total": 0, "count": 0}
                vat_groups[rate]["net"] += item.get("net_amount", 0) or 0
                vat_groups[rate]["vat"] += item.get("vat_amount", 0) or 0
                vat_groups[rate]["total"] += item.get("total_amount", 0) or 0
                vat_groups[rate]["count"] += 1
        else:
            # Tek KDV oranı
            rate = int(exp.vat_rate or 0)
            if rate not in vat_groups:
                vat_groups[rate] = {"net": 0, "vat": 0, "total": 0, "count": 0}
            vat_groups[rate]["net"] += exp.net_amount or 0
            vat_groups[rate]["vat"] += exp.vat_amount or 0
            vat_groups[rate]["total"] += exp.total_amount
            vat_groups[rate]["count"] += 1

    # Sonucu düzenle
    summary = []
    for rate in sorted(vat_groups.keys()):
        g = vat_groups[rate]
        summary.append({
            "vat_rate": rate,
            "label": f"%{int(rate)}",
            "net_amount": round(g["net"], 2),
            "vat_amount": round(g["vat"], 2),
            "total_amount": round(g["total"], 2),
            "expense_count": g["count"],
        })

    total_net = sum(s["net_amount"] for s in summary)
    total_vat = sum(s["vat_amount"] for s in summary)
    total_all = sum(s["total_amount"] for s in summary)

    return {
        "year": year,
        "month": month,
        "month_label": f"{MONTH_NAMES_TR[month]} {year}",
        "groups": summary,
        "totals": {
            "net": round(total_net, 2),
            "vat": round(total_vat, 2),
            "total": round(total_all, 2),
        },
    }
