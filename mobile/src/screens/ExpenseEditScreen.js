/**
 * Gider Düzenleme — Çoklu KDV desteği ile.
 *
 * Tek veya birden fazla KDV oranını düzenleme imkanı.
 * KDV satırları eklenebilir, kaldırılabilir ve oranları değiştirilebilir.
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

/**
 * Tek bir KDV satırı — tutar, oran ve hesaplanan matrah/KDV.
 */
function VatLine({ index, line, onChange, onRemove, canRemove }) {
  const recalc = (total, rate) => {
    const t = parseFloat(total);
    if (!isNaN(t) && t > 0 && rate > 0) {
      const net = (t / (1 + rate / 100)).toFixed(2);
      const vat = (t - parseFloat(net)).toFixed(2);
      return { netAmount: net, vatAmount: vat };
    }
    return { netAmount: total || "", vatAmount: rate === 0 ? "0" : "" };
  };

  const handleTotalChange = (val) => {
    const { netAmount, vatAmount } = recalc(val, line.vat_rate);
    onChange(index, { ...line, total_amount: val, net_amount: netAmount, vat_amount: vatAmount });
  };

  const handleRateChange = (rate) => {
    const { netAmount, vatAmount } = recalc(line.total_amount, rate);
    onChange(index, { ...line, vat_rate: rate, net_amount: netAmount, vat_amount: vatAmount });
  };

  return (
    <View style={styles.vatLineBox}>
      <View style={styles.vatLineHeader}>
        <Text style={styles.vatLineTitle}>KDV %{line.vat_rate}</Text>
        {canRemove && (
          <TouchableOpacity onPress={() => onRemove(index)} style={styles.vatLineRemove}>
            <Text style={styles.vatLineRemoveText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.label}>Tutar (KDV Dahil)</Text>
      <TextInput
        style={styles.input}
        value={line.total_amount}
        onChangeText={handleTotalChange}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>KDV Oranı</Text>
      <View style={styles.vatRow}>
        {VAT_RATES.map((rate) => (
          <TouchableOpacity
            key={rate}
            style={[styles.vatBtn, line.vat_rate === rate && styles.vatBtnActive]}
            onPress={() => handleRateChange(rate)}
          >
            <Text style={[styles.vatBtnText, line.vat_rate === rate && styles.vatBtnTextActive]}>
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
            value={line.net_amount}
            onChangeText={(v) => onChange(index, { ...line, net_amount: v })}
            placeholder="0,00"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.halfField}>
          <Text style={styles.label}>KDV Tutarı</Text>
          <TextInput
            style={styles.input}
            value={line.vat_amount}
            onChangeText={(v) => onChange(index, { ...line, vat_amount: v })}
            placeholder="0,00"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
    </View>
  );
}

export default function ExpenseEditScreen({ route, navigation }) {
  const { id } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Çoklu KDV satırları
  const [vatLines, setVatLines] = useState([]);

  // Genel bilgiler
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

      setVendorName(exp.vendor_name || "");
      setReceiptNumber(exp.receipt_number || "");
      setReceiptDate(exp.receipt_date || "");
      setCategory(exp.category || "diğer");
      setDescription(exp.description || "");

      // KDV satırlarını doldur
      if (exp.vat_items && exp.vat_items.length > 0) {
        // Çoklu KDV
        setVatLines(
          exp.vat_items.map((item) => ({
            vat_rate: item.vat_rate ?? 20,
            total_amount: item.total_amount?.toString() || "",
            net_amount: item.net_amount?.toString() || "",
            vat_amount: item.vat_amount?.toString() || "",
          }))
        );
      } else {
        // Tek KDV
        setVatLines([
          {
            vat_rate: exp.vat_rate ?? 20,
            total_amount: String(exp.total_amount || ""),
            net_amount: String(exp.net_amount || ""),
            vat_amount: String(exp.vat_amount || ""),
          },
        ]);
      }
    } catch (e) {
      Alert.alert("Hata", "Gider yüklenemedi.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  // Toplamlar
  const getTotal = () => {
    let t = 0;
    vatLines.forEach((l) => { const v = parseFloat(l.total_amount); if (!isNaN(v)) t += v; });
    return t.toFixed(2);
  };
  const getTotalNet = () => {
    let t = 0;
    vatLines.forEach((l) => { const v = parseFloat(l.net_amount); if (!isNaN(v)) t += v; });
    return t.toFixed(2);
  };
  const getTotalVat = () => {
    let t = 0;
    vatLines.forEach((l) => { const v = parseFloat(l.vat_amount); if (!isNaN(v)) t += v; });
    return t.toFixed(2);
  };

  // KDV satırı işlemleri
  const addVatLine = () => {
    setVatLines([...vatLines, { vat_rate: 20, total_amount: "", net_amount: "", vat_amount: "" }]);
  };
  const removeVatLine = (index) => {
    setVatLines(vatLines.filter((_, i) => i !== index));
  };
  const updateVatLine = (index, updated) => {
    const newLines = [...vatLines];
    newLines[index] = updated;
    setVatLines(newLines);
  };

  const save = async () => {
    const totalAmount = parseFloat(getTotal());
    if (!totalAmount || totalAmount <= 0) {
      return Alert.alert("Hata", "En az bir KDV satırında tutar girin.");
    }
    setSaving(true);
    try {
      const payload = {
        total_amount: totalAmount,
        net_amount: parseFloat(getTotalNet()) || null,
        vat_rate: vatLines.length === 1 ? vatLines[0].vat_rate : null,
        vat_amount: parseFloat(getTotalVat()) || null,
        vendor_name: vendorName,
        receipt_number: receiptNumber,
        receipt_date: receiptDate || null,
        category,
        description,
        is_manually_edited: true,
      };

      // Çoklu KDV satırları varsa ekle
      if (vatLines.length > 1) {
        payload.vat_items = vatLines.map((l) => ({
          vat_rate: l.vat_rate,
          total_amount: parseFloat(l.total_amount) || 0,
          net_amount: parseFloat(l.net_amount) || 0,
          vat_amount: parseFloat(l.vat_amount) || 0,
        }));
      } else {
        payload.vat_items = [];
      }

      await http.patch(`/api/expenses/${id}`, payload);
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

        {/* İş Yeri */}
        <Text style={styles.label}>İş Yeri Adı</Text>
        <TextInput
          style={styles.input}
          value={vendorName}
          onChangeText={setVendorName}
          placeholder="İş yeri adı"
        />

        {/* Fiş/Belge Numarası */}
        <Text style={styles.label}>Fiş / Belge Numarası</Text>
        <TextInput
          style={styles.input}
          value={receiptNumber}
          onChangeText={setReceiptNumber}
          placeholder="Fiş numarası"
        />

        {/* Tarih */}
        <Text style={styles.label}>Tarih (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={receiptDate}
          onChangeText={setReceiptDate}
          placeholder="2026-08-25"
        />

        {/* ─── KDV Satırları ─── */}
        <View style={styles.vatSectionHeader}>
          <Text style={styles.label}>KDV Detayları</Text>
          <TouchableOpacity onPress={addVatLine} style={styles.addVatBtn}>
            <Text style={styles.addVatBtnText}>+ KDV Ekle</Text>
          </TouchableOpacity>
        </View>

        {vatLines.map((line, index) => (
          <VatLine
            key={index}
            index={index}
            line={line}
            onChange={updateVatLine}
            onRemove={removeVatLine}
            canRemove={vatLines.length > 1}
          />
        ))}

        {/* Toplam Bilgi */}
        {vatLines.length > 0 && (
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Toplam (KDV Dahil):</Text>
              <Text style={styles.totalValue}>{getTotal()} ₺</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Toplam Matrah:</Text>
              <Text style={styles.totalValue}>{getTotalNet()} ₺</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Toplam KDV:</Text>
              <Text style={styles.totalValue}>{getTotalVat()} ₺</Text>
            </View>
            {vatLines.length > 1 && (
              <Text style={styles.totalNote}>
                ℹ️ {vatLines.length} farklı KDV oranı var
              </Text>
            )}
          </View>
        )}

        {/* Kategori */}
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

        {/* Açıklama */}
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
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
    borderRadius: 10, padding: 12, fontSize: 16, color: "#0F172A",
  },
  row: { flexDirection: "row", gap: 12 },
  halfField: { flex: 1 },
  vatSectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  addVatBtn: {
    backgroundColor: "#0284C7", borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 14, marginTop: 12,
  },
  addVatBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  vatLineBox: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0",
  },
  vatLineHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8,
  },
  vatLineTitle: { fontSize: 16, fontWeight: "bold", color: "#0284C7" },
  vatLineRemove: {
    backgroundColor: "#FEE2E2", borderRadius: 12,
    width: 28, height: 28, justifyContent: "center", alignItems: "center",
  },
  vatLineRemoveText: { color: "#DC2626", fontWeight: "bold", fontSize: 14 },
  vatRow: { flexDirection: "row", gap: 8 },
  vatBtn: {
    flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#F1F5F9",
    alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0",
  },
  vatBtnActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  vatBtnText: { color: "#64748B", fontWeight: "600", fontSize: 14 },
  vatBtnTextActive: { color: "#fff" },
  totalBox: {
    backgroundColor: "#F0FDF4", borderRadius: 12, padding: 14,
    marginTop: 8, borderWidth: 1, borderColor: "#BBF7D0",
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 14, color: "#374151", fontWeight: "500" },
  totalValue: { fontSize: 14, color: "#059669", fontWeight: "bold" },
  totalNote: { fontSize: 12, color: "#6B7280", marginTop: 6, fontStyle: "italic" },
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
