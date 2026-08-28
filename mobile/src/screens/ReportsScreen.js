/**
 * Rapor Ekranı — 10 günlük dönemler, KDV dökümü, Excel/PDF indirme.
 */
import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtVat, API_BASE } from "../lib/api";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function ReportsScreen() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState(null);
  const [vatSummary, setVatSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([
        http.get("/api/reports/monthly", { params: { year: selectedYear, month: selectedMonth } }),
        http.get("/api/reports/vat-summary", { params: { year: selectedYear, month: selectedMonth } }).catch(() => null),
      ]);
      setReport(r.data);
      if (v?.data?.groups?.length > 0) {
        setVatSummary(v.data);
      } else {
        setVatSummary(null);
      }
    } catch (e) {
      Alert.alert("Hata", "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (format) => {
    setDownloadLoading(true);
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const url = `${API_BASE}/api/reports/monthly/${format}?year=${selectedYear}&month=${selectedMonth}`;

      const result = await FileSystem.downloadAsync(
        url,
        FileSystem.documentDirectory + `rapor_${selectedYear}_${selectedMonth}.${format === "excel" ? "xlsx" : "pdf"}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert("İndirildi", `Dosya kaydedildi: ${result.uri}`);
      }
    } catch (e) {
      console.log("İndirme hatası:", e);
      Alert.alert("Hata", "Dosya indirilemedi. Sunucu adresini kontrol edin.");
    } finally {
      setDownloadLoading(false);
    }
  };

  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>📊 Aylık Rapor</Text>

        {/* Ay Seçici */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={prevMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.arrowBtn}>
            <Text style={styles.arrowText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Yükle Butonu */}
        <TouchableOpacity style={styles.loadBtn} onPress={loadReport} disabled={loading}>
          <Text style={styles.loadBtnText}>{loading ? "Yükleniyor..." : "Raporu Yükle"}</Text>
        </TouchableOpacity>

        {/* Rapor İçeriği */}
        {report && (
          <>
            {/* Genel Toplam */}
            <View style={styles.grandTotal}>
              <Text style={styles.grandTotalLabel}>Aylık Toplam</Text>
              <Text style={styles.grandTotalAmount}>{fmtTL(report.grand_totals.total)}</Text>
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalItem}>Matrah: {fmtTL(report.grand_totals.net)}</Text>
                <Text style={styles.grandTotalItem}>KDV: {fmtTL(report.grand_totals.vat)}</Text>
              </View>
            </View>

            {/* 10 Günlük Dönemler */}
            {report.periods.map((p, idx) => (
              <View key={idx} style={styles.periodCard}>
                <View style={styles.periodHeader}>
                  <Text style={styles.periodLabel}>📅 {p.period.label}</Text>
                  <Text style={styles.periodCount}>{p.totals.count} kayıt</Text>
                </View>
                <View style={styles.periodTotals}>
                  <View style={styles.periodField}>
                    <Text style={styles.periodFieldLabel}>Matrah</Text>
                    <Text style={styles.periodFieldValue}>{fmtTL(p.totals.net)}</Text>
                  </View>
                  <View style={styles.periodField}>
                    <Text style={styles.periodFieldLabel}>KDV</Text>
                    <Text style={styles.periodFieldValue}>{fmtTL(p.totals.vat)}</Text>
                  </View>
                  <View style={styles.periodField}>
                    <Text style={styles.periodFieldLabel}>Toplam</Text>
                    <Text style={[styles.periodFieldValue, { color: "#EF4444" }]}>
                      {fmtTL(p.totals.total)}
                    </Text>
                  </View>
                </View>
                {p.expenses.length > 0 && (
                  <View style={styles.periodExpenses}>
                    {p.expenses.map((exp, eIdx) => (
                      <View key={eIdx} style={styles.periodExpenseRow}>
                        <Text style={styles.periodExpDate}>
                          {exp.receipt_date?.slice(5) || "-"}
                        </Text>
                        <Text style={styles.periodExpVendor} numberOfLines={1}>
                          {exp.vendor_name || exp.category}
                        </Text>
                        <Text style={styles.periodExpAmount}>
                          {fmtTL(exp.total_amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* KDV Dökümü */}
            {vatSummary && vatSummary.groups && vatSummary.groups.length > 0 && (
              <View style={styles.vatSummaryCard}>
                <Text style={styles.vatSummaryTitle}>💰 KDV Oranı Dökümü</Text>
                {vatSummary.groups.map((g, idx) => (
                  <View key={idx} style={styles.vatSummaryRow}>
                    <View style={styles.vatSummaryRate}>
                      <Text style={styles.vatSummaryRateText}>%{g.vat_rate}</Text>
                    </View>
                    <View style={styles.vatSummaryDetails}>
                      <Text style={styles.vatSummaryLabel}>Matrah: {fmtTL(g.net_amount)}</Text>
                      <Text style={styles.vatSummaryLabel}>KDV: {fmtTL(g.vat_amount)} ({g.expense_count} kayıt)</Text>
                    </View>
                    <Text style={styles.vatSummaryTotal}>{fmtTL(g.total_amount)}</Text>
                  </View>
                ))}
                <View style={styles.vatSummaryTotals}>
                  <Text style={styles.vatSummaryTotalText}>
                    Toplam: {fmtTL(vatSummary.totals.total)} (KDV: {fmtTL(vatSummary.totals.vat)})
                  </Text>
                </View>
              </View>
            )}

            {/* İndirme Butonları */}
            <View style={styles.downloadSection}>
              <Text style={styles.downloadTitle}>Dışa Aktar</Text>
              <View style={styles.downloadRow}>
                <TouchableOpacity
                  style={[styles.downloadBtn, { backgroundColor: "#16A34A" }]}
                  onPress={() => downloadFile("excel")}
                  disabled={downloadLoading}
                >
                  <Text style={styles.downloadBtnIcon}>📗</Text>
                  <Text style={styles.downloadBtnText}>Excel İndir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadBtn, { backgroundColor: "#DC2626" }]}
                  onPress={() => downloadFile("pdf")}
                  disabled={downloadLoading}
                >
                  <Text style={styles.downloadBtnIcon}>📕</Text>
                  <Text style={styles.downloadBtnText}>PDF İndir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: "#0F172A", marginBottom: 16 },
  monthSelector: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 20, marginBottom: 16,
  },
  arrowBtn: { padding: 10 },
  arrowText: { fontSize: 22, color: "#0284C7", fontWeight: "bold" },
  monthLabel: { fontSize: 20, fontWeight: "bold", color: "#0F172A" },
  loadBtn: {
    backgroundColor: "#0284C7", borderRadius: 12, padding: 14, alignItems: "center",
    marginBottom: 20,
  },
  loadBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  grandTotal: {
    backgroundColor: "#0284C7", borderRadius: 16, padding: 20, marginBottom: 20,
  },
  grandTotalLabel: { color: "#BAE6FD", fontSize: 13 },
  grandTotalAmount: { color: "#fff", fontSize: 30, fontWeight: "bold", marginTop: 4 },
  grandTotalRow: { flexDirection: "row", gap: 20, marginTop: 10 },
  grandTotalItem: { color: "#BAE6FD", fontSize: 13 },
  periodCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  periodHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 12,
  },
  periodLabel: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  periodCount: { fontSize: 12, color: "#64748B" },
  periodTotals: { flexDirection: "row", gap: 12 },
  periodField: { flex: 1 },
  periodFieldLabel: { fontSize: 11, color: "#64748B" },
  periodFieldValue: { fontSize: 15, fontWeight: "600", color: "#0F172A", marginTop: 2 },
  periodExpenses: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 8 },
  periodExpenseRow: { flexDirection: "row", paddingVertical: 4 },
  periodExpDate: { width: 45, fontSize: 12, color: "#64748B" },
  periodExpVendor: { flex: 1, fontSize: 13, color: "#334155" },
  periodExpAmount: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  vatSummaryCard: {
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#FCD34D",
  },
  vatSummaryTitle: { fontSize: 16, fontWeight: "bold", color: "#92400E", marginBottom: 12 },
  vatSummaryRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "#FDE68A",
  },
  vatSummaryRate: {
    backgroundColor: "#92400E", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 12,
  },
  vatSummaryRateText: { color: "#FEF3C7", fontSize: 14, fontWeight: "bold" },
  vatSummaryDetails: { flex: 1 },
  vatSummaryLabel: { color: "#92400E", fontSize: 12 },
  vatSummaryTotal: { color: "#92400E", fontSize: 15, fontWeight: "bold" },
  vatSummaryTotals: {
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#FCD34D",
  },
  vatSummaryTotalText: { color: "#92400E", fontSize: 14, fontWeight: "600" },
  downloadSection: { marginTop: 20, marginBottom: 40 },
  downloadTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 12 },
  downloadRow: { flexDirection: "row", gap: 12 },
  downloadBtn: {
    flex: 1, borderRadius: 12, padding: 16, alignItems: "center",
  },
  downloadBtnIcon: { fontSize: 28, marginBottom: 6 },
  downloadBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
