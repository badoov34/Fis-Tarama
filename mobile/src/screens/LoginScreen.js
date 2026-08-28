/**
 * Giriş/Kayıt Ekranı — İlk açılışta kullanıcı giriş yapar.
 */
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import http from "../lib/api";

export default function LoginScreen({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      return Alert.alert("Hata", "E-posta ve şifre gerekli.");
    }
    if (isRegister && !name) {
      return Alert.alert("Hata", "İsim gerekli.");
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const r = await http.post(endpoint, {
        email,
        password,
        ...(isRegister ? { name, company_name: companyName } : {}),
      });

      // Token'ı kaydet
      await SecureStore.setItemAsync("auth_token", r.data.access_token);
      await SecureStore.setItemAsync("user", JSON.stringify(r.data.user));

      onLogin(r.data.user);
    } catch (e) {
      Alert.alert("Hata", e.response?.data?.detail || "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.logo}>📄</Text>
          <Text style={styles.title}>Fiş Tarama</Text>
          <Text style={styles.subtitle}>Gider takip ve raporlama</Text>

          <View style={styles.form}>
            {isRegister && (
              <>
                <Text style={styles.label}>Ad Soyad</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Adınız Soyadınız"
                />
                <Text style={styles.label}>Firma İsmi</Text>
                <TextInput
                  style={styles.input}
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Firma veya şirket adı (raporlarda görünür)"
                />
              </>
            )}

            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitBtnText}>
                {loading ? "Lütfen bekleyin..." : isRegister ? "Kayıt Ol" : "Giriş Yap"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
              <Text style={styles.toggleText}>
                {isRegister ? "Zaten hesabınız var mı? Giriş Yap" : "Hesabınız yok mu? Kayıt Ol"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F9" },
  content: { flex: 1, justifyContent: "center", padding: 30 },
  logo: { fontSize: 60, textAlign: "center", marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "bold", color: "#0F172A", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 36 },
  form: {},
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
    borderRadius: 12, padding: 14, fontSize: 16, color: "#0F172A",
  },
  submitBtn: {
    backgroundColor: "#0284C7", borderRadius: 12, padding: 16, alignItems: "center",
    marginTop: 24,
  },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  toggleText: { color: "#0284C7", textAlign: "center", marginTop: 16, fontSize: 14 },
});
