"""Google Gemini Vision ile Fiş/Makbuz OCR

Gemini'nin görüntü analizi yeteneğini kullanarak:
- İş yeri adı
- Toplam tutar
- KDV oranı ve tutarı
- Matrah
- Tarih
- Fiş numarası
bilgilerini çok daha yüksek hassasiyetle çıkarır.

Tesseract'a göre avantajları:
- Rage OCR yapar (sadece karakter tanıma değil, anlama)
- Türk fiş formatlarını daha iyi tanır
- Bozuk/bulanık fotoğraflarda bile başarılı
- Düşük,%10,%20 KDV oranlarını otomatik anlar
"""
import os
import json
import logging
import base64
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Gemini API durumu kontrol
GEMINI_AVAILABLE = False
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    logger.warning("google-generativeai paketi kurulu değil. Gemini OCR kullanılamaz.")


def _get_gemini_api_key() -> Optional[str]:
    """Gemini API key'ini al."""
    key = os.getenv("GEMINI_API_KEY", "")
    if key and key.strip():
        return key.strip()
    return None


def _configure_gemini():
    """Gemini'yi yapılandır."""
    api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY ayarlanmamış!")
    genai.configure(api_key=api_key)


def _encode_image_base64(image_path: str) -> str:
    """Fotoğrafı base64'e çevir."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


# Gemini'ye gönderilecek prompt
RECEIPT_PROMPT = """
Bu bir Türk fişi/makbuzudur/gidererekonudur. Lütfen aşağıdaki bilgileri JSON formatında çıkar:

{
  "vendor_name": "İş yeri/adı (fişin üst kısmındaki ticaret unvanı)",
  "total_amount": "Toplam ödenen tutar (KDV dahil, sayısal değer)",
  "vat_rate": "BASKIN KDV ORANI (sayısal, örneğin 20 veya 10 veya 0 veya 1). Tek KDV oranı varsa bu alan doldurulsun.",
  "vat_amount": "TOPLAM KDV tutarı (fişin altındaki 'TOPLAM KDV' veya 'Toplam KDV' yazan satırın yanındaki tutar)",
  "net_amount": "Matrah = KDV hariç tutar (sayısal). 'TOPLAM' tutarından 'TOPLAM KDV'yi çıkar",
  "vat_items": [
    {"vat_rate": 20, "total_amount": 100.00, "net_amount": 83.33, "vat_amount": 16.67},
    {"vat_rate": 10, "total_amount": 50.00, "net_amount": 45.45, "vat_amount": 4.55}
  ],
  "receipt_date": "Tarih (YYYY-MM-DD formatında, örneğin 2026-08-26)",
  "receipt_number": "Fiş/fatura numarası (varsa, yoksa boş string)",
  "category": "Gider kategorisi"
}

KATEGORİ SEÇİMİ:
- market: Market, bakkal, süpermarket (BİM, A101, ŞOK, Migros, CarrefourSA, EDIO, Happy Center, UYGUN gibi)
- akaryakıt: Benzin istasyonu (Petrol Ofisi, BP, Shell, Opet, Total gibi)
- yemek: Restoran, lokanta, kafe, fast food
- ulaşım: Taksi, Uber, toplu taşıma, otopark
- malzeme: Kırtasiye, ofis malzemesi, temizlik malzemesi (eğer market ise market seç)
- diğer: Tanınmayan iş yeri

ÖNEMLİ KURALLAR:
- Tutarlar ondalıklı sayı olmalı (virgül değil nokta ile, örneğin 341.00)
- Tarih YYYY-MM-DD formatında olmalı
- KDV tutarını bulmak için fişin alt kısmındaki 'TOPLAM KDV' satırına bak

KDV DÖKÜM TABLOSU (ÇOK ÖNEMLİ):
Türk fişlerinin alt kısmında genellikle şu tablo bulunur:
  KDV Oranı    KDV        Toplam
  %10          155,45     1.710,00 TL
  %20          0,17       1,00 TL

Bu tabloyu mutlaka bul ve vat_items dizisini doldur.
Her satır: {vat_rate, vat_amount, total_amount, net_amount}
  - vat_rate: KDV yüzde oranı (10 veya 20)
  - vat_amount: O orana ait KDV tutarı
  - total_amount: O orana ait toplam tutar (KDV dahil)
  - net_amount: total_amount - vat_amount (matrah)

vat_rate alanı ise en yüksek tutarlı (baskın) olan tek KDV oranını alsın.
Tek KDV oranı varsa bile vat_items dizisini doldur (1 elemanlı olsa bile).

