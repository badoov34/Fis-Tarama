"""helpers.py fonksiyonları için unit testler.

Test edilen fonksiyonlar:
- get_month_last_day
- get_10day_periods
- assign_period
- recalculate_vat
- format_turkish_lira
- get_default_categories
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import date
from utils.helpers import (
    get_month_last_day,
    get_10day_periods,
    assign_period,
    recalculate_vat,
    format_turkish_lira,
    get_default_categories,
    MONTH_NAMES_TR,
    VALID_VAT_RATES,
)


# ============================================================================
# get_month_last_day
# ============================================================================
class TestGetMonthLastDay:
    """Bir ayın son gününü test et."""

    def test_ocak(self):
        assert get_month_last_day(2026, 1) == 31

    def test_subat_artik_yil(self):
        """Artık yıl (2026 değil) — normal yıl"""
        assert get_month_last_day(2025, 2) == 28

    def test_subat_artik_yil_olmayan(self):
        """2026 artık yıl değil"""
        assert get_month_last_day(2026, 2) == 28

    def test_nisan(self):
        assert get_month_last_day(2026, 4) == 30

    def test_aralik(self):
        assert get_month_last_day(2026, 12) == 31

    def test_mart(self):
        assert get_month_last_day(2026, 3) == 31

    def test_haziran(self):
        assert get_month_last_day(2026, 6) == 30


# ============================================================================
# get_10day_periods
# ============================================================================
class TestGet10DayPeriods:
    """10 günlük dönem hesaplamalarını test et."""

    def test_agustos_2026(self):
        periods = get_10day_periods(2026, 8)
        assert len(periods) == 3

        # 1. dönem
        assert periods[0]["start"] == date(2026, 8, 1)
        assert periods[0]["end"] == date(2026, 8, 10)
        assert periods[0]["label"] == "1-10 Ağustos 2026"

        # 2. dönem
        assert periods[1]["start"] == date(2026, 8, 11)
        assert periods[1]["end"] == date(2026, 8, 20)
        assert periods[1]["label"] == "11-20 Ağustos 2026"

        # 3. dönem
        assert periods[2]["start"] == date(2026, 8, 21)
        assert periods[2]["end"] == date(2026, 8, 31)
        assert periods[2]["label"] == "21-31 Ağustos 2026"

    def test_subat_2026(self):
        """Şubat — 28 günlük ay"""
        periods = get_10day_periods(2026, 2)
        assert len(periods) == 3
        assert periods[2]["end"] == date(2026, 2, 28)
        assert periods[2]["label"] == "1-10 Şubat 2026" or "21-28" in periods[2]["label"]

    def test_ocak_2026(self):
        """Ocak — 31 günlük ay"""
        periods = get_10day_periods(2026, 1)
        assert periods[2]["end"] == date(2026, 1, 31)
        assert "31" in periods[2]["label"]

    def test_nisan_2026(self):
        """Nisan — 30 günlük ay"""
        periods = get_10day_periods(2026, 4)
        assert periods[2]["end"] == date(2026, 4, 30)
        assert "30" in periods[2]["label"]

    def test_label_format(self):
        """Tüm dönem etiketleri doğru formatta mı?"""
        periods = get_10day_periods(2026, 8)
        for p in periods:
            assert p["start"] <= p["end"]
            assert isinstance(p["label"], str)
            assert len(p["label"]) > 0

    def test_donem_suresi(self):
        """Her dönemin süresi doğru mu?"""
        periods = get_10day_periods(2026, 8)
        assert (periods[0]["end"] - periods[0]["start"]).days == 9  # 1-10 arası 10 gün
        assert (periods[1]["end"] - periods[1]["start"]).days == 9  # 11-20 arası 10 gün
        assert (periods[2]["end"] - periods[2]["start"]).days == 10  # 21-31 arası 11 gün


# ============================================================================
# assign_period
# ============================================================================
class TestAssignPeriod:
    """Giderin hangi döneme ait olduğunu test et."""

    def test_ilk_10_gun(self):
        result = assign_period(100, 80, 20, 20, date(2026, 8, 5))
        assert result["period_start"] == date(2026, 8, 1)
        assert result["period_end"] == date(2026, 8, 10)

    def test_ikinci_10_gun(self):
        result = assign_period(100, 80, 20, 20, date(2026, 8, 15))
        assert result["period_start"] == date(2026, 8, 11)
        assert result["period_end"] == date(2026, 8, 20)

    def test_ucuncu_donem(self):
        result = assign_period(100, 80, 20, 20, date(2026, 8, 25))
        assert result["period_start"] == date(2026, 8, 21)
        assert result["period_end"] == date(2026, 8, 31)

    def test_ay_baslangici(self):
        """Gün 1 ise"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 1))
        assert result["period_start"] == date(2026, 8, 1)
        assert result["period_end"] == date(2026, 8, 10)

    def test_ay_sonu(self):
        """Gün ay sonu"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 31))
        assert result["period_start"] == date(2026, 8, 21)
        assert result["period_end"] == date(2026, 8, 31)

    def test_sinir_gun_10(self):
        """Gün 10 — 1. dönemin son günü"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 10))
        assert result["period_start"] == date(2026, 8, 1)
        assert result["period_end"] == date(2026, 8, 10)

    def test_sinir_gun_11(self):
        """Gün 11 — 2. dönemin başlangıcı"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 11))
        assert result["period_start"] == date(2026, 8, 11)
        assert result["period_end"] == date(2026, 8, 20)

    def test_sinir_gun_20(self):
        """Gün 20 — 2. dönemin son günü"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 20))
        assert result["period_start"] == date(2026, 8, 11)
        assert result["period_end"] == date(2026, 8, 20)

    def test_sinir_gun_21(self):
        """Gün 21 — 3. dönemin başlangıcı"""
        result = assign_period(100, 80, 20, 20, date(2026, 8, 21))
        assert result["period_start"] == date(2026, 8, 21)
        assert result["period_end"] == date(2026, 8, 31)

    def test_subat_donemleri(self):
        """Şubat — 28 gün"""
        result = assign_period(100, 80, 20, 20, date(2026, 2, 15))
        assert result["period_start"] == date(2026, 2, 11)
        assert result["period_end"] == date(2026, 2, 20)

        result = assign_period(100, 80, 20, 20, date(2026, 2, 25))
        assert result["period_start"] == date(2026, 2, 21)
        assert result["period_end"] == date(2026, 2, 28)


