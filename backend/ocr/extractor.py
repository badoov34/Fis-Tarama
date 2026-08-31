"""Gelişmiş Veri Çıkarıcı — OCR metninden yapılandırılmış veri çıkarma.

Türkçe fiş/makbuz formatlarından:
- KDV oranı (%0, %1, %10, %20)
- Toplam tutar
- Matrah (KDV hariç)
- KDV tutarı
- İş yeri adı
- Tarih
- Fiş/fatura numarası
"""
import re
import logging
from datetime import date, datetime
from typing import Optional, Tuple, List
from schemas import OCRResult

logger = logging.getLogger(__name__)

# ============================================================================
# TÜRKİYE KDV ORANLARI
# ============================================================================
VALID_VAT_RATES = [0, 1, 10, 20]

# KDV ile ilgili anahtar kelimeler
VAT_KEYWORDS = [
    "kdv", "vergi", "katma değer", "katmadeğer", "k.d.v.",
    "topkdv", "toplam kdv", "vergi toplam", "kdv dahil", "kdv hariç",
    "topkdv", "k.d.v",
]

# Toplam ile ilgili anahtar kelimeler (büyük/küçük harf duyarsız)
TOTAL_KEYWORDS = [
    "toplam", "genel toplam", "ödenecek", "tutar", "fiyat",
    "bedel", "brüt", "ödeme tutarı", "tahsilat", "nakit",
    "kredi kartı", "banka/kredi", "toplam tutar", "geçen toplam",
    "töp", "toplamı", "toplaam",
]

# Matrah ile ilgili anahtar kelimeler
NET_KEYWORDS = [
    "matrah", "vergi hariç", "kdv hariç", "net tutar",
    "vergi indirimi hariç", "toplam matrah", "vergiye tabi",
    "net", "vergi matrah",
]

# ============================================================================
# TUTAR PATTERNLERİ — Çoklu format desteği
# ============================================================================
def get_amount_patterns():
    """Tüm tutar patternlerini döndür."""
    return [
        # * ile başlayan tutarlar (POS fişlerinde yaygın)
        r"\*\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",           # *341.00 veya *1.250,50
        r"\*\s*(\d+(?:,\d{1,2})?)",                              # *341 veya *341,50
        
        # ₺ veya TL ile biten
        r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*₺",            # 1.250,00₺
        r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*TL",            # 1.250,00TL
        r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*T\s*L",         # 1.250,00 T L
        r"(\d+(?:,\d{1,2})?)\s*₺",                              # 1250₺
        r"(\d+(?:,\d{1,2})?)\s*TL",                             # 1250TL
        
        # Sonunda tutar olan (satır sonu)
        r"(\d{1,3}(?:\.\d{3})*,\d{2})\s*$",                    # 1.250,00 (satır sonu)
        r"(\d+\.\d{2})\s*$",                                    # 341.00 (satır sonu)
        
        # Sadecen sayısal tutarlar
        r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",                 # 1.250,00 veya 341.00
    ]


# ============================================================================
# TARİH PATTERNLERİ
# ============================================================================
DATE_PATTERNS = [
    r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})",    # 25/08/2026
    r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})",      # 25/08/26
    r"(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})",      # 2026-08-25
]


# ============================================================================
# KDV ORANI PATTERNLERİ
# ============================================================================
VAT_RATE_PATTERNS = [
    r"%\s*(\d{1,2})\s*(?:kdv|vergi)",        # %20 KDV
    r"(?:kdv|vergi)\s*%?\s*(\d{1,2})",        # KDV 20 veya KDV%20
    r"%\s*(\d{1,2})",                          # %20
    r"(\d{1,2})\s*%",                          # 20%
    r"(?:oran|rate)\s*:?\s*(\d{1,2})",        # Oran: 20
    r"topkdv\s*\*?\s*(\d+(?:,\d{1,2})?)",     # TOPKDV *31.00 (KDV tutarı, oran hesaplanacak)
]


