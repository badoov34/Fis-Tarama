/**
 * Gider Düzenleme — Mevcut gider bilgilerini güncelle.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http from "../lib/api";

const VAT_RATES = [0, 1, 10, 20];
const CATEGORIES = [
  { value: "market", label: "🛒 Market" },
  { value: "akaryakıt", label: "⛽ Akaryakıt" },
  { value: "yemek", label: "🍽️ Yemek" },
  { value: "ulaşım", label: "🚗 Ulaşım" },
  { value: "kira", label: "🏠 Kira" },
  { value: "personel", label: "👥 Personel" },
  { value: "malzeme", label: "📦 Malzeme" },
  { value: "faturalar", label: "📄 Faturalar" },
  { value: "diğer", label: "📋 Diğer" },
];

export default function ExpenseEditScreen({ route, navigation }) {
  const { id } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [totalAmount, setTotalAmount] = useState("");
  const [vatRate, setVatRate] = useState(20);
  const [netAmount, setNetAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [category, setCategory] = useState("diğer");
  const [description, setDescription] = useState("");

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get(`/api/expenses/${id}`);
      const exp = r.data;
      setTotalAmount(String(exp.total_amount || ""));
      setVatRate(exp.vat_rate ?? 20);
      setNetAmount(String(exp.net_amount || ""));
      setVatAmount(String(exp.vat_amount || ""));
      setVendorName(exp.vendor_name || "");
      setReceiptNumber(exp.receipt_number || "");
      setReceiptDate(exp.receipt_date || "");
      setCategory(exp.category || "diğer");
      setDescription(exp.description || "");
    } catch (e) {
      Alert.alert("Hata", "Gider yüklenemedi.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const changeTotalAmount = (val) => {
    setTotalAmount(val);
    const total = parseFloat(val);
    if (!isNaN(total) && total > 0) {
      if (vatRate > 0) {
        const net = (total / (1 + vatRate / 100)).toFixed(2);
        const vat = (total - parseFloat(net)).toFixed(2);
        setNetAmount(net);
        setVatAmount(vat);
      } else {
        setNetAmount(val);
        setVatAmount("0");
      }
    }
  };

  const changeVatRate = (rate) => {
    setVatRate(rate);
    if (totalAmount) {
      const total = parseFloat(totalAmount);
      if (rate > 0) {
        const net = (total / (1 + rate / 100)).toFixed(2);
        const vat = (total - parseFloat(net)).toFixed(2);
        setNetAmount(net);
        setVatAmount(vat);
      } else {
        setNetAmount(totalAmount);
        setVatAmount("0");
      }
    }
  };

  const save = async () => {
    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      return Alert.alert("Hata", "Tutar girin.");
    }
    setSaving(true);
    try {
      await http.patch(`/api/expenses/${id}`, {
        total_amount: parseFloat(totalAmount),
        net_amount: netAmount ? parseFloat(netAmount) : null,
        vat_rate: vatRate,
        vat_amount: vatAmount ? parseFloat(vatAmount) : null,
        vendor_name: vendorName,
        receipt_number: receiptNumber,
        receipt_date: receiptDate || null,
        category,
        description,
        is_manually_edited: true,
      });
      Alert.alert("✅ Güncellendi", "Gider güncellendi!", [
        { text: "Tamam", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Hata", e.response?.data?.detail || "Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>✏️ Gideri Düzenle</Text>

        <Text style={styles.label}>Toplam Tutar (KDV Dahil) *</Text>
        <TextInput
          style={styles.input}
          value={totalAmount}
          onChangeText={changeTotalAmount}
          placeholder="0,00"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>KDV Oranı</Text>
        <View style={styles.vatRow}>
          {VAT_RATES.map((rate) => (
            <TouchableOpacity
              key={rate}
              style={[styles.vatBtn, vatRate === rate && styles.vatBtnActive]}
              onPress={() => changeVatRate(rate)}
            >
              <Text style={[styles.vatBtnText, vatRate === rate && styles.vatBtnTextActive]}>
                %{rate}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Matrah</Text>
            <TextInput
              style={styles.input}
              value={netAmount}
              onChangeText={setNetAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>KDV</Text>
            <TextInput
              style={styles.input}
              value={vatAmount}
              onChangeText={setVatAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Text style={styles.label}>İş Yeri Adı</Text>
        <TextInput style={styles.input} value={vendorName} onChangeText={setVendorName} placeholder="İş yeri" />

        <Text style={styles.label}>Fiş / Belge Numarası</Text>
        <TextInput style={styles.input} value={receiptNumber} onChangeText={setReceiptNumber} placeholder="Fiş numarası" />

        <Text style={styles.label}>Tarih (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={receiptDate} onChangeText={setReceiptDate} placeholder="2026-08-25" />

        <Text style={styles.label}>Kategori</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.catBtn, category === c.value && styles.catBtnActive]}
              onPress={() => setCategory(c.value)}
            >
              <Text style={[styles.catBtnText, category === c.value && styles.catBtnTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, { height: 60 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Not..."
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? "Güncelleniyor..." : "✅ Güncelle"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
    borderRadius: 10, padding: 12, fontSize: 16, color: "#0F172A",
  },
  row: { flexDirection: "row", gap: 12 },
  halfField: { flex: 1 },
  vatRow: { flexDirection: "row", gap: 8 },
  vatBtn: {
    flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#F1F5F9",
    alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0",
  },
  vatBtnActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  vatBtnText: { color: "#64748B", fontWeight: "600", fontSize: 14 },
  vatBtnTextActive: { color: "#fff" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0",
  },
  catBtnActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  catBtnText: { fontSize: 13, color: "#64748B" },
  catBtnTextActive: { color: "#fff" },
  saveBtn: {
    backgroundColor: "#059669", borderRadius: 12, padding: 16,
    alignItems: "center", marginTop: 24, marginBottom: 40,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
