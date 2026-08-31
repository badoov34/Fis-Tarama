"""Yardımcı fonksiyonlar — dönem hesaplama, KDV işlemleri, tarih formatları."""
import calendar
from datetime import date, datetime
from typing import List, Tuple, Dict

# Türkiye KDV oranları
VALID_VAT_RATES = [0, 1, 10, 20]

# Ay isimleri Türkçe
MONTH_NAMES_TR = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
    5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
    9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık",
}


def get_month_last_day(year: int, month: int) -> int:
    """Bir ayın son gününü döndürür."""
    return calendar.monthrange(year, month)[1]


def get_10day_periods(year: int, month: int) -> List[Dict]:
    """10 günlük dönem aralıklarını hesapla.

    Döndürdüğü format:
    [
        {
            "start": date(2026, 8, 1),
            "end": date(2026, 8, 10),
            "label": "1-10 Ağustos 2026",
        },
        {
            "start": date(2026, 8, 11),
            "end": date(2026, 8, 20),
            "label": "11-20 Ağustos 2026",
        },
        {
            "start": date(2026, 8, 21),
            "end": date(2026, 8, 31),
            "label": "21-31 Ağustos 2026",
        },
    ]
    """
    month_name = MONTH_NAMES_TR[month]
    last_day = get_month_last_day(year, month)

    periods = [
        {
            "start": date(year, month, 1),
            "end": date(year, month, 10),
            "label": f"1-10 {month_name} {year}",
        },
        {
            "start": date(year, month, 11),
            "end": date(year, month, 20),
            "label": f"11-20 {month_name} {year}",
        },
        {
            "start": date(year, month, 21),
            "end": date(year, month, last_day),
            "label": f"21-{last_day} {month_name} {year}",
        },
    ]
    return periods


def assign_period(total_amount: float, net_amount: float, vat_rate: float,
                   vat_amount: float, receipt_date: date) -> Dict:
    """Bir giderin hangi 10 günlük döneme ait olduğunu belirle."""
    if receipt_date is None:
        receipt_date = date.today()

    year = receipt_date.year
    month = receipt_date.month
    day = receipt_date.day

    if day <= 10:
        period_start = date(year, month, 1)
        period_end = date(year, month, 10)
    elif day <= 20:
        period_start = date(year, month, 11)
        period_end = date(year, month, 20)
    else:
        period_start = date(year, month, 21)
        last_day = get_month_last_day(year, month)
        period_end = date(year, month, last_day)

    return {
        "period_start": period_start,
        "period_end": period_end,
    }


def recalculate_vat(total_amount: float, vat_rate: float,
                    net_amount: float = None) -> Dict:
    """KDV bilgilerini yeniden hesapla.

    Kullanıcı tutar veya KDV oranını değiştirdiğinde çağrılır.

    Args:
        total_amount: KDV dahil toplam tutar
        vat_rate: KDV oranı (%0, %1, %10, %20)
        net_amount: Varsa matrah (hesaplanmaz, doğrudan kullanılır)

    Returns:
        Dict with net_amount, vat_amount
    """
    if vat_rate is None:
        vat_rate = 0

    if net_amount is not None and net_amount > 0:
        # Matrah verilmiş → KDV hesapla
        vat_amount = round(total_amount - net_amount, 2)
    else:
        # Matrah hesapla
        if vat_rate > 0:
            net_amount = round(total_amount / (1 + vat_rate / 100), 2)
            vat_amount = round(total_amount - net_amount, 2)
        else:
            net_amount = total_amount
            vat_amount = 0.0

    return {
        "net_amount": net_amount,
        "vat_amount": vat_amount,
    }


def format_turkish_lira(amount: float) -> str:
    """Tutarı Türk Lirası formatına çevir.

    1250.50 → "1.250,50₺"
    """
    if amount is None:
        return "0,00₺"

    # Ondalık kısım
    integer_part = int(abs(amount))
    decimal_part = round((abs(amount) - integer_part) * 100)

    # Binlik ayracı ekle (nokta)
    int_str = f"{integer_part:,}".replace(",", ".")

    # İşaret
    sign = "-" if amount < 0 else ""

    return f"{sign}{int_str},{decimal_part:02d}₺"


def get_default_categories() -> List[Dict]:
    """Varsayılan gider kategorilerini döndür (ikonlu)."""
    return [
        {"name": "market", "icon": "🛒"},
        {"name": "akaryakıt", "icon": "⛽"},
        {"name": "yemek", "icon": "🍽️"},
        {"name": "ulaşım", "icon": "🚗"},
        {"name": "kira", "icon": "🏢"},
        {"name": "personel", "icon": "👥"},
        {"name": "malzeme", "icon": "📦"},
        {"name": "faturalar", "icon": "💡"},
        {"name": "telefon", "icon": "📱"},
        {"name": "internet", "icon": "🌐"},
        {"name": "bakım", "icon": "🔧"},
        {"name": "temizlik", "icon": "🧹"},
        {"name": "reklam", "icon": "📢"},
        {"name": "sigorta", "icon": "🛡️"},
        {"name": "vergi", "icon": "🏛️"},
        {"name": "diğer", "icon": "📁"},
    ]