# ============================================================================
# recalculate_vat
# ============================================================================
class TestRecalculateVat:
    """KDV hesaplama fonksiyonunu test et."""

    def test_kdv_20_yuzde(self):
        """%20 KDV — 1200 TL → 1000 TL matrah + 200 TL KDV"""
        result = recalculate_vat(1200.0, 20)
        assert result["net_amount"] == 1000.00
        assert result["vat_amount"] == 200.00

    def test_kdv_10_yuzde(self):
        """%10 KDV — 1100 TL → 1000 TL matrah + 100 TL KDV"""
        result = recalculate_vat(1100.0, 10)
        assert result["net_amount"] == 1000.00
        assert result["vat_amount"] == 100.00

    def test_kdv_1_yuzde(self):
        """%1 KDV — 101 TL → 100 TL matrah + 1 TL KDV"""
        result = recalculate_vat(101.0, 1)
        assert result["net_amount"] == 100.00
        assert result["vat_amount"] == 1.00

    def test_kdv_0_yuzde(self):
        """%0 KDV — 500 TL → 500 TL matrah + 0 TL KDV"""
        result = recalculate_vat(500.0, 0)
        assert result["net_amount"] == 500.0
        assert result["vat_amount"] == 0.0

    def test_kdv_none(self):
        """KDV oranı None → %0 olarak davranmalı"""
        result = recalculate_vat(500.0, None)
        assert result["net_amount"] == 500.0
        assert result["vat_amount"] == 0.0

    def test_matrah_verilmis(self):
        """Matrah verilmişse → KDV = toplam - matrah"""
        result = recalculate_vat(1200.0, 20, net_amount=950.0)
        assert result["net_amount"] == 950.0
        assert result["vat_amount"] == 250.0

    def test_kucuk_tutar(self):
        """Küçük tutarlar — ondalık hassasiyet"""
        result = recalculate_vat(11.0, 10)
        assert result["net_amount"] == 10.00
        assert result["vat_amount"] == 1.00

    def test_buyuk_tutar(self):
        """Büyük tutarlar"""
        result = recalculate_vat(120000.0, 20)
        assert result["net_amount"] == 100000.00
        assert result["vat_amount"] == 20000.00


# ============================================================================
# format_turkish_lira
# ============================================================================
class TestFormatTurkishLira:
    """TL formatını test et."""

    def test_basit(self):
        assert format_turkish_lira(1250.50) == "1.250,50₺"

    def test_sifir(self):
        assert format_turkish_lira(0) == "0,00₺"

    def test_negatif(self):
        assert format_turkish_lira(-500.00) == "-500,00₺"

    def test_none(self):
        assert format_turkish_lira(None) == "0,00₺"

    def test_buyuk_sayi(self):
        assert format_turkish_lira(1234567.89) == "1.234.567,89₺"

    def test_kucuk_ondalik(self):
        assert format_turkish_lira(99.99) == "99,99₺"

    def test_tam_sayi(self):
        assert format_turkish_lira(500) == "500,00₺"

    def test_bir(self):
        assert format_turkish_lira(1.50) == "1,50₺"


# ============================================================================
# get_default_categories
# ============================================================================
class TestGetDefaultCategories:
    """Varsayılan kategorileri test et."""

    def test_kategori_sayisi(self):
        cats = get_default_categories()
        assert len(cats) == 16

    def test_onemli_kategoriler_var(self):
        cats = get_default_categories()
        onemliler = ["market", "akaryakıt", "yemek", "ulaşım"]
        for k in onemliler:
            assert k in cats, f"{k} kategorisi yok"

    def_tekrar_yok = lambda self: len(get_default_categories()) == len(set(get_default_categories()))


# ============================================================================
# Sabit değerler
# ============================================================================
class TestConstants:
    """Sabit değerleri test et."""

    def test_kdv_oranlari(self):
        assert VALID_VAT_RATES == [0, 1, 10, 20]

    def test_ay_isimleri_tam(self):
        """12 ayın tamamı mevcut"""
        assert len(MONTH_NAMES_TR) == 12

    def test_ay_isimleri_turkce(self):
        """Türkçe karakter doğru mu"""
        assert MONTH_NAMES_TR[1] == "Ocak"
        assert MONTH_NAMES_TR[2] == "Şubat"
        assert MONTH_NAMES_TR[8] == "Ağustos"
        assert MONTH_NAMES_TR[12] == "Aralık"
