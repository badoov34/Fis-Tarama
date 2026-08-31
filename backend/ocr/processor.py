"""OCR İşlemcisi — Gemini + Tesseract hibrit OCR sistemi.

Öncelik sırası:
1. Google Gemini Vision (çok yüksek hassasiyet, ücretsiz 15 istek/dk)
2. Tesseract OCR (yedek, internet gerekmez)

Gemini kullanılamıyorsa otomatik olarak Tesseract'a geçiş yapar.
"""
import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract

from config import settings
from schemas import OCRResult

logger = logging.getLogger(__name__)


def preprocess_image(image_path: str) -> Image.Image:
    """Fotoğrafı Tesseract OCR için hazırla — netleştir, kontrastı artır."""
    img = Image.open(image_path)

    # Gri tonlamaya çevir
    if img.mode != "L":
        img = img.convert("L")

    # Kontrastı artır (fişler genelde soluk basılır)
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Keskinleştir
    img = img.filter(ImageFilter.SHARPEN)

    # Gürültü temizleme (medyan filtre)
    img = img.filter(ImageFilter.MedianFilter(size=3))

    return img


def extract_text_from_image(image_path: str, lang: Optional[str] = None) -> str:
    """Fotoğraftan Tesseract ile metin çıkar (yedek OCR)."""
    if lang is None:
        lang = settings.tesseract_lang

    processed_img = preprocess_image(image_path)
    custom_config = r"--oem 3 --psm 6"

    try:
        text = pytesseract.image_to_string(
            processed_img,
            lang=lang,
            config=custom_config,
        )
        logger.info(f"Tesseract OCR başarılı — {len(text)} karakter okundu")
        return text.strip()
    except pytesseract.TesseractError as e:
        logger.error(f"Tesseract OCR hatası: {e}", exc_info=True)
        try:
            text = pytesseract.image_to_string(
                processed_img,
                lang="eng",
                config=custom_config,
            )
            logger.warning("Türkçe OCR başarısız, İngilizce ile denendi")
            return text.strip()
        except Exception:
            logger.error("Tesseract OCR tamamen başarısız")
            return ""


def get_ocr_confidence(image_path: str, lang: Optional[str] = None) -> float:
    """OCR güven skorunu hesapla (0-100) — Tesseract için."""
    if lang is None:
        lang = settings.tesseract_lang

    processed_img = preprocess_image(image_path)
    custom_config = r"--oem 3 --psm 6"

    try:
        data = pytesseract.image_to_data(
            processed_img,
            lang=lang,
            config=custom_config,
            output_type=pytesseract.Output.DICT,
        )
        confidences = [
            int(c) for c, t in zip(data["conf"], data["text"])
            if int(c) > 0 and t.strip()
        ]
        if confidences:
            avg = sum(confidences) / len(confidences)
            logger.info(f"Tesseract güven skoru: {avg:.1f}% ({len(confidences)} kelime)")
            return round(avg, 1)
        return 0.0
    except Exception as e:
        logger.error(f"Güven skoru hesaplama hatası: {e}")
        return 0.0


def scan_with_gemini(image_path: str) -> Tuple[Optional[Dict[str, Any]], bool]:
    """Gemini Vision ile fiş tara.

    Returns:
        (result_dict, success) — success=False ise Tesseract'a geç
    """
    try:
        from ocr.gemini_ocr import scan_receipt_with_gemini, is_gemini_available

        if not is_gemini_available():
            logger.info("Gemini API mevcut değil, Tesseract kullanılıyor")
            return None, False

        result = scan_receipt_with_gemini(image_path)

        if result and result.get("total_amount") is not None:
            logger.info(
                f"Gemini OCR başarılı: iş_yeri={result.get('vendor_name')}, "
                f"tutar={result.get('total_amount')}, KDV%={result.get('vat_rate')}"
            )
            return result, True
        else:
            logger.warning("Gemini OCR sonuç vermedi, Tesseract'a geçiliyor")
            return None, False

    except Exception as e:
        logger.error(f"Gemini OCR hatası, Tesseract'a geçiliyor: {e}")
        return None, False


def scan_with_tesseract(image_path: str) -> Optional[Dict[str, Any]]:
    """Tesseract ile fiş tara (yedek OCR)."""
    try:
        from ocr.extractor import process_receipt

        ocr_result = process_receipt(image_path)

        # vat_items dict'e çevir
        vat_items_list = None
        if ocr_result.vat_items and len(ocr_result.vat_items) > 0:
            vat_items_list = [
                {
                    "vat_rate": item.vat_rate,
                    "total_amount": item.total_amount,
                    "net_amount": item.net_amount,
                    "vat_amount": item.vat_amount,
                }
                for item in ocr_result.vat_items
            ]

        return {
            "vendor_name": ocr_result.vendor_name or "",
            "total_amount": ocr_result.total_amount,
            "vat_rate": ocr_result.vat_rate,
            "vat_amount": ocr_result.vat_amount,
            "net_amount": ocr_result.net_amount,
            "vat_items": vat_items_list,
            "vkn": ocr_result.vkn or "",
            "receipt_date": ocr_result.receipt_date.isoformat() if ocr_result.receipt_date else None,
            "receipt_number": ocr_result.receipt_number or "",
            "category": ocr_result.category or "diger",
            "confidence": ocr_result.confidence or 0.0,
            "suggestion": ocr_result.suggestion,
        }
    except Exception as e:
        logger.error(f"Tesseract OCR hatası: {e}", exc_info=True)
        return None