def parse_turkish_amount(text: str) -> Optional[float]:
    """Türkçe formatındaki tutarı float'a çevir.
    
    Örnekler:
    - "1.250,00" → 1250.00
    - "341.00" → 341.00
    - "341,50" → 341.50
    - "*341.00" → 341.00
    """
    if not text:
        return None
    
    # Temizle
    cleaned = text.strip().replace("₺", "").replace("TL", "").replace("T L", "")
    cleaned = cleaned.lstrip("*").strip()  # Başındaki * işaretini kaldır
    
    if not cleaned:
        return None
    
    # Binlik ayracı noktaysa ve ondalık virgüldü (1.250,00 formatı)
    if "." in cleaned and "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        # Virgül var — ondalık ayracı olabilir
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            # 341,50 formatı — virgül ondalık
            cleaned = cleaned.replace(",", ".")
        else:
            # 1.250,00 formatı — virgül ondalık, nokta binlik
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "." in cleaned:
        parts = cleaned.split(".")
        if len(parts) > 1 and len(parts[-1]) == 2:
            # 341.00 — ondalık kısım (nokta ondalık ayracı)
            pass
        elif len(parts) > 1 and len(parts[-1]) == 3 and len(parts[0]) <= 2:
            # 10.000 formatı — nokta binlik ayracı değil, tam sayı
            cleaned = cleaned.replace(".", "")
        else:
            # 1.250 formatı — nokta binlik ayracı
            cleaned = cleaned.replace(".", "")
    
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def extract_all_amounts(text: str) -> List[float]:
    """Metindeki TÜM tutarları çıkar ve sıralı listele."""
    amounts = []
    patterns = get_amount_patterns()
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
        for m in matches:
            val = parse_turkish_amount(m)
            if val is not None and val > 0.01:  # Sıfıra yakın değerleri atla
                amounts.append(val)
    
    # Tekrar eden değerleri kaldır ama sırayı koru
    seen = set()
    unique = []
    for a in amounts:
        rounded = round(a, 2)
        if rounded not in seen:
            seen.add(rounded)
            unique.append(a)
    
    return sorted(unique, reverse=True)


def extract_amount_near_keyword(text: str, keyword: str, search_range: int = 100) -> Optional[float]:
    """Belirli bir anahtar kelime YAKININDAKİ tutarı bulur.
    
    Anahtar kelime SONRASINDAKİ tutarı tercih eder (satır sonu formatları için).
    """
    text_lower = text.lower()
    idx = text_lower.find(keyword.lower())
    if idx == -1:
        return None
    
    # Sadece anahtar kelime SONRASINDAKİ metni ara (en güvenilir)
    after_text = text[idx:idx + search_range]
    
    patterns = get_amount_patterns()
    for pattern in patterns:
        matches = re.findall(pattern, after_text, re.IGNORECASE)
        if matches:
            amounts = [parse_turkish_amount(m) for m in matches]
            amounts = [a for a in amounts if a is not None and a > 0]
            if amounts:
                return amounts[0]  # İlk bulunan tutar
    
    # Sonra周围的 metni de kontrol et (anahtar kelime öncesi için)
    start = max(0, idx - 30)
    context = text[start:idx + search_range]
    for pattern in patterns:
        matches = re.findall(pattern, context, re.IGNORECASE)
        if matches:
            amounts = [parse_turkish_amount(m) for m in matches]
            amounts = [a for a in amounts if a is not None and a > 0]
            if amounts:
                return amounts[-1]  # Son bulunan tutar
    
    return None


