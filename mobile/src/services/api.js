/**
 * API Servisi — Tüm backend çağrıları buradan yapılır.
 */
import http from "../lib/api";

export const ExpenseService = {
  // OCR tarama
  async scanReceipt(imageUri, onProgress) {
    const formData = new FormData();
    const filename = imageUri.split("/").pop() || "receipt.jpg";
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    formData.append("file", {
      uri: imageUri,
      name: filename,
      type: mimeType,
    });

    return http.post("/api/expenses/scan", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });
  },

  // Gider listesi
  async list(year, month, category) {
    return http.get("/api/expenses", { params: { year, month, category } });
  },

  // Gider detayı
  async get(id) {
    return http.get(`/api/expenses/${id}`);
  },

  // OCR'dan gider oluştur (body ile)
  async createFromScan(data) {
    return http.post("/api/expenses/from-scan", data);
  },

  // Manuel gider oluştur
  async create(data) {
    return http.post("/api/expenses", data);
  },

  // Gider güncelle
  async update(id, data) {
    return http.patch(`/api/expenses/${id}`, data);
  },

  // Gider sil
  async delete(id) {
    return http.delete(`/api/expenses/${id}`);
  },
};

export const ReportService = {
  // Aylık rapor
  async getMonthly(year, month) {
    return http.get("/api/reports/monthly", { params: { year, month } });
  },

  // Excel indirme URL'i
  getExcelUrl(year, month) {
    return `${http.defaults.baseURL}/api/reports/monthly/excel?year=${year}&month=${month}`;
  },

  // PDF indirme URL'i
  getPdfUrl(year, month) {
    return `${http.defaults.baseURL}/api/reports/monthly/pdf?year=${year}&month=${month}`;
  },

  // KDV özeti
  async getVatSummary(year, month) {
    return http.get("/api/reports/vat-summary", { params: { year, month } });
  },
};

export const CategoryService = {
  async list() {
    return http.get("/api/expenses/categories/list");
  },

  async create(name) {
    return http.post("/api/expenses/categories", { name });
  },

  async delete(name) {
    return http.delete(`/api/expenses/categories/${encodeURIComponent(name)}`);
  },
};