- Marketlerde kırtasiye ürünü de varsa kategori yine "market" olmalı.
- Sadece JSON döndür, başka hiçbir metin yazma
- Eğer bilgi bulamıyorsan o alanı boş string veya null yap
"""

# Kategori eşleştirme
CATEGORY_MAP = {
    "market": "market",
    "bakkal": "market",
    "süpermarket": "market",
    "supermarket": "market",
    "malzeme": "malzeme",
    "malzemeler": "malzeme",
    "material": "malzeme",
    "ulaşım": "ulasim",
    "ulasim": "ulasim",
    "transport": "ulasim",
    "yemek": "yemek",
    "food": "yemek",
    "yemecek": "yemek",
    "ofis": "malzeme",
    "office": "malzeme",
    "kırtasiye": "malzeme",
    "kirtasiye": "malzeme",
    "akaryakıt": "akaryakit",
    "akaryakit": "akaryakit",
    "benzin": "akaryakit",
    "diger": "diger",
    "other": "diger",
}


def _parse_gemini_response(response_text: str) -> Optional[Dict[str, Any]]:
    """Gemini yanıtını parse et."""
    try:
        # Bazen Gemini markdown code block içinde döndürür
        text = response_text.strip()
        if text.startswith("```"):
            # ```json\n{...}\n``` formatını temizle
            lines = text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```"):
                    in_block = not in_block
                    continue
                if in_block or (not line.startswith("```")):
                    json_lines.append(line)
            text = "\n".join(json_lines).strip()

        data = json.loads(text)

        # Kategori normalize et
        if "category" in data and data["category"]:
            cat_lower = data["category"].lower().strip()
            data["category"] = CATEGORY_MAP.get(cat_lower, "diger")

        # Tutarları float'a çevir
        for field in ["total_amount", "vat_amount", "net_amount", "vat_rate"]:
            val = data.get(field)
            if val is not None and val != "" and val != "null":
                try:
                    if isinstance(val, str):
                        val = val.replace(",", ".").replace("₺", "").replace("TL", "").strip()
                    data[field] = float(val)
                except (ValueError, TypeError):
                    data[field] = None
            else:
                data[field] = None

        # Çoklu KDV satırlarını parse et
        if "vat_items" in data and isinstance(data["vat_items"], list) and len(data["vat_items"]) > 0:
            parsed_items = []
            for item in data["vat_items"]:
                if isinstance(item, dict):
                    parsed_item = {}
                    for field in ["vat_rate", "total_amount", "net_amount", "vat_amount"]:
                        val = item.get(field)
                        if val is not None and val != "" and val != "null":
                            try:
                                if isinstance(val, str):
                                    val = val.replace(",", ".").replace("₺", "").replace("TL", "").strip()
                                parsed_item[field] = float(val)
                            except (ValueError, TypeError):
                                parsed_item[field] = None
                        else:
                            parsed_item[field] = None
                    parsed_items.append(parsed_item)
            data["vat_items"] = parsed_items if parsed_items else None
        else:
            data["vat_items"] = None

        return data

    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse hatası: {e}\nYanıt: {response_text[:500]}")
        return None
    except Exception as e:
        logger.error(f"Gemini yanıt işleme hatası: {e}")
        return None


def scan_receipt_with_gemini(image_path: str) -> Optional[Dict[str, Any]]:
    """Gemini Vision ile fiş/makbuz tara.

    Args:
        image_path: Fotoğraf dosya yolu

    Returns:
        dict veya None (hata olursa)
    """
    if not GEMINI_AVAILABLE:
        logger.warning("Gemini mevcut değil")
        return None

    api_key = _get_gemini_api_key()
    if not api_key:
        logger.warning("GEMINI_API_KEY ayarlanmamış")
        return None

    try:
        _configure_gemini()

        # Fotoğrafı base64'e çevir
        image_data = _encode_image_base64(image_path)

        # Fotoğrafın MIME tipini belirle
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".heic": "image/heic",
        }
        mime_type = mime_map.get(ext, "image/jpeg")

        # Gemini modeli
        model = genai.GenerativeModel("gemini-3.5-flash-lite")

        # Görüntüyi hazırla
        image_part = {
            "inline_data": {
                "mime_type": mime_type,
                "data": image_data,
            }
        }

        # İsteği gönder
        logger.info("Gemini OCR isteği gönderiliyor...")
        response = model.generate_content(
            [RECEIPT_PROMPT, image_part],
            generation_config=genai.GenerationConfig(
                temperature=0.1,  # Düşük temperature = daha tutarlı sonuçlar
                max_output_tokens=1024,
            ),
        )

        if not response.text:
            logger.warning("Gemini boş yanıt döndürdü")
            return None

        logger.info(f"Gemini OCR yanıtı alındı: {len(response.text)} karakter")

        # Yanıtı parse et
        result = _parse_gemini_response(response.text)
        return result

    except Exception as e:
        logger.error(f"Gemini OCR hatası: {e}")
        return None


def is_gemini_available() -> bool:
    """Gemini API'sinin kullanılıp kullanılamayacağını kontrol et."""
    return GEMINI_AVAILABLE and _get_gemini_api_key() is not None