def extract_vat_rate_from_text(text: str) -> Optional[float]:
    """OCR metninden KDV oranını çıkar."""
    text_lower = text.lower()
    
    # Direkt KDV oranı patternleri
    for pattern in VAT_RATE_PATTERNS[:-1]:  # Son pattern hariç (TOPKDV tutar verir)
        matches = re.findall(pattern, text_lower)
        for match in matches:
            try:
                rate = float(match)
                if rate in VALID_VAT_RATES:
                    return rate
            except ValueError:
                continue
    
    # TOPKDV ile KDV oranını hesapla
    topkdv_match = re.search(r"topkdv\s*\*?\s*(\d+(?:,\d{1,2})?)", text_lower)
    toplam_match = re.search(r"toplam\s*\*?\s*(\d+(?:,\d{1,2})?)", text_lower)
    
    if topkdv_match and toplam_match:
        kdv_amount = parse_turkish_amount(topkdv_match.group(1))
        toplam = parse_turkish_amount(toplam_match.group(1))
        
        if kdv_amount and toplam and toplam > kdv_amount:
            net = toplam - kdv_amount
            if net > 0:
                calculated_rate = round((kdv_amount / net) * 100, 0)
                if calculated_rate in VALID_VAT_RATES:
                    return calculated_rate
    
    # KDV ile ilgili satırlarda ara
    for line in text.split("\n"):
        line_lower = line.lower()
        if any(kw in line_lower for kw in VAT_KEYWORDS):
            for pattern in VAT_RATE_PATTERNS[:-1]:
                matches = re.findall(pattern, line_lower)
                for match in matches:
                    try:
                        rate = float(match)
                        if rate in VALID_VAT_RATES:
                            return rate
                    except ValueError:
                        continue
    
    return None


def extract_date(text: str) -> Optional[date]:
    """OCR metninden tarihi çıkar — OCR düzeltmeli."""
    all_dates = re.findall(r"(\d{1,2})\s*[/\.-]\s*(\d{1,2})\s*[/\.-]\s*(\d{2,4})", text)
    
    for match in all_dates:
        result = _parse_date_match(match)
        if result:
            return result
    
    return None


def _fix_ocr_digit(digit_str: str, position: str = "") -> int:
    """OCR hatalı rakamlarını düzelt.
    
    Yaygın OCR hataları:
    - 6 → 0 (düşük kalitede benzer)
    - 8 → 3 
    - 68 → 08 (ay için)
    """
    val = int(digit_str)
    
    if position == "month" and val > 12:
        # Ay 12'den büyükse OCR hatası olabilir
        if val == 68:
            return 8   # 68 → 08
        elif val == 60:
            return 6   # 60 → 06
        elif val == 80:
            return 8   # 80 → 08
        elif val == 61:
            return 1   # 61 → 01
        elif val == 62:
            return 2   # 62 → 02
        elif val == 63:
            return 3   # 63 → 03
        elif val == 64:
            return 4   # 64 → 04
        elif val == 65:
            return 5   # 65 → 05
        elif val == 67:
            return 7   # 67 → 07
        elif val == 69:
            return 9   # 69 → 09
    
    return val


def _parse_date_match(match) -> Optional[date]:
    """Tarih eşleşmesini date nesnesine çevir — OCR düzeltmeli."""
    try:
        if len(match) != 3:
            return None
        
        a_raw, b_raw, c_raw = match[0], match[1], match[2]
        a = int(a_raw)
        b = int(b_raw)
        c = int(c_raw)
        
        # Hangi format? (Önce standart dene)
        if a > 31 and b <= 12 and c <= 31:
            y, m, d = a, b, c
        elif a <= 31 and b <= 12 and c > 31:
            d, m, y = a, b, c
        elif a <= 31 and b <= 12 and c <= 31:
            d, m, y = a, b, 2000 + c
        elif a <= 31 and b > 12 and c <= 31:
            # Ay geçersiz — OCR düzeltmesi dene
            m_fixed = _fix_ocr_digit(b_raw, "month")
            d, m, y = a, m_fixed, 2000 + c
        else:
            return None
        
        # Doğrulama
        if 1 <= m <= 12 and 1 <= d <= 31 and 2020 <= y <= 2030:
            return date(y, m, d)
    except (ValueError, OverflowError):
        pass
    return None


