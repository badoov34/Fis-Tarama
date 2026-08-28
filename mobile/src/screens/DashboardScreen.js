/**
 * Dashboard Ekranı — Aylık gider özeti, grafikler ve karşılaştırma.
 *
 * Özellikler:
 * - Aylık toplam gider özeti
 * - Kategori bazlı yatay bar grafiği (react-native-svg)
 * - 10 günlük dönem karşılaştırması
 * - KDV oranı dağılımı
 * - Bir önceki aya göre değişim
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText, G, Line } from "react-native-svg";
import http, { fmtTL } from "../lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 80;
const BAR_HEIGHT = 28;
const BAR_GAP = 8;

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const CATEGORIES = {
  market: { icon: "🛒", color: "#0284C7" },
  akaryakıt: { icon: "⛽", color: "#DC2626" },
  yemek: { icon: "🍽️", color: "#F59E0B" },
  ulaşım: { icon: "🚗", color: "#7C3AED" },
  kira: { icon: "🏠", color: "#059669" },
  personel: { icon: "👥", color: "#EC4899" },
  malzeme: { icon: "📦", color: "#6366F1" },
  faturalar: { icon: "📄", color: "#14B8A6" },
  telefon: { icon: "📱", color: "#8B5CF6" },
  internet: { icon: "🌐", color: "#0EA5E9" },
  bakım: { icon: "🔧", color: "#F97316" },
  temizlik: { icon: "🧹", color: "#10B981" },
  reklam: { icon: "📢", color: "#EF4444" },
  sigorta: { icon: "🛡️", color: "#64748B" },
  vergi: { icon: "💰", color: "#A855F7" },
  diğer: { icon: "📋", color: "#94A3B8" },
};

const COLORS = ["#0284C7", "#DC2626", "#F59E0B", "#7C3AED", "#059669", "#EC4899", "#6366F1", "#14B8A6"];

export default function DashboardScreen({ navigation }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mevcut ay verisi
      const [reportRes, expensesRes] = await Promise.all([
        http.get("/api/reports/monthly", { params: { year: selectedYear, month: selectedMonth } }),
        http.get("/api/expenses", { params: { year: selectedYear, month: selectedMonth } }),
      ]);

      const report = reportRes.data;
      const expenses = expensesRes.data;

      // Kategori dağılımı hesapla
      const categoryMap = {};
      expenses.forEach((exp) => {
        const cat = exp.category || "diğer";
        if (!categoryMap[cat]) categoryMap[cat] = 0;
        categoryMap[cat] += exp.total_amount || 0;
      });

      // KDV oranı dağılımı
      const vatMap = {};
      expenses.forEach((exp) => {
        const vatItems = exp.vat_items || (exp.vat_rate != null ? [{ vat_rate: exp.vat_rate, total_amount: exp.total_amount }] : []);
        vatItems.forEach((item) => {
          const rate = item.vat_rate || 0;
          if (!vatMap[rate]) vatMap[rate] = 0;
          vatMap[rate] += item.total_amount || 0;
        });
      });

      setData({
        report,
        expenses,
        categoryBreakdown: Object.entries(categoryMap)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount),
        vatBreakdown: Object.entries(vatMap)
          .map(([rate, amount]) => ({ rate: Number(rate), amount }))
          .sort((a, b) => b.amount - a.amount),
      });

      // Bir önceki ay verisi (karşılaştırma için)
      try {
        let prevYear = selectedYear;
        let prevMonth = selectedMonth - 1;
        if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
        const prevRes = await http.get("/api/reports/monthly", { params: { year: prevYear, month: prevMonth } });
        setPrevData(prevRes.data);
      } catch {
        setPrevData(null);
      }
    } catch (e) {
      console.log("Dashboard yüklenemedi:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", loadData);
    return unsubscribe;
  }, [navigation, selectedYear, selectedMonth]);

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
  };

  // Değişim oranını hesapla
  const calcChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const grandTotal = data?.report?.grand_totals?.total || 0;
  const grandNet = data?.report?.grand_totals?.net || 0;
  const grandVat = data?.report?.grand_totals?.vat || 0;
  const expenseCount = data?.report?.grand_totals?.count || 0;
  const prevTotal = prevData?.grand_totals?.total || 0;
  const changePercent = calcChange(grandTotal, prevTotal);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>📊 Dashboard</Text>

        {/* Ay Seçici */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={prevMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[selectedMonth - 1]} {selectedYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════════════
            1. ÖZET KARTLARI
            ═══════════════════════════════════════════════════════════════ */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { backgroundColor: "#0284C7" }]}>
            <Text style={styles.summaryCardLabel}>Toplam Gider</Text>
            <Text style={styles.summaryCardValue}>{fmtTL(grandTotal)}</Text>
            {changePercent !== null && (
              <Text style={[styles.changeBadge, {
                color: Number(changePercent) > 0 ? "#FCA5A5" : "#6EE7B7",
              }]}>
                {Number(changePercent) > 0 ? "↑" : "↓"} %{Math.abs(changePercent)}
              </Text>
            )}
          </View>

          <View style={[styles.summaryCard, { backgroundColor: "#059669" }]}>
            <Text style={styles.summaryCardLabel}>Toplam Matrah</Text>
            <Text style={styles.summaryCardValue}>{fmtTL(grandNet)}</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: "#7C3AED" }]}>
            <Text style={styles.summaryCardLabel}>Toplam KDV</Text>
            <Text style={styles.summaryCardValue}>{fmtTL(grandVat)}</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: "#64748B" }]}>
            <Text style={styles.summaryCardLabel}>Kayıt Sayısı</Text>
            <Text style={styles.summaryCardValue}>{expenseCount}</Text>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════
            2. KATEGORİ DAĞILIMI — Yatay Bar Grafiği
            ═══════════════════════════════════════════════════════════════ */}
        {data?.categoryBreakdown?.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>📁 Kategori Dağılımı</Text>
            {data.categoryBreakdown.map((cat, idx) => {
              const catInfo = CATEGORIES[cat.name] || CATEGORIES.diğer;
              const maxAmount = data.categoryBreakdown[0].amount;
              const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * (CHART_WIDTH - 100) : 0;
              const percentage = grandTotal > 0 ? ((cat.amount / grandTotal) * 100).toFixed(1) : 0;

              return (
                <View key={cat.name} style={styles.barRow}>
                  <View style={styles.barLabel}>
                    <Text style={styles.barIcon}>{catInfo.icon}</Text>
                    <Text style={styles.barLabelText} numberOfLines={1}>{cat.name}</Text>
                  </View>
                  <View style={styles.barContainer}>
                    <View style={[styles.bar, {
                      width: Math.max(barWidth, 4),
                      backgroundColor: catInfo.color,
                    }]} />
                  </View>
                  <View style={styles.barValueContainer}>
                    <Text style={styles.barValue}>{fmtTL(cat.amount)}</Text>
                    <Text style={styles.barPercent}>%{percentage}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            3. DÖNEM KARŞILAŞTIRMASI
            ═══════════════════════════════════════════════════════════════ */}
        {data?.report?.periods && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>📅 Dönem Karşılaştırması</Text>
            {data.report.periods.map((p, idx) => {
              const maxPeriodTotal = Math.max(...data.report.periods.map((pp) => pp.totals.total));
              const barW = maxPeriodTotal > 0 ? (p.totals.total / maxPeriodTotal) * (CHART_WIDTH - 120) : 0;
              const pLabel = p.period.label.split(" ").slice(0, 2).join(" ");

              return (
                <View key={idx} style={styles.periodBarRow}>
                  <Text style={styles.periodBarLabel} numberOfLines={1}>{pLabel}</Text>
                  <View style={styles.periodBarContainer}>
                    <View style={[styles.periodBar, {
                      width: Math.max(barW, 4),
                      backgroundColor: COLORS[idx % COLORS.length],
                    }]} />
                  </View>
                  <View style={styles.periodBarInfo}>
                    <Text style={styles.periodBarAmount}>{fmtTL(p.totals.total)}</Text>
                    <Text style={styles.periodBarCount}>{p.totals.count} kayıt</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            4. KDV ORANI DAĞILIMI
            ═══════════════════════════════════════════════════════════════ */}
        {data?.vatBreakdown?.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>💰 KDV Oranı Dağılımı</Text>
            {data.vatBreakdown.map((vat, idx) => {
              const maxVatAmount = data.vatBreakdown[0].amount;
              const barW = maxVatAmount > 0 ? (vat.amount / maxVatAmount) * (CHART_WIDTH - 120) : 0;

              return (
                <View key={vat.rate} style={styles.vatBarRow}>
                  <View style={styles.vatRateBadge}>
                    <Text style={styles.vatRateText}>%{vat.rate}</Text>
                  </View>
                  <View style={styles.vatBarContainer}>
                    <View style={[styles.vatBar, {
                      width: Math.max(barW, 4),
                      backgroundColor: COLORS[idx % COLORS.length],
                    }]} />
                  </View>
                  <Text style={styles.vatBarAmount}>{fmtTL(vat.amount)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Boş durum */}
        {data?.expenses?.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Bu ay henüz gider yok</Text>
            <Text style={styles.emptySubtext}>İlk fişinizi çekerek başlayın</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 16 },
  title: { fontSize: 26, fontWeight: "bold", color: "#0F172A", marginBottom: 12 },

  // Ay seçici
  monthSelector: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 20, marginBottom: 16,
  },
  arrowBtn: { padding: 8 },
  arrowText: { fontSize: 20, color: "#0284C7", fontWeight: "bold" },
  monthLabel: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },

  // Özet kartları
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, minWidth: "45%", borderRadius: 14, padding: 16,
  },
  summaryCardLabel: { color: "#E0F2FE", fontSize: 11, fontWeight: "500" },
  summaryCardValue: { color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 4 },
  changeBadge: { fontSize: 12, fontWeight: "600", marginTop: 4 },

  // Grafik kartları
  chartCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },

  // Kategori barları
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  barLabel: { width: 80, flexDirection: "row", alignItems: "center", gap: 4 },
  barIcon: { fontSize: 14 },
  barLabelText: { fontSize: 12, color: "#334155", flex: 1 },
  barContainer: { flex: 1, height: BAR_HEIGHT, backgroundColor: "#F1F5F9", borderRadius: 6, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 6 },
  barValueContainer: { width: 100, alignItems: "flex-end", marginLeft: 8 },
  barValue: { fontSize: 12, fontWeight: "600", color: "#0F172A" },
  barPercent: { fontSize: 10, color: "#64748B" },

  // Dönem barları
  periodBarRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  periodBarLabel: { width: 65, fontSize: 12, color: "#334155", fontWeight: "500" },
  periodBarContainer: { flex: 1, height: 32, backgroundColor: "#F1F5F9", borderRadius: 8, overflow: "hidden" },
  periodBar: { height: "100%", borderRadius: 8 },
  periodBarInfo: { width: 95, alignItems: "flex-end", marginLeft: 8 },
  periodBarAmount: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  periodBarCount: { fontSize: 10, color: "#64748B" },

  // KDV barları
  vatBarRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  vatRateBadge: {
    backgroundColor: "#0F172A", borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8,
  },
  vatRateText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  vatBarContainer: { flex: 1, height: 24, backgroundColor: "#F1F5F9", borderRadius: 6, overflow: "hidden", marginHorizontal: 8 },
  vatBar: { height: "100%", borderRadius: 6 },
  vatBarAmount: { fontSize: 12, fontWeight: "600", color: "#0F172A", width: 80, textAlign: "right" },

  // Boş durum
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 40, alignItems: "center",
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#334155" },
  emptySubtext: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
});
