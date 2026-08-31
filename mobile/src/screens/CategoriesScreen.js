/**
 * Kategoriler — Özel kategorileri yönet, sil, oluştur.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import http from "../lib/api";

const ICON_OPTIONS = ["🛒", "⛽", "🍽️", "🚗", "🏢", "👥", "📦", "💡", "📱", "🌐", "🔧", "🧹", "📢", "🛡️", "🏛️", "📁", "🎓", "🏥", "💼", "🎵", "🏋️", "✈️", "🏠", "🐾", "🎮"];

export default function CategoriesScreen() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📁");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await http.get("/api/categories");
      setCategories(r.data);
    } catch (e) {
      console.log("Hata:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    const name = newName.trim().toLowerCase();
    if (!name) return Alert.alert("Hata", "Kategori adı girin.");
    if (name.length < 2) return Alert.alert("Hata", "En az 2 karakter.");

    try {
      await http.post("/api/categories", { name, icon: newIcon });
      setNewName("");
      setNewIcon("📁");
      setShowAdd(false);
      load();
    } catch (e) {
      Alert.alert("Hata", e.response?.data?.detail || "Eklenemedi.");
    }
  };

  const deleteCategory = (cat) => {
    if (cat.is_default) return Alert.alert("Bilgi", "Varsayılan kategoriler silinemez.");
    Alert.alert("Sil", `"${cat.name}" kategorisi silinecek.`, [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil", style: "destructive",
        onPress: async () => {
          try {
            await http.delete(`/api/categories/${cat.id}`);
            load();
          } catch (e) {
            Alert.alert("Hata", "Silinemedi.");
          }
        },
      },
    ]);
  };

  const defaultCats = categories.filter(c => c.is_default);
  const customCats = categories.filter(c => !c.is_default);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>🏷️ Kategoriler</Text>

        {/* Yeni kategori ekle */}
        {showAdd ? (
          <View style={styles.addBox}>
            <Text style={styles.label}>Kategori Adı</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Örn: ilaç, kırtasiye..."
            />
            <Text style={styles.label}>İkon Seç</Text>
            <View style={styles.iconGrid}>
              {ICON_OPTIONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconBtn, newIcon === icon && styles.iconBtnActive]}
                  onPress={() => setNewIcon(icon)}
                >
                  <Text style={styles.iconBtnText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.addBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addCategory}>
                <Text style={styles.saveBtnText}>➕ Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addNewBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addNewBtnText}>+ Yeni Kategori Ekle</Text>
          </TouchableOpacity>
        )}

        {/* Sistem Kategorileri */}
        <Text style={styles.sectionTitle}>📋 Varsayılan Kategoriler ({defaultCats.length})</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#0284C7" />
        ) : (
          defaultCats.map((cat) => (
            <View key={cat.id} style={styles.card}>
              <Text style={styles.cardIcon}>{cat.icon || "📁"}</Text>
              <Text style={styles.cardName}>{cat.name}</Text>
              <Text style={styles.badge}>Sistem</Text>
            </View>
          ))
        )}

        {/* Özel Kategoriler */}
        <Text style={styles.sectionTitle}>⭐ Özel Kategoriler ({customCats.length})</Text>
        {customCats.length === 0 ? (
          <Text style={styles.emptyText}>Henüz özel kategori yok.</Text>
        ) : (
          customCats.map((cat) => (
            <View key={cat.id} style={styles.card}>
              <Text style={styles.cardIcon}>{cat.icon || "📁"}</Text>
              <Text style={styles.cardName}>{cat.name}</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCategory(cat)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
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
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#64748B", marginTop: 20, marginBottom: 10 },

  // Yeni kategori ekleme
  addNewBtn: {
    backgroundColor: "#EFF6FF", borderRadius: 12, padding: 16, alignItems: "center",
    borderWidth: 1, borderColor: "#BFDBFE", borderStyle: "dashed",
  },
  addNewBtnText: { fontSize: 15, color: "#0284C7", fontWeight: "600" },

  addBox: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: "#F8FAFC",
  },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 8, backgroundColor: "#F1F5F9",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E2E8F0",
  },
  iconBtnActive: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  iconBtnText: { fontSize: 20 },
  addBtns: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center" },
  cancelBtnText: { fontSize: 14, color: "#64748B", fontWeight: "600" },
  saveBtn: { flex: 2, padding: 12, borderRadius: 8, backgroundColor: "#0284C7", alignItems: "center" },
  saveBtnText: { fontSize: 14, color: "#fff", fontWeight: "600" },

  // Kartlar
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#E2E8F0",
  },
  cardIcon: { fontSize: 24, marginRight: 12 },
  cardName: { flex: 1, fontSize: 15, fontWeight: "500", color: "#0F172A", textTransform: "capitalize" },
  badge: {
    fontSize: 11, color: "#64748B", backgroundColor: "#F1F5F9",
    paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10,
  },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 16 },
  emptyText: { color: "#94A3B8", textAlign: "center", marginTop: 16, fontSize: 14 },
});
