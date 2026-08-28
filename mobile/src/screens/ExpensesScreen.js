/**
 * Gider Listesi — Tüm giderleri görüntüle, filtrele, sil.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtDate, fmtVat } from "../lib/api";

const CATEGORIES = {
  market: "🛒", akaryakıt: "⛽", yemek: "🍽️", ulaşım: "🚗", kira: "🏠", personel: "👥",
  malzeme: "📦", faturalar: "📄", telefon: "📱", internet: "🌐", bakım: "🔧",
  temizlik: "🧹", reklam: "📢", sigorta: "🛡️", vergi: "💰", diğer: "📋",
};

export default function ExpensesScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/api/expenses", {
        params: { year: selectedMonth.year, month: selectedMonth.month },
      });
      setExpenses(r.data);
      setTotal(r.data.reduce((s, e) => s + (e.total_amount || 0), 0));
    } catch (e) {
      console.log("Hata:", e.message);
    } finally {
      setLoading(false);
    }
  };

  // Her ay değişikliğinde veya ekrana odaklandığında yükle
  useEffect(() => {
    load();
  }, [selectedMonth]);

  // Ekran her odaklandığında da yükle (başka screen'den gelirken)
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => load());
    return unsubscribe;
  }, [navigation]);

  const prevMonth = () => {
    setSelectedMonth((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { ...prev, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setSelectedMonth((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  const deleteExpense = (id, name) => {
    Alert.alert("Sil", `"${name}" çöp kutusuna taşınacak.\nGeri yükleyebilirsiniz.`, [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await http.delete(`/api/expenses/${id}`);
            load();
          } catch (e) {
            Alert.alert("Hata", "Silinemedi.");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Ay Seçici */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {MONTHS[selectedMonth.month - 1]} {selectedMonth.year}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Toplam */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Toplam Gider</Text>
          <Text style={styles.totalAmount}>{fmtTL(total)}</Text>
          <Text style={styles.totalCount}>{expenses.length} kayıt</Text>
        </View>

        {/* Liste */}
        {loading ? (
          <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 30 }} />
        ) : expenses.length === 0 ? (
          <Text style={styles.emptyText}>Bu ay için gider yok.</Text>
        ) : (
          expenses.map((exp) => (
            <View key={exp.id} style={styles.card}>
              <TouchableOpacity
                style={styles.cardMain}
                onPress={() => navigation.navigate("ExpenseDetail", { id: exp.id })}
              >
                <Text style={styles.icon}>{CATEGORIES[exp.category] || "📋"}</Text>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardVendor} numberOfLines={1}>
                    {exp.vendor_name || exp.category}
                  </Text>
                  <Text style={styles.cardDate}>
                    {fmtDate(exp.receipt_date)} • {
                      exp.vat_items && exp.vat_items.length > 1
                        ? "Muhtelif Oranlar"
                        : fmtVat(exp.vat_rate)
                    } KDV
                  </Text>
                  {exp.description ? (
                    <Text style={styles.cardDesc} numberOfLines={1}>{exp.description}</Text>
                  ) : null}
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.cardAmount}>{fmtTL(exp.total_amount)}</Text>
                  {exp.vat_amount > 0 && (
                    <Text style={styles.cardVat}>KDV: {fmtTL(exp.vat_amount)}</Text>
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => navigation.navigate("ExpenseEdit", { id: exp.id })}
                >
                  <Text style={styles.editBtnText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteExpense(exp.id, exp.vendor_name || exp.category)}
                >
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 20 },
  monthSelector: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 16, marginBottom: 16,
  },
  monthBtn: { padding: 8 },
  monthBtnText: { fontSize: 20, color: "#0284C7" },
  monthLabel: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },
  totalCard: {
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#FCD34D",
  },
  totalLabel: { color: "#92400E", fontSize: 12, fontWeight: "500" },
  totalAmount: { color: "#92400E", fontSize: 24, fontWeight: "bold", marginTop: 4 },
  totalCount: { color: "#92400E", fontSize: 12, marginTop: 2 },
  emptyText: { color: "#94A3B8", textAlign: "center", marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  cardMain: {
    flexDirection: "row", alignItems: "center", padding: 14,
  },
  cardActions: {
    flexDirection: "row", justifyContent: "flex-end", gap: 8,
    paddingHorizontal: 14, paddingBottom: 10, paddingTop: 0,
  },
  editBtn: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
    backgroundColor: "#EFF6FF",
  },
  editBtnText: { fontSize: 14 },
  deleteBtn: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
    backgroundColor: "#FEF2F2",
  },
  deleteBtnText: { fontSize: 14 },
  icon: { fontSize: 28, marginRight: 12 },
  cardInfo: { flex: 1 },
  cardVendor: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  cardDate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  cardDesc: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  cardRight: { alignItems: "flex-end" },
  cardAmount: { fontSize: 16, fontWeight: "bold", color: "#EF4444" },
  cardVat: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
});