def extract_vendor_name(text: str) -> str:
    """OCR metninden iş yeri adını çıkar."""
    lines = text.strip().split("\n")
    
    skip_words = [
        "fiş", "makbuz", "fatura", "tarih", "saat", "kasa", "adisyon",
        "kredi", "nakit", "toplam", "tutar", "vergi", "kdv", "indirim",
        "para üstü", "ödeme", "müşteri", "adet", "birim", "stok",
        "sayın", "değerli", "müşterimiz", "hoş geldiniz", "satış",
        "t.c.", "vergi no", "v.d.", "sirket", "şirket", "ltd", "limited",
        "a.ş.", "anonim", "ithalat", "ihracat", "ticaret", "sanayi",
        "mah.", "sok.", "cad.", "bulvar", "no:", "daire",
    ]
    
    for line in lines[:10]:
        cleaned = line.strip()
        if not cleaned or len(cleaned) < 3:
            continue
        
        # Sayı veya sembol ağırlıklı satırları atla
        alpha_count = sum(c.isalpha() for c in cleaned)
        alpha_ratio = alpha_count / max(len(cleaned), 1)
        if alpha_ratio < 0.4:
            continue
        
        # Bilinen kelimeler içeren satırları atla
        if any(sw in cleaned.lower() for sw in skip_words):
            continue
        
        # Çok uzunsa muhtemelen açıklama
        if len(cleaned) > 80:
            continue
        
        # Sadece noktalı virgül veya nokta içeren satırları atla
        if all(c in ".,;:- " for c in cleaned):
            continue
        
        return cleaned
    
    return ""


