/**
 * Ana Sayfa — Gider özeti ve hızlı işlemler.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtDate } from "../lib/api";

const CATEGORIES = {
  akaryakıt: "⛽", yemek: "🍽️", ulaşım: "🚗", kira: "🏠", personel: "👥",
  malzeme: "📦", faturalar: "📄", telefon: "📱", internet: "🌐", bakım: "🔧",
  temizlik: "🧹", reklam: "📢", sigorta: "🛡️", vergi: "💰", diğer: "📋",
};

export default function HomeScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [monthlyVat, setMonthlyVat] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const r = await http.get("/api/expenses", {
        params: { year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      setExpenses(r.data);
      // Aylık toplamlar
      let total = 0, vat = 0;
      r.data.forEach((e) => {
        total += e.total_amount || 0;
        vat += e.vat_amount || 0;
      });
      setMonthlyTotal(total);
      setMonthlyVat(vat);
    } catch (e) {
      console.log("Veri yüklenemedi:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation]);

  const recentExpenses = expenses.slice(0, 5);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Başlık */}
        <View style={styles.header}>
          <Text style={styles.title}>📄 Fiş Tarama</Text>
          <Text style={styles.subtitle}>Gider takip ve raporlama</Text>
        </View>

        {/* Özet Kart */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Bu Ayın Toplam Gideri</Text>
          <Text style={styles.summaryAmount}>{fmtTL(monthlyTotal)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>KDV Toplamı</Text>
              <Text style={styles.summaryItemValue}>{fmtTL(monthlyVat)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Kayıt Sayısı</Text>
              <Text style={styles.summaryItemValue}>{expenses.length}</Text>
            </View>
          </View>
        </View>

        {/* Hızlı İşlemler */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: "#0284C7" }]}
            onPress={() => navigation.navigate("Main", { screen: "Tara" })}
          >
            <Text style={styles.quickBtnIcon}>📷</Text>
            <Text style={styles.quickBtnText}>Fiş Çek</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: "#059669" }]}
            onPress={() => navigation.navigate("ManualAdd")}
          >
            <Text style={styles.quickBtnIcon}>✏️</Text>
            <Text style={styles.quickBtnText}>Manuel Ekle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: "#7C3AED" }]}
            onPress={() => navigation.navigate("Main", { screen: "Rapor" })}
          >
            <Text style={styles.quickBtnIcon}>📊</Text>
            <Text style={styles.quickBtnText}>Rapor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: "#64748B" }]}
            onPress={() => navigation.navigate("Trash")}
          >
            <Text style={styles.quickBtnIcon}>🗑️</Text>
            <Text style={styles.quickBtnText}>Çöp Kutusu</Text>
          </TouchableOpacity>
        </View>

        {/* Son Giderler */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Son Giderler</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 20 }} />
          ) : recentExpenses.length === 0 ? (
            <Text style={styles.emptyText}>Henüz gider yok. İlk fişinizi çekin! 📷</Text>
          ) : (
            recentExpenses.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.expenseRow}
                onPress={() => navigation.navigate("ExpenseDetail", { id: exp.id })}
              >
                <Text style={styles.expenseIcon}>{CATEGORIES[exp.category] || "📋"}</Text>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseVendor} numberOfLines={1}>
                    {exp.vendor_name || exp.category}
                  </Text>
                  <Text style={styles.expenseDate}>{fmtDate(exp.receipt_date)}</Text>
                </View>
                <Text style={styles.expenseAmount}>{fmtTL(exp.total_amount)}</Text>
              </TouchableOpacity>
            ))
          )}
          {!loading && expenses.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate("Main", { screen: "Giderler" })}>
              <Text style={styles.seeAll}>Tümünü Gör →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "#0F172A" },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 4 },
  summaryCard: {
    backgroundColor: "#0284C7", borderRadius: 16, padding: 24, marginBottom: 20,
  },
  summaryLabel: { color: "#BAE6FD", fontSize: 13, fontWeight: "500" },
  summaryAmount: { color: "#fff", fontSize: 32, fontWeight: "bold", marginTop: 4 },
  summaryRow: { flexDirection: "row", marginTop: 16, gap: 24 },
  summaryItem: {},
  summaryItemLabel: { color: "#BAE6FD", fontSize: 11 },
  summaryItemValue: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 2 },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  quickBtn: {
    flex: 1, borderRadius: 12, padding: 16, alignItems: "center",
  },
  quickBtnIcon: { fontSize: 24, marginBottom: 6 },
  quickBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A", marginBottom: 12 },
  emptyText: { color: "#94A3B8", textAlign: "center", marginTop: 20, fontSize: 15 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  expenseIcon: { fontSize: 24, marginRight: 12 },
  expenseInfo: { flex: 1 },
  expenseVendor: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  expenseDate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  expenseAmount: { fontSize: 16, fontWeight: "bold", color: "#EF4444" },
  seeAll: { color: "#0284C7", textAlign: "center", marginTop: 12, fontWeight: "600" },
});
