/**
 * Dashboard — Aylık gider özeti, grafikler, kategori ve dönem karşılaştırması.
 * react-native-svg ile gerçek grafikler.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect, G, Line, Text as SvgText, Circle, Path } from "react-native-svg";
import http, { fmtTL } from "../lib/api";

const COLORS = ["#0284C7", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"];
const SCREEN_W = Dimensions.get("window").width - 40;

const CATEGORIES = {
  market: "🛒 Market", akaryakıt: "⛽ Akaryakıt", yemek: "🍽️ Yemek", ulaşım: "🚗 Ulaşım",
  kira: "🏢 Kira", personel: "👥 Personel", malzeme: "📦 Malzeme", faturalar: "💡 Faturalar",
  telefon: "📱 Telefon", internet: "🌐 İnternet", bakım: "🔧 Bakım", temizlik: "🧹 Temizlik",
  reklam: "📢 Reklam", sigorta: "🛡️ Sigorta", vergi: "🏛️ Vergi", diğer: "📁 Diğer",
};

export default function DashboardScreen() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await http.get("/api/reports/monthly", {
        params: { year: selectedMonth.year, month: selectedMonth.month },
      });
      setReport(r.data);
    } catch (e) {
      console.log("Dashboard yükleme hatası:", e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { load(); }, [load]);

  // Kategori dağılımı hesapla
  const getCategoryData = () => {
    if (!report?.periods) return [];
    const catTotals = {};
    report.periods.forEach(p => {
      p.expenses.forEach(exp => {
        const cat = exp.category || "diğer";
        catTotals[cat] = (catTotals[cat] || 0) + (exp.total_amount || 0);
      });
    });
    return Object.entries(catTotals)
      .map(([key, value]) => ({ key, value, label: CATEGORIES[key] || key }))
      .sort((a, b) => b.value - a.value);
  };

  // KDV oranı dağılımı
  const getVatData = () => {
    if (!report?.periods) return [];
    const vatTotals = {};
    report.periods.forEach(p => {
      p.expenses.forEach(exp => {
        if (exp.vat_items && exp.vat_items.length > 0) {
          exp.vat_items.forEach(item => {
            const rate = item.vat_rate || 0;
            vatTotals[rate] = (vatTotals[rate] || 0) + (item.vat_amount || 0);
          });
        } else {
          const rate = exp.vat_rate || 0;
          vatTotals[rate] = (vatTotals[rate] || 0) + (exp.vat_amount || 0);
        }
      });
    });
    return Object.entries(vatTotals)
      .map(([rate, amount]) => ({ rate: Number(rate), amount }))
      .sort((a, b) => b.amount - a.amount);
  };

  const categoryData = getCategoryData();
  const vatData = getVatData();
  const maxCatAmount = categoryData.length > 0 ? categoryData[0].value : 1;
  const grandTotal = report?.grand_total_amount || 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>📊 Dashboard</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 40 }} />
        ) : !report ? (
          <Text style={styles.emptyText}>Veri yüklenemedi.</Text>
        ) : (
          <>
            {/* Özet Kartlar */}
            <View style={styles.cardRow}>
              <View style={[styles.summaryCard, { backgroundColor: "#EFF6FF" }]}>
                <Text style={[styles.summaryLabel, { color: "#1E40AF" }]}>Toplam Gider</Text>
                <Text style={[styles.summaryAmount, { color: "#1E40AF" }]}>{fmtTL(grandTotal)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: "#ECFDF5" }]}>
                <Text style={[styles.summaryLabel, { color: "#065F46" }]}>Toplam Matrah</Text>
                <Text style={[styles.summaryAmount, { color: "#065F46" }]}>{fmtTL(report.grand_total_net)}</Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <View style={[styles.summaryCard, { backgroundColor: "#F5F3FF" }]}>
                <Text style={[styles.summaryLabel, { color: "#5B21B6" }]}>Toplam KDV</Text>
                <Text style={[styles.summaryAmount, { color: "#5B21B6" }]}>{fmtTL(report.grand_total_vat)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: "#F8FAFC" }]}>
                <Text style={[styles.summaryLabel, { color: "#475569" }]}>Kayıt Sayısı</Text>
                <Text style={[styles.summaryAmount, { color: "#475569" }]}>{report.grand_expense_count}</Text>
              </View>
            </View>

            {/* ═══ KATEGORI DAĞILIMI — YATAY BAR GRAFİĞİ ═══ */}
            {categoryData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📁 Kategori Dağılımı</Text>
                {categoryData.map((item, idx) => {
                  const pct = maxCatAmount > 0 ? (item.value / maxCatAmount) * 100 : 0;
                  const pctTotal = grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : 0;
                  return (
                    <View key={item.key} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
                      <View style={styles.barContainer}>
                        <View style={[styles.bar, {
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: COLORS[idx % COLORS.length],
                        }]} />
                      </View>
                      <Text style={styles.barValue}>{fmtTL(item.value)}</Text>
                      <Text style={styles.barPct}>{pctTotal}%</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ═══ KDV ORANI DAĞILIMI — DONUT GRAFİK ═══ */}
            {vatData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>💰 KDV Oranı Dağılımı</Text>
                <View style={styles.donutContainer}>
                  <Svg width={160} height={160} viewBox="0 0 160 160">
                    {(() => {
                      const total = vatData.reduce((s, d) => s + d.amount, 0) || 1;
                      let startAngle = 0;
                      const cx = 80, cy = 80, r = 60, strokeWidth = 25;
                      const circumference = 2 * Math.PI * r;

                      return vatData.map((d, i) => {
                        const pct = d.amount / total;
                        const dashLen = circumference * pct;
                        const dashOffset = circumference * startAngle;
                        startAngle += pct;

                        return (
                          <Circle
                            key={i}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                            strokeDashoffset={-dashOffset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                          />
                        );
                      });
                    })()}
                    <SvgText x={80} y={76} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#0F172A">
                      {fmtTL(vatData.reduce((s, d) => s + d.amount, 0))}
                    </SvgText>
                    <SvgText x={80} y={94} textAnchor="middle" fontSize={10} fill="#64748B">
                      Toplam KDV
                    </SvgText>
                  </Svg>
                </View>
                {/* Legend */}
                <View style={styles.legend}>
                  {vatData.map((d, i) => (
                    <View key={i} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: COLORS[i % COLORS.length] }]} />
                      <Text style={styles.legendText}>%{d.rate} — {fmtTL(d.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ═══ DÖNEM KARŞILAŞTIRMASI ═══ */}
            {report.periods && report.periods.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📅 Dönem Karşılaştırması</Text>
                <Svg width={SCREEN_W} height={180} viewBox={`0 0 ${SCREEN_W} 180`}>
                  {/* Grid lines */}
                  {[0, 1, 2, 3].map(i => (
                    <Line key={i} x1={40} y1={20 + i * 45} x2={SCREEN_W - 10} y2={20 + i * 45}
                      stroke="#E2E8F0" strokeWidth={1} />
                  ))}
                  {/* Bars */}
                  {report.periods.map((p, i) => {
                    const maxVal = Math.max(...report.periods.map(pe => pe.total_amount), 1);
                    const barH = (p.total_amount / maxVal) * 130;
                    const barW = (SCREEN_W - 80) / report.periods.length - 16;
                    const x = 50 + i * (barW + 16);
                    const y = 155 - barH;
                    return (
                      <G key={i}>
                        <Rect x={x} y={y} width={barW} height={barH} rx={6} fill={COLORS[i]} opacity={0.9} />
                        <SvgText x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#0F172A">
                          {fmtTL(p.total_amount)}
                        </SvgText>
                        <SvgText x={x + barW / 2} y={172} textAnchor="middle" fontSize={9} fill="#64748B">
                          {p.period_label?.split(" ")[0] || `Dönem ${i + 1}`}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>
                {/* Dönem detayları */}
                <View style={styles.periodDetails}>
                  {report.periods.map((p, i) => (
                    <View key={i} style={styles.periodItem}>
                      <View style={[styles.periodDot, { backgroundColor: COLORS[i] }]} />
                      <Text style={styles.periodLabel}>{p.period_label}</Text>
                      <Text style={styles.periodAmount}>{fmtTL(p.total_amount)}</Text>
                      <Text style={styles.periodCount}>{p.expense_count} kayıt</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  scroll: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", color: "#F8FAFC", marginBottom: 16 },
  emptyText: { color: "#64748B", textAlign: "center", marginTop: 40 },

  // Özet kartları
  cardRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: "center",
  },
  summaryLabel: { fontSize: 12, fontWeight: "500" },
  summaryAmount: { fontSize: 20, fontWeight: "bold", marginTop: 4 },

  // Grafik kartları
  chartCard: {
    backgroundColor: "#1E293B", borderRadius: 14, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: "#F8FAFC", marginBottom: 14 },

  // Bar grafiği
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  barLabel: { width: 100, fontSize: 12, color: "#CBD5E1" },
  barContainer: { flex: 1, height: 18, backgroundColor: "#0F172A", borderRadius: 9, overflow: "hidden", marginHorizontal: 8 },
  bar: { height: "100%", borderRadius: 9, minWidth: 4 },
  barValue: { fontSize: 11, color: "#F8FAFC", fontWeight: "600", width: 70, textAlign: "right" },
  barPct: { fontSize: 10, color: "#64748B", width: 38, textAlign: "right" },

  // Donut
  donutContainer: { alignItems: "center", marginVertical: 8 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: "#CBD5E1" },

  // Dönem karşılaştırması
  periodDetails: { marginTop: 12, gap: 6 },
  periodItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#334155" },
  periodDot: { width: 10, height: 10, borderRadius: 5 },
  periodLabel: { flex: 1, fontSize: 13, color: "#CBD5E1" },
  periodAmount: { fontSize: 14, fontWeight: "600", color: "#F8FAFC" },
  periodCount: { fontSize: 11, color: "#64748B", width: 50, textAlign: "right" },
});
