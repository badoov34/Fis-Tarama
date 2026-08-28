/**
 * Çöp Kutusu — Silinmiş giderleri göster, geri yükle veya kalıcı olarak sil.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtDate } from "../lib/api";

const CATEGORIES = {
  akaryakıt: "⛽", yemek: "🍽️", ulaşım: "🚗", kira: "🏠", personel: "👥",
  malzeme: "📦", faturalar: "📄", telefon: "📱", internet: "🌐", bakım: "🔧",
  temizlik: "🧹", reklam: "📢", sigorta: "🛡️", vergi: "💰", diğer: "📋",
};

export default function TrashScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/api/expenses/trash/list");
      setExpenses(r.data);
      setTotal(r.data.reduce((s, e) => s + (e.total_amount || 0), 0));
    } catch (e) {
      console.log("Hata:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation]);

  const restoreExpense = (id, name) => {
    Alert.alert("Geri Yükle", `"${name}" geri yüklensin mi?`, [
      { text: "İptal", style: "cancel" },
      {
        text: "Geri Yükle",
        onPress: async () => {
          try {
            await http.post(`/api/expenses/${id}/restore`);
            Alert.alert("✅", "Gider geri yüklendi!");
            load();
          } catch (e) {
            Alert.alert("Hata", "Geri yüklenemedi.");
          }
        },
      },
    ]);
  };

  const permanentDelete = (id, name) => {
    Alert.alert(
      "Kalıcı Sil",
      `"${name}" kalıcı olarak silinecek!\n\nBu işlem geri alınamaz!`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Kalıcı Sil",
          style: "destructive",
          onPress: async () => {
            try {
              await http.delete(`/api/expenses/${id}/permanent`);
              Alert.alert("✅", "Kalıcı olarak silindi.");
              load();
            } catch (e) {
              Alert.alert("Hata", "Silinemedi.");
            }
          },
        },
      ]
    );
  };

  const emptyAll = () => {
    if (expenses.length === 0) return;
    Alert.alert(
      "Tümünü Temizle",
      `${expenses.length} gider kalıcı olarak silinecek!\n\nBu işlem geri alınamaz!`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Tümünü Sil",
          style: "destructive",
          onPress: async () => {
            try {
              for (const exp of expenses) {
                await http.delete(`/api/expenses/${exp.id}/permanent`);
              }
              Alert.alert("✅", "Çöp kutusu temizlendi!");
              load();
            } catch (e) {
              Alert.alert("Hata", "Temizlenemedi.");
              load();
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Başlık */}
        <View style={styles.header}>
          <Text style={styles.title}>🗑️ Çöp Kutusu</Text>
          {expenses.length > 0 && (
            <TouchableOpacity onPress={emptyAll}>
              <Text style={styles.clearAll}>Tümünü Temizle</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Toplam */}
        {expenses.length > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Silinen Toplam</Text>
            <Text style={styles.totalAmount}>{fmtTL(total)}</Text>
            <Text style={styles.totalCount}>{expenses.length} kayıt</Text>
          </View>
        )}

        {/* Liste */}
        {loading ? (
          <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 30 }} />
        ) : expenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🗑️</Text>
            <Text style={styles.emptyText}>Çöp kutusu boş</Text>
            <Text style={styles.emptySubtext}>Silinen giderler burada görünecek</Text>
          </View>
        ) : (
          expenses.map((exp) => (
            <View key={exp.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.icon}>{CATEGORIES[exp.category] || "📋"}</Text>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardVendor} numberOfLines={1}>
                    {exp.vendor_name || exp.category}
                  </Text>
                  <Text style={styles.cardDate}>
                    {fmtDate(exp.receipt_date)} • {fmtTL(exp.total_amount)}
                  </Text>
                  {exp.deleted_at && (
                    <Text style={styles.cardDeletedAt}>
                      Silindi: {fmtDate(exp.deleted_at)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={() => restoreExpense(exp.id, exp.vendor_name || exp.category)}
                >
                  <Text style={styles.restoreBtnText}>♻️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.permanentBtn}
                  onPress={() => permanentDelete(exp.id, exp.vendor_name || exp.category)}
                >
                  <Text style={styles.permanentBtnText}>❌</Text>
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

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A" },
  clearAll: { color: "#EF4444", fontSize: 13, fontWeight: "600" },

  totalCard: {
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  totalLabel: { color: "#991B1B", fontSize: 12, fontWeight: "500" },
  totalAmount: { color: "#991B1B", fontSize: 24, fontWeight: "bold", marginTop: 4 },
  totalCount: { color: "#991B1B", fontSize: 12, marginTop: 2 },

  emptyCard: {
    alignItems: "center", marginTop: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#64748B", fontSize: 18, fontWeight: "600" },
  emptySubtext: { color: "#94A3B8", fontSize: 13, marginTop: 4 },

  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  icon: { fontSize: 28, marginRight: 12 },
  cardInfo: { flex: 1 },
  cardVendor: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  cardDate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  cardDeletedAt: { fontSize: 11, color: "#EF4444", marginTop: 2 },

  cardActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
  restoreBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#ECFDF5",
    justifyContent: "center", alignItems: "center",
  },
  restoreBtnText: { fontSize: 18 },
  permanentBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEF2F2",
    justifyContent: "center", alignItems: "center",
  },
  permanentBtnText: { fontSize: 18 },
});
