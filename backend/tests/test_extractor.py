"""ocr/extractor.py fonksiyonları için unit testler.

Test edilen fonksiyonlar:
- parse_turkish_amount
- extract_all_amounts
- extract_amount_near_keyword
- extract_vat_rate_from_text
- extract_date
- extract_vendor_name
- extract_receipt_number
- extract_category
- extract_vat_breakdown_table
- extract_amounts
- process_ocr_text
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import date
from ocr.extractor import (
    parse_turkish_amount,
    extract_all_amounts,
    extract_amount_near_keyword,
    extract_vat_rate_from_text,
    extract_date,
    extract_vendor_name,
    extract_receipt_number,
    extract_category,
    extract_vat_breakdown_table,
    extract_amounts,
    process_ocr_text,
    _fix_ocr_digit,
    _parse_date_match,
    VALID_VAT_RATES,
)


# ============================================================================
# parse_turkish_amount
# ============================================================================
class TestParseTurkishAmount:
    """Türkçe formatındaki tutarı float'a çevirme testleri."""

    def test_virgullu_ondalik(self):
        """341,50 → 341.50"""
        assert parse_turkish_amount("341,50") == 341.50

    def test_noktali_binlik(self):
        """1.250,00 → 1250.00"""
        assert parse_turkish_amount("1.250,00") == 1250.00

    def test_dolar_nokta_ondalik(self):
        """341.00 → 341.00"""
        assert parse_turkish_amount("341.00") == 341.00

    def test_yildiz_baslangic(self):
        """*341.00 → 341.00"""
        assert parse_turkish_amount("*341.00") == 341.00

    def test_tl_son(self):
        """1.250,00₺ → 1250.00"""
        assert parse_turkish_amount("1.250,00₺") == 1250.00

    def test_tl_yazili(self):
        """1250TL → 1250.00"""
        assert parse_turkish_amount("1250TL") == 1250.0

    def test_bos_string(self):
        assert parse_turkish_amount("") is None

    def test_none(self):
        assert parse_turkish_amount(None) is None

    def test_sadece_yildiz(self):
        """* → None"""
        assert parse_turkish_amount("*") is None

    def test_buyuk_sayi(self):
        """1.234.567,89 → 1234567.89"""
        assert parse_turkish_amount("1.234.567,89") == 1234567.89

    def test_kucuk_sayi(self):
        assert parse_turkish_amount("0,50") == 0.50

    def test_sifir(self):
        """0 veya 0,00 → None (pozitif olmalı)"""
        assert parse_turkish_amount("0") is None
        assert parse_turkish_amount("0,00") is None

    def test_tl_son_yildizli(self):
        """*1.250,50₺ → 1250.50"""
        assert parse_turkish_amount("*1.250,50₺") == 1250.50


# ============================================================================
# extract_all_amounts
# ============================================================================
class TestExtractAllAmounts:
    """Metindeki tüm tutarları çıkarma testleri."""

    def test_basit_text(self):
        text = "Ürün 1: 100,00\nÜrün 2: 200,00\nToplam: 300,00"
        amounts = extract_all_amounts(text)
        assert len(amounts) >= 2
        assert 300.0 in amounts or 300.00 in amounts

    def test_buyukten_kucuge_sirali(self):
        text = "50,00\n200,00\n100,00"
        amounts = extract_all_amounts(text)
        # Sıralı olmalı (büyükten küçüğe)
        for i in range(len(amounts) - 1):
            assert amounts[i] >= amounts[i + 1]

    def test_tekrar_eden_deger_kaldirilmis(self):
        text = "100,00\n100,00\n100,00"
        amounts = extract_all_amounts(text)
        # Tekrar edenler kaldırılmış olmalı
        assert amounts.count(100.0) <= 1


# ============================================================================
# extract_amount_near_keyword
# ============================================================================
class TestExtractAmountNearKeyword:
    """Anahtar kelime yakınında tutar bulma testleri."""

    def test_toplam_keyword(self):
        text = "Ürün 50,00\nToplam: 150,00 TL"
        result = extract_amount_near_keyword(text, "toplam")
        assert result is not None
        assert result == 150.00

    def test_keyword_yok(self):
        text = "Merhaba dünya"
        result = extract_amount_near_keyword(text, "toplam")
        assert result is None

    def test_matrah_keyword(self):
        text = "Matrah: 800,00\nKDV: 160,00"
        result = extract_amount_near_keyword(text, "matrah")
        assert result == 800.00