def scan_receipt(image_path: str) -> OCRResult:
    """Hibrit OCR — Önce Gemini, sonra Tesseract.

    Bu fonksiyon tüm uygulamanın kullandığı ana giriş noktasıdır.
    """
    # Adım 1: Gemini dene
    gemini_result, gemini_success = scan_with_gemini(image_path)

    if gemini_success and gemini_result:
        # Gemini başarılı!
        logger.info("✅ Gemini OCR kullanıldı")

        from ocr.extractor import VALID_VAT_RATES
        from datetime import date as date_type
        from schemas import VatItem

        # Tarih dönüşümü
        receipt_date = None
        if gemini_result.get("receipt_date"):
            try:
                receipt_date = date_type.fromisoformat(gemini_result["receipt_date"])
            except (ValueError, TypeError):
                receipt_date = None

        # KDV oranı düzeltmesi
        vat_rate = gemini_result.get("vat_rate")
        if vat_rate is not None and vat_rate not in VALID_VAT_RATES:
            vat_rate = 20.0  # Varsayılan

        # Çoklu KDV satırları
        vat_items = None
        raw_vat_items = gemini_result.get("vat_items")
        if raw_vat_items and isinstance(raw_vat_items, list) and len(raw_vat_items) > 0:
            vat_items = []
            for item in raw_vat_items:
                if isinstance(item, dict):
                    item_rate = item.get("vat_rate")
                    if item_rate is not None and item_rate not in VALID_VAT_RATES:
                        item_rate = 20.0
                    vat_items.append(VatItem(
                        vat_rate=item_rate or 20.0,
                        total_amount=item.get("total_amount"),
                        net_amount=item.get("net_amount"),
                        vat_amount=item.get("vat_amount"),
                    ))

        # Kategori önerisi
        category = gemini_result.get("category")
        if category:
            cat_lower = category.lower().strip()
            from ocr.gemini_ocr import CATEGORY_MAP
            category = CATEGORY_MAP.get(cat_lower, cat_lower)

        return OCRResult(
            total_amount=gemini_result.get("total_amount"),
            net_amount=gemini_result.get("net_amount"),
            vat_rate=vat_rate,
            vat_amount=gemini_result.get("vat_amount"),
            vat_items=vat_items,
            vendor_name=gemini_result.get("vendor_name", ""),
            receipt_date=receipt_date,
            receipt_number=gemini_result.get("receipt_number", ""),
            vkn=gemini_result.get("vkn", ""),
            category=category,
            confidence=95.0,  # Gemini güvenilirliği yüksek
            raw_text=f"[Gemini OCR] {gemini_result.get('vendor_name', '')} {gemini_result.get('total_amount', '')} {gemini_result.get('vat_amount', '')} KDV:{gemini_result.get('vat_rate', '')}%",
            suggestion=gemini_result.get("suggestion"),
        )

    # Adım 2: Tesseract ile dene (yedek)
    logger.info("⚡ Tesseract OCR kullanılıyor (yedek)")
    tesseract_result = scan_with_tesseract(image_path)

    if tesseract_result:
        from datetime import date as date_type

        receipt_date = None
        if tesseract_result.get("receipt_date"):
            try:
                d = tesseract_result["receipt_date"]
                if isinstance(d, str):
                    receipt_date = date_type.fromisoformat(d)
                else:
                    receipt_date = d
            except (ValueError, TypeError):
                receipt_date = None

        # vat_items listesini oluştur
        vat_items = None
        raw_vat_items = tesseract_result.get("vat_items")
        if raw_vat_items and isinstance(raw_vat_items, list) and len(raw_vat_items) > 0:
            vat_items = []
            for item in raw_vat_items:
                if isinstance(item, dict):
                    vat_items.append(VatItem(
                        vat_rate=item.get("vat_rate", 20),
                        total_amount=item.get("total_amount"),
                        net_amount=item.get("net_amount"),
                        vat_amount=item.get("vat_amount"),
                    ))

        return OCRResult(
            total_amount=tesseract_result.get("total_amount"),
            net_amount=tesseract_result.get("net_amount"),
            vat_rate=tesseract_result.get("vat_rate"),
            vat_amount=tesseract_result.get("vat_amount"),
            vat_items=vat_items,
            vendor_name=tesseract_result.get("vendor_name", ""),
            receipt_date=receipt_date,
            receipt_number=tesseract_result.get("receipt_number", ""),
            category=tesseract_result.get("category"),
            confidence=tesseract_result.get("confidence", 40.0),
            raw_text=tesseract_result.get("raw_text", ""),
            suggestion=tesseract_result.get("suggestion"),
        )

    # Hiçbir OCR çalışmadı
    return OCRResult(
        raw_text="",
        suggestion=(
            "Fiş okunamadı. Lütfen:\n"
            "- Fotoğrafın net olduğundan emin olun\n"
            "- Işık yansımalarını engelleyin\n"
            "- Fişi düz bir yüzeye koyun\n"
            "Tekrar deneyin veya elle giriş yapın."
        ),
    )
