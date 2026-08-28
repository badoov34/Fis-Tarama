/**
 * API İstemcisi — Backend ile iletişim.
 *
 * Tüm API çağrıları bu dosyadan yapılır.
 * Sunucu adresi environment variable'dan okunur.
 */
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Ortam değişkeninden veya manuel ayardan API adresini al
// Render deploy: https://fis-tarama-api.onrender.com
// Lokal geliştirme: http://localhost:8000
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:8000" // Android emulator
    : "http://localhost:8000"); // iOS simulator

const http = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60 saniye timeout (OCR için uzun gerekebilir)
  headers: {
    "Content-Type": "application/json",
  },
});

// İstek interceptor'ı — token ekle
http.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Hata interceptor'ı
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token süresi dolmuş — çıkış yap
      SecureStore.deleteItemAsync("auth_token");
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * Türk Lirası formatla.
 * 1250.50 → "1.250,50₺"
 */
export function fmtTL(amount) {
  if (amount == null || isNaN(amount)) return "0,00₺";
  const abs = Math.abs(amount);
  const intPart = Math.floor(abs);
  const decPart = Math.round((abs - intPart) * 100);
  const formatted = intPart.toLocaleString("tr-TR");
  const sign = amount < 0 ? "-" : "";
  return `${sign}${formatted},${decPart.toString().padStart(2, "0")}₺`;
}

/**
 * Tarih formatla.
 * "2026-08-25" → "25/08/2026"
 */
export function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * KDV oranı formatla.
 * 20 → "%20"
 */
export function fmtVat(rate) {
  if (rate == null || rate === 0) return "%0";
  return `%${Math.round(rate)}`;
}

export { API_BASE };
export default http;