# ============================================================================
# extract_vat_rate_from_text
# ============================================================================
class TestExtractVatRateFromText:
    """KDV oranı çıkarma testleri."""

    def test_yuzde_20(self):
        text = "KDV %20: 200,00"
        result = extract_vat_rate_from_text(text)
        assert result == 20.0

    def test_yuzde_10(self):
        text = "%10 KDV: 100,00"
        result = extract_vat_rate_from_text(text)
        assert result == 10.0

    def test_yuzde_1(self):
        text = "%1 KDV: 5,00"
        result = extract_vat_rate_from_text(text)
        assert result == 1.0

    def test_yuzde_0(self):
        text = "KDV %0: 0,00"
        result = extract_vat_rate_from_text(text)
        assert result == 0.0

    def test_topkdv_hesaplama(self):
        """TOPKDV ve TOPLAM ile KDV oranı hesaplama"""
        text = "TOPKDV *200\nTOPLAM *1200"
        result = extract_vat_rate_from_text(text)
        # net = 1200 - 200 = 1000, rate = 200/1000 * 100 = 20
        assert result == 20.0

    def test_kdv_orani_yok(self):
        text = "Bu metinde KDV oranı yok"
        result = extract_vat_rate_from_text(text)
        assert result is None

    def test_gecersiz_oran(self):
        """Geçersiz KDV oranı (35%) bulunmamalı"""
        text = "%35 KDV: 350,00"
        result = extract_vat_rate_from_text(text)
        assert result is None


# ============================================================================
# extract_date
# ============================================================================
class TestExtractDate:
    """Tarih çıkarma testleri."""

    def test_gun_ay_yil(self):
        text = "Tarih: 25/08/2026"
        result = extract_date(text)
        assert result == date(2026, 8, 25)

    def test_gun_ay_kisaltma(self):
        text = "25.08.26"
        result = extract_date(text)
        assert result == date(2026, 8, 25)

    def test_yil_ay_gun(self):
        text = "2026-08-25"
        result = extract_date(text)
        assert result == date(2026, 8, 25)

    def test_tarih_yok(self):
        text = "Bu metinde tarih yok"
        result = extract_date(text)
        assert result is None

    def test_tarih_coklu(self):
        """Birden fazla tarih varsa ilk geçerli olanı döndürmeli"""
        text = "Tarih: 25/08/2026\nFatura: 01/01/2026"
        result = extract_date(text)
        assert result is not None


# ============================================================================
# _fix_ocr_digit
# ============================================================================
class TestFixOcrDigit:
    """OCR hatalı rakam düzeltme testleri."""

    def test_normal_rakam(self):
        assert _fix_ocr_digit("5") == 5

    def test_ay_icin_68(self):
        """68 → 08 (ay hatası)"""
        assert _fix_ocr_digit("68", "month") == 8

    def test_ay_icin_60(self):
        assert _fix_ocr_digit("60", "month") == 6

    def test_ay_icin_80(self):
        assert _fix_ocr_digit("80", "month") == 8

    def test_ay_icin_61(self):
        assert _fix_ocr_digit("61", "month") == 1

    def test_ay_icin_normal(self):
        """Normal ay değerleri değişmemeli"""
        assert _fix_ocr_digit("8", "month") == 8
        assert _fix_ocr_digit("12", "month") == 12

    def test_pozisyon_yok(self):
        """Pozisyon belirtilmezse aynen dönmeli"""
        assert _fix_ocr_digit("68") == 68


# ============================================================================
# extract_vendor_name
# ============================================================================
class TestExtractVendorName:
    """İş yeri adı çıkarma testleri."""

    def test_basit(self):
        text = "BİM MAĞAZILARI\nTarih: 25/08/2026\nToplam: 100,00"
        result = extract_vendor_name(text)
        assert "BİM" in result or "bim" in result.lower()

    def test_bos_text(self):
        text = ""
        result = extract_vendor_name(text)
        assert result == ""

    def test_sadece_sayilar(self):
        """Sayı ağırlıklı satırlar atlanmalı"""
        text = "12345\n67890\nToplam: 100"
        result = extract_vendor_name(text)
        assert result == "" or result != "12345"

    def test_toblama_satirini_atla(self):
        """Toplam satırı iş yeri adı olmamalı"""
        text = "Toplam: 100,00\nBİM MAĞAZILARI"
        result = extract_vendor_name(text)
        assert "Toplam" not in result


