/**
 * Fiş Tarama Ekranı — Fotoğraf çek, OCR ile oku, sonucu göster.
 *
 * Özellikler:
 * - Fotoğraf çek/galeriden seç → OCR ile oku
 * - Kayıt sonrası otomatik sıfırlama (hemen yeni fiş çekebilirsin)
 * - Fotoğrafa tıklayarak tam ekran görüntüleme + pinch-to-zoom
 * - Çoklu KDV oranı desteği (market fişlerinde %10+%20 gibi)
 * - Kategori otomatik seçim (OCR suggestion)
 */
import { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
  ActivityIndicator, Alert, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import http from "../lib/api";
import ZoomableImage from "../components/ZoomableImage";

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

export default function ScanScreen({ navigation }) {
  const [imageUri, setImageUri] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [imageFilename, setImageFilename] = useState(null);

  // Çoklu KDV satırları
  const [vatLines, setVatLines] = useState([]);

  // Genel bilgiler
  const [vendorName, setVendorName] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [category, setCategory] = useState("diğer");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Fotoğraf zoom
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Tüm KDV toplamları
  const getTotal = () => {
    let total = 0;
    vatLines.forEach((l) => {
      const t = parseFloat(l.total_amount);
      if (!isNaN(t)) total += t;
    });
    return total.toFixed(2);
  };

  const getTotalNet = () => {
    let total = 0;
    vatLines.forEach((l) => {
      const n = parseFloat(l.net_amount);
      if (!isNaN(n)) total += n;
    });
    return total.toFixed(2);
  };

  const getTotalVat = () => {
    let total = 0;
    vatLines.forEach((l) => {
      const v = parseFloat(l.vat_amount);
      if (!isNaN(v)) total += v;
    });
    return total.toFixed(2);
  };

  // Yeni KDV satırı ekle
  const addVatLine = () => {
    setVatLines([...vatLines, { vat_rate: 20, total_amount: "", net_amount: "", vat_amount: "" }]);
  };

  // KDV satırı kaldır
  const removeVatLine = (index) => {
    setVatLines(vatLines.filter((_, i) => i !== index));
  };

  // KDV satırını güncelle
  const updateVatLine = (index, updatedLine) => {
    const newLines = [...vatLines];
    newLines[index] = updatedLine;
    setVatLines(newLines);
  };

  // Toplam tutar değişti → tek satırsa orantılı böl
  const handleTotalAmountChange = (val) => {
    if (vatLines.length === 1) {
      // Tek satır varsa direkt güncelle
      const line = vatLines[0];
      const rate = line.vat_rate;
      let net = "", vat = "";
      const t = parseFloat(val);
      if (!isNaN(t) && t > 0 && rate > 0) {
        net = (t / (1 + rate / 100)).toFixed(2);
        vat = (t - parseFloat(net)).toFixed(2);
      } else if (!isNaN(t)) {
        net = val;
        vat = "0";
      }
      setVatLines([{ ...line, total_amount: val, net_amount: net, vat_amount: vat }]);
    }
  };

  // Fotoğraf seç (kamera veya galeri)
  const pickImage = async (useCamera) => {
    let result;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("İzin Gerekli", "Kamera erişimi verilmedi.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: false,
        exif: false,
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("İzin Gerekli", "Galeri erişimi verilmedi.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: false,
        exif: false,
      });
    }

    if (!result.canceled && result.assets?.length > 0) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setOcrResult(null);
      await scanImage(uri);
    }
  };

  // OCR tarama
  const scanImage = async (uri) => {
    setScanning(true);
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "receipt.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";

      formData.append("file", {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        name: filename,
        type: mimeType,
      });

      const r = await http.post("/api/expenses/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      const ocr = r.data.ocr_result;
      setOcrResult(ocr);
      setImageFilename(r.data.image_filename);

      // ─── Çoklu KDV satırlarını doldur ───
      if (ocr.vat_items && ocr.vat_items.length > 0) {
        // Backend'den gelen çoklu KDV satırları
        const lines = ocr.vat_items.map((item) => ({
          vat_rate: item.vat_rate ?? 20,
          total_amount: item.total_amount?.toString() || "",
          net_amount: item.net_amount?.toString() || "",
          vat_amount: item.vat_amount?.toString() || "",
        }));
        setVatLines(lines);
      } else if (ocr.vat_rate != null) {
        // Tek KDV oranı (eski format)
        setVatLines([{
          vat_rate: ocr.vat_rate ?? 20,
          total_amount: ocr.total_amount?.toString() || "",
          net_amount: ocr.net_amount?.toString() || "",
          vat_amount: ocr.vat_amount?.toString() || "",
        }]);
      } else {
        setVatLines([{ vat_rate: 20, total_amount: "", net_amount: "", vat_amount: "" }]);
      }

      // ─── İş yeri, tarih, fiş no ───
      setVendorName(ocr.vendor_name || "");
      setReceiptNumber(ocr.receipt_number || "");
      setReceiptDate(ocr.receipt_date || "");

      // ─── Kategori otomatik seçim ───
      if (ocr.category) {
        const catLower = ocr.category.toLowerCase();
        // Market kategorisi varsa directly
        const matched = CATEGORIES.find((c) => c.value === catLower);
        if (matched) {
          setCategory(matched.value);
        } else {
          // Kırtasiye → market (market içinde kırtasiye varsa market olarak kalır)
          if (catLower === "kırtasiye" || catLower === "kirtasiye" || catLower === "ofis") {
            // Market fişinde kırtasiye varsa market olarak göster
            const isMarket = vendorName.toLowerCase().includes("market") ||
              vendorName.toLowerCase().includes("bim") ||
              vendorName.toLowerCase().includes("a101") ||
              vendorName.toLowerCase().includes("şok") ||
              vendorName.toLowerCase().includes("migros") ||
              vendorName.toLowerCase().includes("carrefour") ||
              vendorName.toLowerCase().includes("edio");
            setCategory(isMarket ? "market" : "malzeme");
          } else {
            setCategory(catLower);
          }
        }
      }

      if (ocr.suggestion) {
        Alert.alert("OCR Bilgisi", ocr.suggestion);
      }
    } catch (e) {
      console.log("OCR hatası:", JSON.stringify(e?.response?.data || e?.message || e));
      const msg = e?.response?.data?.detail
        || e?.message
        || "Fotoğraf işlenirken bir hata oluştu. Tekrar deneyin.";
      Alert.alert("Hata", msg);
    } finally {
      setScanning(false);
    }
  };

  // Kaydet
  const saveExpense = async () => {
    if (vatLines.length === 0) {
      return Alert.alert("Hata", "En az bir KDV satırı ekleyin.");
    }

    const totalAmount = parseFloat(getTotal());
    if (!totalAmount || totalAmount <= 0) {
      return Alert.alert("Hata", "Tutar girin.");
    }

    // Birden fazla KDV oranı varsa `vat_items` olarak gönder
    const payload = {
      image_filename: imageFilename || "",
      total_amount: totalAmount,
      net_amount: parseFloat(getTotalNet()) || null,
      vat_rate: vatLines.length === 1 ? vatLines[0].vat_rate : null,
      vat_amount: parseFloat(getTotalVat()) || null,
      vendor_name: vendorName,
      receipt_number: receiptNumber,
      receipt_date: receiptDate || undefined,
      category,
      description,
    };

    // Çoklu KDV satırı varsa ekle
    if (vatLines.length > 1) {
      payload.vat_items = vatLines.map((l) => ({
        vat_rate: l.vat_rate,
        total_amount: parseFloat(l.total_amount) || 0,
        net_amount: parseFloat(l.net_amount) || 0,
        vat_amount: parseFloat(l.vat_amount) || 0,
      }));
    }

    setSaving(true);
    try {
      await http.post("/api/expenses/from-scan", payload);
      Alert.alert("✅ Kaydedildi", "Gider başarıyla kaydedildi!", [
        { text: "Tamam", onPress: () => reset() },  // ← goBack yerine reset
      ]);
    } catch (e) {
      Alert.alert("Hata", e.response?.data?.detail || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  // Sıfırla
  const reset = () => {
    setImageUri(null);
    setOcrResult(null);
    setImageFilename(null);
    setVatLines([]);
    setVendorName("");
    setReceiptNumber("");
    setReceiptDate("");
    setCategory("diğer");
    setDescription("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Fotoğraf Yoksa */}
        {!imageUri && (
          <View style={styles.pickSection}>
            <Text style={styles.title}>📷 Fiş Fotoğrafı Çek</Text>
            <Text style={styles.subtitle}>
              Makbuz veya fişin fotoğrafını çekin, sistem otomatik okusun
            </Text>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => pickImage(true)}>
              <Text style={styles.cameraBtnIcon}>📸</Text>
              <Text style={styles.cameraBtnText}>Fotoğraf Çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(false)}>
              <Text style={styles.galleryBtnText}>🖼️ Galeriden Seç</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fotoğraf Var */}
        {imageUri && (
          <>
            {/* Fotoğrafa tıkla → tam ekran + zoom */}
            <TouchableOpacity onPress={() => setPhotoModalVisible(true)} activeOpacity={0.8}>
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
              <Text style={styles.previewHint}>👁️ Dokunarak büyütebilirsiniz</Text>
            </TouchableOpacity>

            {scanning && (
              <View style={styles.scanningBox}>
                <ActivityIndicator size="large" color="#0284C7" />
                <Text style={styles.scanningText}>Fiş okunuyor...</Text>
              </View>
            )}

            {/* OCR Sonuç Formu */}
            {!scanning && (
              <View style={styles.form}>
                {/* Güven Skoru */}
                {ocrResult && (
                  <View style={styles.confidenceBox}>
                    <Text style={styles.confidenceLabel}>OCR Doğruluk</Text>
                    <Text style={styles.confidenceValue}>
                      %{Math.round(ocrResult.confidence || 0)}
                    </Text>
                  </View>
                )}

                {/* İş Yeri */}
                <Text style={styles.label}>İş Yeri Adı</Text>
                <TextInput
                  style={styles.input}
                  value={vendorName}
                  onChangeText={setVendorName}
                  placeholder="İş yeri adı"
                />

                {/* Fiş / Belge Numarası */}
                <Text style={styles.label}>Fiş / Belge Numarası</Text>
                <TextInput
                  style={styles.input}
                  value={receiptNumber}
                  onChangeText={setReceiptNumber}
                  placeholder="Fiş numarası"
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

                {/* Toplam Bilgi Kutusu */}
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
                        ℹ️ {vatLines.length} farklı KDV oranı bulundu
                      </Text>
                    )}
                  </View>
                )}

                {/* Tarih */}
                <Text style={styles.label}>Fiş Tarihi (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={receiptDate}
                  onChangeText={setReceiptDate}
                  placeholder="2026-08-25"
                />

                {/* Kategori */}
                <Text style={styles.label}>Kategori</Text>
                <View style={styles.catGrid}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      style={[
                        styles.catBtn,
                        category === c.value && styles.catBtnActive,
                      ]}
                      onPress={() => setCategory(c.value)}
                    >
                      <Text
                        style={[
                          styles.catBtnText,
                          category === c.value && styles.catBtnTextActive,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Açıklama */}
                <Text style={styles.label}>Açıklama (Opsiyonel)</Text>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Not ekle..."
                  multiline
                />

                {/* Butonlar */}
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.resetBtn} onPress={reset}>
                    <Text style={styles.resetBtnText}>↩️ Sıfırla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={saveExpense}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? "Kaydediliyor..." : "✅ Kaydet"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Fotoğraf Tam Ekran Zoom Modal */}
      <ZoomableImage
        uri={imageUri}
        visible={photoModalVisible}
        onClose={() => setPhotoModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  scroll: { padding: 20 },
  pickSection: { alignItems: "center", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", color: "#0F172A", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 30 },
  cameraBtn: {
    backgroundColor: "#0284C7", borderRadius: 16, paddingVertical: 24,
    paddingHorizontal: 48, alignItems: "center", marginBottom: 16,
  },
  cameraBtnIcon: { fontSize: 40, marginBottom: 8 },
  cameraBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  galleryBtn: {
    backgroundColor: "#fff", borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 32, borderWidth: 1, borderColor: "#E2E8F0",
  },
  galleryBtnText: { fontSize: 16, color: "#0F172A", fontWeight: "500" },
  preview: { width: "100%", height: 200, borderRadius: 12, marginBottom: 4, backgroundColor: "#E2E8F0" },
  previewHint: { fontSize: 12, color: "#94A3B8", textAlign: "center", marginBottom: 12 },
  scanningBox: { alignItems: "center", paddingVertical: 20 },
  scanningText: { color: "#0284C7", marginTop: 8, fontSize: 15 },
  form: { marginTop: 4 },
  confidenceBox: {
    backgroundColor: "#F0F9FF", borderRadius: 12, padding: 12,
    flexDirection: "row", justifyContent: "space-between", marginBottom: 16,
    borderWidth: 1, borderColor: "#BAE6FD",
  },
  confidenceLabel: { color: "#0284C7", fontSize: 13, fontWeight: "500" },
  confidenceValue: { color: "#0284C7", fontSize: 15, fontWeight: "bold" },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 12 },
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
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", marginBottom: 4,
  },
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
  btnRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  resetBtn: {
    flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  resetBtnText: { color: "#64748B", fontWeight: "600" },
  saveBtn: {
    flex: 2, padding: 14, borderRadius: 12, backgroundColor: "#059669",
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
