/**
 * Profil Ekranı — Kullanıcı bilgileri, avatar, firma ismi, çıkış.
 */
import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Image, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import http, { API_BASE } from "../lib/api";

export default function ProfileScreen({ onLogout, navigation }) {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const r = await http.get("/api/auth/me");
      setUser(r.data);
      setName(r.data.name || "");
      setCompanyName(r.data.company_name || "");
      // Local storage'ı da güncelle
      await SecureStore.setItemAsync("user", JSON.stringify(r.data));
    } catch (e) {
      Alert.alert("Hata", "Profil yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      return Alert.alert("Hata", "İsim boş olamaz.");
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("company_name", companyName.trim());

      const r = await http.put("/api/auth/me", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (r.data.ok) {
        setUser(r.data.user);
        await SecureStore.setItemAsync("user", JSON.stringify(r.data.user));
        Alert.alert("✅", "Profil güncellendi.");
      }
    } catch (e) {
      Alert.alert("Hata", e.response?.data?.detail || "Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      return Alert.alert("İzin", "Galeri izni gerekli.");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      const filename = asset.uri.split("/").pop() || "avatar.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
      formData.append("file", {
        uri: asset.uri,
        name: filename,
        type: ext === "png" ? "image/png" : "image/jpeg",
      });

      const r = await http.post("/api/auth/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (r.data.ok) {
        const updatedUser = { ...user, avatar_url: r.data.avatar_url };
        setUser(updatedUser);
        await SecureStore.setItemAsync("user", JSON.stringify(updatedUser));
        Alert.alert("✅", "Avatar güncellendi.");
      }
    } catch (e) {
      Alert.alert("Hata", "Avatar yüklenemedi.");
    } finally {
      setAvatarLoading(false);
    }
  };

  const removeAvatar = async () => {
    Alert.alert("Avatar Kaldır", "Profil fotoğrafı silinecek.", [
      { text: "İptal", style: "cancel" },
      {
        text: "Kaldır",
        style: "destructive",
        onPress: async () => {
          try {
            await http.delete("/api/auth/me/avatar");
            const updatedUser = { ...user, avatar_url: "" };
            setUser(updatedUser);
            await SecureStore.setItemAsync("user", JSON.stringify(updatedUser));
          } catch (e) {
            Alert.alert("Hata", "Silinemedi.");
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Çıkış Yap", "Hesabınızdan çıkış yapılacak.", [
      { text: "İptal", style: "cancel" },
      {
        text: "Çıkış Yap",
        style: "destructive",
        onPress: onLogout,
      },
    ]);
  };

  const avatarUrl = user?.avatar_url
    ? `${API_BASE}${user.avatar_url}`
    : null;

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
        <Text style={styles.screenTitle}>👤 Profil</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarContainer}>
            {avatarLoading ? (
              <ActivityIndicator size="large" color="#0284C7" />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {name ? name.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </View>
          </TouchableOpacity>
          {avatarUrl && (
            <TouchableOpacity onPress={removeAvatar}>
              <Text style={styles.removeAvatarText}>Fotoğrafı Kaldır</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Ad Soyad</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Adınız Soyadınız"
          />

          <Text style={styles.label}>Firma / Şirket İsmi</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Raporlarda görünecek firma ismi"
          />

          <Text style={styles.label}>E-posta</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={user?.email || ""}
            editable={false}
            placeholder="E-posta"
          />
          <Text style={styles.hint}>E-posta adresi değiştirilemez.</Text>

          {/* Kaydet */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Kaydediliyor..." : "💾 Değişiklikleri Kaydet"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hesap Bilgisi */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ Hesap Bilgisi</Text>
          <InfoRow label="Kayıt Tarihi" value={user?.created_at?.slice(0, 10) || "-"} />
          <InfoRow label="Kullanıcı ID" value={user?.id?.slice(0, 8) || "-"} />
        </View>

        {/* Kategoriler */}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => navigation?.navigate("Categories")}
        >
          <Text style={styles.menuBtnText}>🏷️ Kategorileri Yönet</Text>
        </TouchableOpacity>

        {/* Çıkış */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>🚪 Çıkış Yap</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Fiş Tarama v1.0</Text>
      </ScrollView>
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
  scroll: { padding: 20, paddingBottom: 40 },
  screenTitle: { fontSize: 24, fontWeight: "bold", color: "#0F172A", marginBottom: 20 },

  avatarSection: { alignItems: "center", marginBottom: 24 },
  avatarContainer: { position: "relative" },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#0284C7", justifyContent: "center", alignItems: "center",
  },
  avatarPlaceholderText: { color: "#fff", fontSize: 36, fontWeight: "bold" },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    backgroundColor: "#fff", borderRadius: 14, width: 28, height: 28,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "#E2E8F0",
  },
  avatarEditIcon: { fontSize: 14 },
  removeAvatarText: { color: "#EF4444", fontSize: 13, marginTop: 8 },

  form: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
    borderRadius: 12, padding: 14, fontSize: 16, color: "#0F172A",
  },
  inputDisabled: { backgroundColor: "#F1F5F9", color: "#94A3B8" },
  hint: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  saveBtn: {
    backgroundColor: "#0284C7", borderRadius: 12, padding: 16,
    alignItems: "center", marginTop: 20,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  infoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  infoTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
  },
  infoLabel: { color: "#64748B", fontSize: 13 },
  infoValue: { color: "#0F172A", fontSize: 13, fontWeight: "500" },

  menuBtn: {
    backgroundColor: "#EFF6FF", borderRadius: 12, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#BFDBFE", marginBottom: 12,
  },
  menuBtnText: { color: "#0284C7", fontWeight: "600", fontSize: 15 },

  logoutBtn: {
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#FECACA",
  },
  logoutBtnText: { color: "#DC2626", fontWeight: "bold", fontSize: 16 },

  version: { color: "#CBD5E1", textAlign: "center", marginTop: 24, fontSize: 12 },
});
