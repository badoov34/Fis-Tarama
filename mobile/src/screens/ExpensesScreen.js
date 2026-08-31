/**
 * Gider Listesi — Çoklu seçim, gelişmiş filtre, toplu işlem desteği.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http, { fmtTL, fmtDate, fmtVat } from "../lib/api";

const CATEGORIES = {
  market: "🛒", akaryakıt: "⛽", yemek: "🍽️", ulaşım: "🚗", kira: "🏠", personel: "👥",
  malzeme: "📦", faturalar: "📄", telefon: "📱", internet: "🌐", bakım: "🔧",
  temizlik: "🧹", reklam: "📢", sigorta: "🛡️", vergi: "💰", diğer: "📋",
};

const CATEGORY_LABELS = {
  market: "Market", akaryakıt: "Akaryakıt", yemek: "Yemek", ulaşım: "Ulaşım",
  kira: "Kira", personel: "Personel", malzeme: "Malzeme", faturalar: "Faturalar",
  telefon: "Telefon", internet: "İnternet", bakım: "Bakım", temizlik: "Temizlik",
  reklam: "Reklam", sigorta: "Sigorta", vergi: "Vergi", diğer: "Diğer",
};

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function ExpensesScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // ─── Çoklu seçim modu ───
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ─── Filtre modalı ───
  const [filterVisible, setFilterVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // ─── Kategori değiştir modalı ───
  const [catModalVisible, setCatModalVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year: selectedMonth.year, month: selectedMonth.month };
      if (searchText) params.search = searchText;
      if (filterCategory) params.category = filterCategory;
      if (filterMinAmount) params.min_amount = parseFloat(filterMinAmount);
      if (filterMaxAmount) params.max_amount = parseFloat(filterMaxAmount);
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const r = await http.get("/api/expenses", { params });
      setExpenses(r.data);
      setTotal(r.data.reduce((s, e) => s + (e.total_amount || 0), 0));
    } catch (e) {
      console.log("Hata:", e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, searchText, filterCategory, filterMinAmount, filterMaxAmount, filterDateFrom, filterDateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => load());
    return unsubscribe;
  }, [navigation, load]);

  // Aktif filtre sayısını hesapla
  useEffect(() => {
    let count = 0;
    if (searchText) count++;
    if (filterCategory) count++;
    if (filterMinAmount) count++;
    if (filterMaxAmount) count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    setActiveFilterCount(count);
  }, [searchText, filterCategory, filterMinAmount, filterMaxAmount, filterDateFrom, filterDateTo]);

  const prevMonth = () => setSelectedMonth(p => p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setSelectedMonth(p => p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 });

  // ─── Çoklu seçim ───
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === expenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(expenses.map(e => e.id)));
    }
  };

  // ─── Toplu sil ───
  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Toplu Sil",
      `${selectedIds.size} gider çöp kutusuna taşınacak.`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil", style: "destructive",
          onPress: async () => {
            try {
              await http.post("/api/expenses/bulk/delete", { ids: Array.from(selectedIds) });
              setSelectedIds(new Set());
              setSelectMode(false);
              load();
            } catch (e) {
              Alert.alert("Hata", "Toplu silme başarısız.");
            }
          },
        },
      ]
    );
  };

  // ─── Toplu kategori değiştir ───
  const bulkChangeCategory = (newCat) => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Kategori Değiştir",
      `${selectedIds.size} gider "${CATEGORY_LABELS[newCat] || newCat}" kategorisine taşınacak.`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Değiştir",
          onPress: async () => {
            try {
              await http.post("/api/expenses/bulk/category", {
                ids: Array.from(selectedIds),
                category: newCat,
              });
              setSelectedIds(new Set());
              setSelectMode(false);
              setCatModalVisible(false);
              load();
            } catch (e) {
              Alert.alert("Hata", "Kategori güncellenemedi.");
            }
          },
        },
      ]
    );
  };

  // ─── Filtreleri temizle ───
  const clearFilters = () => {
    setSearchText("");
    setFilterCategory("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterVisible(false);
  };

  // ─── Tek sil ───
  const deleteExpense = (id, name) => {
    Alert.alert("Sil", `"${name}" çöp kutusuna taşınacak.\nGeri yükleyebilirsiniz.`, [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil", style: "destructive",
        onPress: async () => {
          try { await http.delete(`/api/expenses/${id}`); load(); }
          catch (e) { Alert.alert("Hata", "Silinemedi."); }
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

        {/* Toplam + Aksiyonlar */}
        <View style={styles.totalCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Toplam Gider</Text>
            <Text style={styles.totalAmount}>{fmtTL(total)}</Text>
            <Text style={styles.totalCount}>{expenses.length} kayıt</Text>
          </View>
          <View style={styles.actionBtns}>
            {/* Filtre butonu */}
            <TouchableOpacity
              style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
              onPress={() => setFilterVisible(true)}
            >
              <Text style={styles.filterBtnText}>
                🔍 {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
              </Text>
            </TouchableOpacity>
            {/* Çoklu seçim butonu */}
            <TouchableOpacity
              style={[styles.filterBtn, selectMode && styles.filterBtnActive]}
              onPress={toggleSelectMode}
            >
              <Text style={styles.filterBtnText}>
                {selectMode ? "✕ İptal" : "☑️ Seç"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toplu işlem barı */}
        {selectMode && (
          <View style={styles.bulkBar}>
            <TouchableOpacity onPress={selectAll} style={styles.bulkBtn}>
              <Text style={styles.bulkBtnText}>
                {selectedIds.size === expenses.length ? "✕ Hiçbirini Seçme" : "✅ Tümünü Se"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.bulkCount}>{selectedIds.size} seçili</Text>
            <TouchableOpacity
              style={[styles.bulkActionBtn, selectedIds.size === 0 && styles.bulkDisabled]}
              onPress={bulkDelete}
              disabled={selectedIds.size === 0}
            >
              <Text style={styles.bulkActionText}>🗑️ Sil</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, selectedIds.size === 0 && styles.bulkDisabled]}
              onPress={() => setCatModalVisible(true)}
              disabled={selectedIds.size === 0}
            >
              <Text style={styles.bulkActionText}>🏷️ Kategori</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Arama çubuğu (aktif filtre varsa) */}
        {activeFilterCount > 0 && !filterVisible && (
          <View style={styles.activeFiltersBar}>
            <Text style={styles.activeFiltersText}>
              🔍 {activeFilterCount} filtre aktif
            </Text>
            <TouchableOpacity onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Temizle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Liste */}
        {loading ? (
          <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 30 }} />
        ) : expenses.length === 0 ? (
          <Text style={styles.emptyText}>Bu ay için gider yok.</Text>
        ) : (
          expenses.map((exp) => {
            const isSelected = selectedIds.has(exp.id);
            return (
              <View key={exp.id} style={[styles.card, isSelected && styles.cardSelected]}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() => selectMode ? toggleSelect(exp.id) : navigation.navigate("ExpenseDetail", { id: exp.id })}
                  onLongPress={() => { if (!selectMode) { setSelectMode(true); setSelectedIds(new Set([exp.id])); } }}
                >
                  {selectMode && (
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      <Text style={styles.checkmark}>{isSelected ? "✓" : ""}</Text>
                    </View>
                  )}
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
                {!selectMode && (
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
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ═══ FİLTRE MODALI ═══ */}
      <Modal visible={filterVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔍 Filtrele</Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Metin Araması */}
              <Text style={styles.filterLabel}>İş Yeri / Açıklama / Fiş No / VKN</Text>
              <TextInput
                style={styles.filterInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Arama yapın..."
              />

              {/* Kategori */}
              <Text style={styles.filterLabel}>Kategori</Text>
              <View style={styles.categoryGrid}>
                <TouchableOpacity
                  style={[styles.catChip, !filterCategory && styles.catChipActive]}
                  onPress={() => setFilterCategory("")}
                >
                  <Text style={[styles.catChipText, !filterCategory && styles.catChipTextActive]}>Tümü</Text>
                </TouchableOpacity>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.catChip, filterCategory === key && styles.catChipActive]}
                    onPress={() => setFilterCategory(filterCategory === key ? "" : key)}
                  >
                    <Text style={[styles.catChipText, filterCategory === key && styles.catChipTextActive]}>
                      {CATEGORIES[key]} {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tutar Aralığı */}
              <Text style={styles.filterLabel}>Tutar Aralığı (₺)</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.filterInput, { flex: 1 }]}
                  value={filterMinAmount}
                  onChangeText={setFilterMinAmount}
                  placeholder="Min"
                  keyboardType="numeric"
                />
                <Text style={{ marginHorizontal: 8, color: "#64748B" }}>-</Text>
                <TextInput
                  style={[styles.filterInput, { flex: 1 }]}
                  value={filterMaxAmount}
                  onChangeText={setFilterMaxAmount}
                  placeholder="Max"
                  keyboardType="numeric"
                />
              </View>

              {/* Tarih Aralığı */}
              <Text style={styles.filterLabel}>Tarih Aralığı</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.filterInput, { flex: 1 }]}
                  value={filterDateFrom}
                  onChangeText={setFilterDateFrom}
                  placeholder="Başlangıç (YYYY-MM-DD)"
                />
                <Text style={{ marginHorizontal: 8, color: "#64748B" }}>-</Text>
                <TextInput
                  style={[styles.filterInput, { flex: 1 }]}
                  value={filterDateTo}
                  onChangeText={setFilterDateTo}
                  placeholder="Bitiş (YYYY-MM-DD)"
                />
              </View>
            </ScrollView>

            {/* Butonlar */}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Text style={styles.clearBtnText}>Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => { setFilterVisible(false); }}
              >
                <Text style={styles.applyBtnText}>Uygula ({expenses.length} sonuç)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ KATEGORİ DEĞİŞTİR MODALI ═══ */}
      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏷️ Kategori Seç ({selectedIds.size} gider)</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.categoryGrid}>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={styles.catChip}
                  onPress={() => bulkChangeCategory(key)}
                >
                  <Text style={styles.catChipText}>{CATEGORIES[key]} {label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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

  // Toplam kartı
  totalCard: {
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#FCD34D", flexDirection: "row", alignItems: "center",
  },
  totalLabel: { color: "#92400E", fontSize: 12, fontWeight: "500" },
  totalAmount: { color: "#92400E", fontSize: 24, fontWeight: "bold", marginTop: 4 },
  totalCount: { color: "#92400E", fontSize: 12, marginTop: 2 },
  actionBtns: { flexDirection: "row", gap: 6 },
  filterBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  filterBtnActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  filterBtnText: { fontSize: 13, color: "#0F172A" },

  // Toplu işlem barı
  bulkBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF",
    borderRadius: 10, padding: 10, marginBottom: 12, gap: 8,
  },
  bulkBtn: { paddingVertical: 4, paddingHorizontal: 10 },
  bulkBtnText: { fontSize: 13, color: "#0284C7", fontWeight: "600" },
  bulkCount: { fontSize: 13, color: "#64748B", flex: 1, textAlign: "center" },
  bulkActionBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  bulkDisabled: { opacity: 0.4 },
  bulkActionText: { fontSize: 13 },

  // Aktif filtre barı
  activeFiltersBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#EEF2FF", borderRadius: 8, padding: 10, marginBottom: 12,
  },
  activeFiltersText: { fontSize: 13, color: "#4338CA" },
  clearFiltersText: { fontSize: 13, color: "#EF4444", fontWeight: "600" },

  // Kartlar
  emptyText: { color: "#94A3B8", textAlign: "center", marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  cardSelected: { borderColor: "#0284C7", backgroundColor: "#EFF6FF" },
  cardMain: { flexDirection: "row", alignItems: "center", padding: 14 },
  cardActions: {
    flexDirection: "row", justifyContent: "flex-end", gap: 8,
    paddingHorizontal: 14, paddingBottom: 10,
  },
  editBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: "#EFF6FF" },
  editBtnText: { fontSize: 14 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: "#FEF2F2" },
  deleteBtnText: { fontSize: 14 },

  // Checkbox
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#CBD5E1",
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  checkboxChecked: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  icon: { fontSize: 28, marginRight: 12 },
  cardInfo: { flex: 1 },
  cardVendor: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  cardDate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  cardDesc: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  cardRight: { alignItems: "flex-end" },
  cardAmount: { fontSize: 16, fontWeight: "bold", color: "#EF4444" },
  cardVat: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },
  modalClose: { fontSize: 24, color: "#64748B" },

  // Filtre
  filterLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 12, marginBottom: 6 },
  filterInput: {
    borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: "#F8FAFC",
  },
  amountRow: { flexDirection: "row", alignItems: "center" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0",
  },
  catChipActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  catChipText: { fontSize: 12, color: "#374151" },
  catChipTextActive: { color: "#fff" },

  // Modal butonları
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  clearBtn: {
    flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  clearBtnText: { fontSize: 15, color: "#64748B", fontWeight: "600" },
  applyBtn: {
    flex: 2, padding: 14, borderRadius: 10, backgroundColor: "#0284C7",
    alignItems: "center",
  },
  applyBtnText: { fontSize: 15, color: "#fff", fontWeight: "600" },
});