def extract_receipt_number(text: str) -> str:
    """Fiş/fatura numarasını çıkar."""
    patterns = [
        r"FİŞ\s*NO\s*:\s*(\d+)",
        r"FATURA\s*NO\s*:\s*(\d+)",
        r"SİPARİŞ\s*NO\s*:\s*(\d+)",
        r"İS\s*NO\s*:\s*(\d+)",
        r"NO\s*:\s*(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def extract_vkn(text: str) -> str:
    """OCR metninden VKN (Vergi Kimlik Numarası) veya TCKN çıkar.

    Türkiye'de:
    - Şirketler: 10 haneli VKN
    - Şahıslar: 11 haneli TCKN
    Fişlerde genellikle "Vergi No:", "VKN:", "T.C. No:" olarak geçer.
    """
    patterns = [
        # VKN patterns (10 haneli)
        r"VERG[İI]\s*N[OÖ]\s*:?\s*(\d{10})",
        r"VKN\s*:?\s*(\d{10})",
        r"VERG[İI]\s*K[İI]ML[İI]K\s*N[OÖ]\s*:?\s*(\d{10})",
        # TCKN patterns (11 haneli)
        r"T\.?\s*C\.?\s*N[OÖ]\s*:?\s*(\d{11})",
        r"T.C\.?\s*:\s*(\d{11})",
        r"KİMLİK\s*N[OÖ]\s*:?\s*(\d{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def extract_category(text: str, vendor_name: str = "") -> Optional[str]:
    """OCR metninden kategori öner."""
    text_lower = text.lower()
    vendor_lower = vendor_name.lower() if vendor_name else ""

    # Market tespiti — iş yeri adı veya ürün listesi
    market_keywords = ["market", "bim", "a101", "şok", "migros", "carrefour", "edio",
                       "happy center", "uygun", "çarşı", "mahalle", "süper"]
    if any(kw in vendor_lower for kw in market_keywords):
        return "market"

    # Ürün bazlı market tespiti
    market_products = ["süt", "ekmek", "peynir", "yoğurt", "tereyağı", "yumurta",
                       "şeker", "un", "pirinç", "makarna", "salça", "zeytinyağı"]
    if sum(1 for p in market_products if p in text_lower) >= 3:
        return "market"

    # Akaryakıt
    fuel_keywords = ["benzin", "motorin", "lpg", "akaryakıt", "petrol", "bp", "shell",
                     "opet", "total", "petrol ofisi"]
    if any(kw in text_lower or kw in vendor_lower for kw in fuel_keywords):
        return "akaryakıt"

    # Yemek
    food_keywords = ["restoran", "lokanta", "kafe", "fast food", "pizza", "burger",
                     "yemek", "kahvaltı", "öğle"]
    if any(kw in text_lower or kw in vendor_lower for kw in food_keywords):
        return "yemek"

    # Ulaşım
    transport_keywords = ["taksi", "uber", "otobüs", "metro", "otopark", "toplu taşıma"]
    if any(kw in text_lower for kw in transport_keywords):
        return "ulaşım"

    return None


def extract_vat_breakdown_table(text: str) -> Optional[List[dict]]:
    """OCR metnindeki KDV döküm tablosunu parse et.
    
    Türk fişlerinin alt kısmında şu format bulunur:
        KDV Oranı    KDV        Toplam
        %10          155,45     1.710,00 TL
        %20          0,17       1,00 TL
    
    Returns:
        List of {vat_rate, vat_amount, total_amount} veya None
    """
    lines = text.split("\n")
    results = []
    found_header = False
    
    for line in lines:
        line_stripped = line.strip()
        line_lower = line_stripped.lower()
        
        # Tablo başlığını algıla
        if "kdv" in line_lower and ("oran" in line_lower or "toplam" in line_lower):
            # "KDV Oranı" veya "KDV Oranı   KDV   Toplam" başlık satırı
            if "%" not in line_lower or not any(c.isdigit() for c in line_stripped):
                # Başlık satırı — rakam yok
                found_header = True
                continue
        
        if not found_header:
            continue
        
        # "%XX" ile başlayan satırları ara
        rate_match = re.match(
            r"\s*%(\d{1,2})\s+([\d.,]+)\s+([\d.,]+)",
            line_stripped
        )
        if rate_match:
            try:
                rate = float(rate_match.group(1))
                if rate not in VALID_VAT_RATES:
                    continue
                
                vat_amount = parse_turkish_amount(rate_match.group(2))
                total_amount = parse_turkish_amount(rate_match.group(3))
                
                if vat_amount is not None and total_amount is not None:
                    # Matrahı hesapla
                    net_amount = round(total_amount - vat_amount, 2)
                    results.append({
                        "vat_rate": rate,
                        "vat_amount": vat_amount,
                        "total_amount": total_amount,
                        "net_amount": net_amount,
                    })
            except (ValueError, IndexError):
                continue
        elif found_header and results:
            # Tablo sonu — başka bir satır geldi, dur
            if not line_stripped.startswith("%"):
                break
    
    return results if len(results) >= 2 else None


def extract_amounts(text: str) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """OCR metninden tutar bilgilerini çıkar.
    
    Returns:
        (total_amount, net_amount, vat_rate, vat_amount)
    """
    total = None
    net = None
    vat_rate = extract_vat_rate_from_text(text)
    
    # ÖZEL DURUM: Hem TOPLAM hem TOPKDV varsa → en doğru sonucu üret
    toplam_match = re.search(r"toplam\s*\*?\s*(\d+(?:[.,]\d{1,2})?)", text, re.IGNORECASE)
    topkdv_match = re.search(r"topkdv\s*\*?\s*(\d+(?:[.,]\d{1,2})?)", text, re.IGNORECASE)
    
    if toplam_match and topkdv_match:
        toplam_val = parse_turkish_amount(toplam_match.group(1))
        kdv_val = parse_turkish_amount(topkdv_match.group(1))
        
        if toplam_val and kdv_val and toplam_val > kdv_val:
            total = toplam_val
            vat_amount = kdv_val
            net = round(total - vat_amount, 2)
            
            # KDV oranını hesapla
            if net > 0:
                calculated_rate = round((vat_amount / net) * 100, 0)
                if calculated_rate in VALID_VAT_RATES:
                    vat_rate = calculated_rate
                else:
                    # Hesaplanamazsa en yaygın orana göre
                    vat_rate = 20.0
                    net = round(total / 1.20, 2)
                    vat_amount = round(total - net, 2)
            
            return total, net, vat_rate, vat_amount
    
    # Genel yöntem: Anahtar kelimelerle ara
    # Yöntem 1: "TOPLAM" anahtar kelimesi yakınında tutar ara
    for keyword in TOTAL_KEYWORDS:
        total = extract_amount_near_keyword(text, keyword)
        if total is not None:
            break
    
    # Yöntem 2: Tüm tutarları bul, en büyüğünü al (genelde toplam budur)
    if total is None:
        all_amounts = extract_all_amounts(text)
        if all_amounts:
            total = all_amounts[0]  # En büyük tutar
    
    # Yöntem 3: "MATRAH" ara
    for keyword in NET_KEYWORDS:
        net = extract_amount_near_keyword(text, keyword)
        if net is not None:
            break
    
    # KDV hesapla
    vat_amount = None
    if total is not None:
        if net is not None and vat_rate is not None:
            vat_amount = round(total - net, 2)
        elif vat_rate is not None and vat_rate > 0:
            net = round(total / (1 + vat_rate / 100), 2)
            vat_amount = round(total - net, 2)
        elif net is not None:
            vat_amount = round(total - net, 2)
            if net > 0:
                calculated_rate = round((vat_amount / net) * 100, 0)
                if calculated_rate in VALID_VAT_RATES:
                    vat_rate = calculated_rate
    
    # KDV oranı hâlâ bulunamadıysa
    if vat_rate is None and total is not None:
        if "topkdv" in text.lower() or "kdv" in text.lower():
            vat_rate = 20.0
            net = round(total / 1.20, 2)
            vat_amount = round(total - net, 2)
    
    return total, net, vat_rate, vat_amount


def process_ocr_text(text: str) -> OCRResult:
    """OCR ham metnini yapılandırılmış veriye çevir."""
    if not text or not text.strip():
        return OCRResult(
            raw_text="",
            suggestion="Fiş okunamadı. Lütfen fotoğrafı net bir şekilde çekin ve tekrar deneyin.",
        )
    
    # Adım 1: Tutar bilgilerini çıkar
    total, net, vat_rate, vat_amount = extract_amounts(text)
    
    # Adım 2: İş yeri adını çıkar
    vendor = extract_vendor_name(text)
    
    # Adım 3: Tarihi çıkar
    receipt_date = extract_date(text)
    
    # Adım 4: Fiş numarasını çıkar
    receipt_number = extract_receipt_number(text)
    
    # Adım 4.5: VKN/TCKN çıkar
    vkn = extract_vkn(text)
    
    # Adım 5: KDV döküm tablosunu ara
    vat_items_data = extract_vat_breakdown_table(text)
    
    # Adım 6: Kategori öner
    category = extract_category(text, vendor)
    
    # Adım 7: Güven skorunu hesapla
    confidence = 40.0
    if total is not None and total > 0:
        confidence += 25
    if vat_rate is not None:
        confidence += 15
    if receipt_date is not None:
        confidence += 10
    if vendor:
        confidence += 5
    if receipt_number:
        confidence += 5
    confidence = min(confidence, 100.0)
    
    # Mesaj oluştur
    suggestion = None
    if total is None:
        suggestion = "Toplam tutar okunamadı. Lütfen elle girin."
    elif vat_rate is None:
        suggestion = "KDV oranı belirlenemedi. Lütfen KDV oranını seçin (%0, %1, %10, %20)."
    
    logger.info(
        f"OCR çıkarma: tutar={total}, matrah={net}, "
        f"KDV%={vat_rate}, KDV={vat_amount}, iş_yeri={vendor}"
    )
    
    # vat_items oluştur (eğer tablo bulunduysa)
    vat_items = None
    if vat_items_data and len(vat_items_data) >= 2:
        from schemas import VatItem
        vat_items = [
            VatItem(
                vat_rate=item["vat_rate"],
                total_amount=item["total_amount"],
                net_amount=item["net_amount"],
                vat_amount=item["vat_amount"],
            )
            for item in vat_items_data
        ]
    
    return OCRResult(
        total_amount=total,
        net_amount=net,
        vat_rate=vat_rate,
        vat_amount=vat_amount,
        vat_items=vat_items,
        vendor_name=vendor or "",
        receipt_date=receipt_date,
        receipt_number=receipt_number,
        vkn=vkn,
        category=category,
        confidence=confidence,
        raw_text=text,
        suggestion=suggestion,
    )


def process_receipt(image_path: str) -> OCRResult:
    """Tam fiş işleme pipeline'ı."""
    from ocr.processor import extract_text_from_image
    
    raw_text = extract_text_from_image(image_path)
    
    if not raw_text:
        return OCRResult(
            raw_text="",
            suggestion=(
                "Fişten metin okunamadı. Mümkünse:\n"
                "- Fotoğrafın net olduğundan emin olun\n"
                "- Işık yansımalarını engelleyin\n"
                "- Fişi düz bir yüzeye koyun\n"
                "Tekrar deneyin veya elle giriş yapın."
            ),
        )
    
    result = process_ocr_text(raw_text)
    return result