# ============================================================================
# extract_receipt_number
# ============================================================================
class TestExtractReceiptNumber:
    """Fiş numarası çıkarma testleri."""

    def test_fis_no(self):
        text = "FİŞ NO: 12345"
        result = extract_receipt_number(text)
        assert result == "12345"

    def test_fatura_no(self):
        text = "FATURA NO: 67890"
        result = extract_receipt_number(text)
        assert result == "67890"

    def test_no_dogrudan(self):
        text = "NO: 11111"
        result = extract_receipt_number(text)
        assert result == "11111"

    def test_numara_yok(self):
        text = "Bu fişte numara yok"
        result = extract_receipt_number(text)
        assert result == ""


# ============================================================================
# extract_category
# ============================================================================
class TestExtractCategory:
    """Kategori önerisi testleri."""

    def test_market_is_yeri(self):
        result = extract_category("Herhangi bir metin", vendor_name="BİM MAĞAZILARI")
        assert result == "market"

    def test_market_urunleri(self):
        """Ürün listesinden market tespiti"""
        text = "Süt, ekmek, peynir, yoğurt, tereyağı, yumurta"
        result = extract_category(text)
        assert result == "market"

    def test_akaryakıt(self):
        text = "Benzin 50L Motorin 30L"
        result = extract_category(text)
        assert result == "akaryakıt"

    def test_yemek(self):
        text = "Restoran yemek kahvaltı"
        result = extract_category(text)
        assert result == "yemek"

    def test_ulasim(self):
        text = "Taksi ile 25 km yol"
        result = extract_category(text)
        assert result == "ulaşım"

    def test_kategori_yok(self):
        """Tanınmayan metin → None"""
        text = "Bu tamamen bilinmeyen bir metin"
        result = extract_category(text)
        assert result is None


# ============================================================================
# extract_vat_breakdown_table
# ============================================================================
class TestExtractVatBreakdownTable:
    """KDV döküm tablosu çıkarma testleri."""

    def test_standart_tablo(self):
        text = """KDV Oranı    KDV        Toplam
%10          155,45     1.710,00
%20          0,17       1,00"""
        result = extract_vat_breakdown_table(text)
        assert result is not None
        assert len(result) == 2
        assert result[0]["vat_rate"] == 10
        assert result[1]["vat_rate"] == 20

    def test_tek_satir_yok(self):
        """Tek satırlık tablo None döndürmeli"""
        text = """KDV Oranı    KDV        Toplam
%20          100,00     500,00"""
        result = extract_vat_breakdown_table(text)
        assert result is None  # En az 2 satır gerekli

    def test_tablo_yok(self):
        text = "Bu metinde tablo yok"
        result = extract_vat_breakdown_table(text)
        assert result is None


# ============================================================================
# extract_amounts
# ============================================================================
class TestExtractAmounts:
    """Tutar çıkarma testleri."""

    def test_toplam_topkdv(self):
        """TOPKDV ve TOPLAM ile tam tutar çıkarma"""
        text = "TOPKDV *200\nTOPLAM *1200\n%20 KDV"
        total, net, vat_rate, vat_amount = extract_amounts(text)
        assert total == 1200.0
        assert vat_amount == 200.0
        assert net == 1000.0
        assert vat_rate == 20.0

    def test_basit_toplam(self):
        text = "Ürün: 100,00\nToplam: 150,00 TL"
        total, net, vat_rate, vat_amount = extract_amounts(text)
        assert total == 150.0

    def test_bos_text(self):
        total, net, vat_rate, vat_amount = extract_amounts("")
        assert total is None
        assert net is None


# ============================================================================
# process_ocr_text
# ============================================================================
class TestProcessOcrText:
    """Tam OCR metni işleme testleri."""

    def test_bos_metin(self):
        result = process_ocr_text("")
        assert result.raw_text == ""
        assert result.suggestion is not None

    def test_bos_metin_bosluklu(self):
        result = process_ocr_text("   \n  \n  ")
        assert result.suggestion is not None

    def test_guven_skoru_hesaplama(self):
        """Güven skoru hesaplama mantığı"""
        text = """BİM MAĞAZILARI
Tarih: 25/08/2026
FİŞ NO: 12345
TOPKDV *200
TOPLAM *1200
%20 KDV"""
        result = process_ocr_text(text)
        # Toplam + KDV oranı + tarih + iş yeri + fiş no → yüksek skor
        assert result.confidence >= 70
        assert result.total_amount == 1200.0
        assert result.vat_rate == 20.0

    def test_kategori_onerisi(self):
        """Market fişinde kategori önerisi"""
        text = """BİM MAĞAZILARI
Süt, ekmek, peynir
Toplam: 100,00 TL
%20 KDV"""
        result = process_ocr_text(text)
        assert result.category == "market"
