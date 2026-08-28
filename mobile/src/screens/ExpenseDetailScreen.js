/**
 * Gider Detayı — Tüm bilgiler ve fiş görseli.
 * Görsel dokunulduğunda tam ekran görüntülenir.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Image, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtDate, fmtVat, API_BASE } from "../lib/api";
import ZoomableImage from "../components/ZoomableImage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const CATEGORIES = {
  market: "🛒", akaryakıt: "⛽", yemek: "🍽️", ulaşım: "🚗", kira: "🏠", personel: "👥",
  malzeme: "📦", faturalar: "📄", telefon: "📱", internet: "🌐", bakım: "🔧",
  temizlik: "🧹", reklam: "📢", sigorta: "🛡️", vergi: "💰", diğer: "📋",
};

export default function ExpenseDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageVisible, setImageVisible] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get(`/api/expenses/${id}`);
      setExpense(r.data);
    } catch (e) {
      Alert.alert("Hata", "Gider yüklenemedi.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const deleteExpense = () => {
    Alert.alert("Sil", "Bu gider çöp kutusuna taşınacak. Geri yükleyebilirsiniz.", [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await http.delete(`/api/expenses/${id}`);
            Alert.alert("✅", "Çöp kutusuna taşındı.");
            navigation.goBack();
          } catch (e) {
            Alert.alert("Hata", "Silinemedi.");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!expense) return null;

  const imageUrl = expense.receipt_image_url
    ? `${API_BASE}${expense.receipt_image_url}`
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Fiş Görseli */}
        {imageUrl && (
          <TouchableOpacity onPress={() => setImageVisible(true)} style={styles.imageCard}>
            <Image source={{ uri: imageUrl }} style={styles.receiptImage} resizeMode="contain" />
            <Text style={styles.imageHint}>🔍 Büyütmek için dokunun</Text>
          </TouchableOpacity>
        )}

        {/* İş Yeri */}
        <View style={styles.vendorCard}>
          <Text style={styles.vendorIcon}>{CATEGORIES[expense.category] || "📋"}</Text>
          <Text style={styles.vendorName}>{expense.vendor_name || "İş yeri belirtilmemiş"}</Text>
          {expense.description ? (
            <Text style={styles.description}>{expense.description}</Text>
          ) : null}
        </View>

        {/* Tutar Bilgileri */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Toplam Tutar</Text>
          <Text style={styles.amountValue}>{fmtTL(expense.total_amount)}</Text>

          <View style={styles.divider} />

          {/* Tek KDV satırı */}
          {!expense.vat_items && (
            <View style={styles.amountRow}>
              <View style={styles.amountItem}>
                <Text style={styles.amountItemLabel}>Matrah</Text>
                <Text style={styles.amountItemValue}>{fmtTL(expense.net_amount)}</Text>
              </View>
              <View style={styles.amountItem}>
                <Text style={styles.amountItemLabel}>KDV Oranı</Text>
                <Text style={styles.amountItemValue}>{fmtVat(expense.vat_rate)}</Text>
              </View>
              <View style={styles.amountItem}>
                <Text style={styles.amountItemLabel}>KDV Tutarı</Text>
                <Text style={styles.amountItemValue}>{fmtTL(expense.vat_amount)}</Text>
              </View>
            </View>
          )}

          {/* Çoklu KDV satırları */}
          {expense.vat_items && expense.vat_items.length > 0 && (
            <View style={styles.vatItemsSection}>
              <Text style={styles.vatItemsTitle}>📋 KDV Detayları</Text>
              {expense.vat_items.map((item, idx) => (
                <View key={idx} style={styles.vatItemRow}>
                  <View style={styles.vatItemRate}>
                    <Text style={styles.vatItemRateText}>%{item.vat_rate}</Text>
                  </View>
                  <View style={styles.vatItemDetails}>
                    <Text style={styles.vatItemLabel}>Matrah: {fmtTL(item.net_amount)}</Text>
                    <Text style={styles.vatItemLabel}>KDV: {fmtTL(item.vat_amount)}</Text>
                  </View>
                  <Text style={styles.vatItemTotal}>{fmtTL(item.total_amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Detay Bilgileri */}
        <View style={styles.infoCard}>
          <InfoRow label="Tarih" value={fmtDate(expense.receipt_date)} />
          <InfoRow label="Fiş No" value={expense.receipt_number || "-"} />
          <InfoRow label="Kategori" value={expense.category || "diğer"} />
          <InfoRow label="KDV Güven" value={expense.ocr_confidence ? `%${Math.round(expense.ocr_confidence)}` : "-"} />
          <InfoRow label="Manuel Düzeltme" value={expense.is_manually_edited ? "Evet" : "Hayır"} />
          <InfoRow label="Kayıt Tarihi" value={fmtDate(expense.created_at)} />
        </View>

        {/* Butonlar */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btn, styles.editBtn]}
            onPress={() => navigation.navigate("ExpenseEdit", { id: expense.id })}
          >
            <Text style={styles.btnText}>✏️ Düzenle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.deleteBtn]}
            onPress={deleteExpense}
          >
            <Text style={styles.btnText}>🗑️ Sil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Tam Ekran Görsel Modal (Zoomable) */}
      <ZoomableImage uri={imageUrl} visible={imageVisible} onClose={() => setImageVisible(false)} />
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 16, paddingBottom: 40 },

  imageCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 8,
    marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0",
    alignItems: "center",
  },
  receiptImage: { width: SCREEN_W - 48, height: 300, borderRadius: 8 },
  imageHint: { color: "#94A3B8", fontSize: 12, marginTop: 8 },

  vendorCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center",
  },
  vendorIcon: { fontSize: 36, marginBottom: 8 },
  vendorName: { fontSize: 17, fontWeight: "bold", color: "#0F172A", textAlign: "center" },
  description: { fontSize: 13, color: "#64748B", marginTop: 4, textAlign: "center" },

  amountCard: {
    backgroundColor: "#0284C7", borderRadius: 12, padding: 20, marginBottom: 12,
  },
  amountLabel: { color: "#BAE6FD", fontSize: 13 },
  amountValue: { color: "#fff", fontSize: 28, fontWeight: "bold", marginTop: 4 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.3)", marginVertical: 14 },
  amountRow: { flexDirection: "row", justifyContent: "space-between" },
  amountItem: {},
  amountItemLabel: { color: "#BAE6FD", fontSize: 11 },
  amountItemValue: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 2 },

  infoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0",
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
  },
  infoLabel: { color: "#64748B", fontSize: 13 },
  infoValue: { color: "#0F172A", fontSize: 13, fontWeight: "500" },

  buttonRow: { flexDirection: "row", gap: 12 },
  btn: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  editBtn: { backgroundColor: "#0284C7" },
  deleteBtn: { backgroundColor: "#EF4444" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },

  vatItemsSection: { marginTop: 10 },
  vatItemsTitle: { color: "#BAE6FD", fontSize: 13, marginBottom: 8, fontWeight: "600" },
  vatItemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)",
  },
  vatItemRate: {
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: 10, marginRight: 12,
  },
  vatItemRateText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  vatItemDetails: { flex: 1 },
  vatItemLabel: { color: "#BAE6FD", fontSize: 12 },
  vatItemTotal: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
