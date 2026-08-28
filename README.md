# 📄 Fiş Tarama & Gider Takip Uygulaması

Fiş/makbuz fotoğraflarını tarayarak KDV, tutar ve matrah bilgilerini otomatik çıkaran, aylık 10 günlük dönemler halinde Excel/PDF rapor üreten uygulama.

---

## 🎯 Hızlı Başlangıç — Render.com (Önerilen)

**Ücretsiz, kredi kartı gerekmez, 5 dakikada hazır.**

> Detaylı rehber için `RENDER-DEPLOY.md` dosyasını okuyun.

### Özet:
1. GitHub'a kayıt olun → kodu yükleyin
2. Render'a kayıt olun → **New Web Service** seçin
3. GitHub reposunu bağlayın → deploy edin
4. Mobil uygulamadaki API adresini güncelleyin

**Render URL'niz:** `https://fis-tarama-api.onrender.com` olacak.

---

## 🐳 Docker ile Sunucu Kurulumu

### Gereksinimler
- Linux sunucu (Ubuntu 20.04+ önerilir) veya Oracle Cloud VM
- Docker ve Docker Compose kurulu olmalı
- En az 1GB RAM, 500MB disk alanı
- İnternet erişimi (port 8000 açık olmalı)

### Adım 1: Dosyaları Sunucuya Yükle

```bash
# SSH ile sunucuya bağlan
ssh kullaniciadi@SUNUCU_IP_ADRESI

# Proje dizinini oluştur
mkdir -p /opt/fis-tarama
cd /opt/fis-tarama

# Proje dosyalarını buraya yükleyin
# (scp, rsync veya başka bir yöntemle)
# Örnek: scp -r ./fis-tarama/* kullaniciadi@SUNUCU_IP:/opt/fis-tarama/
```

### Adım 2: Güvenlik Ayarları

```bash
# .env dosyasını oluştur
cat > .env << 'EOF'
DATABASE_URL=postgresql://fis_user:fis_sifre@db:5432/fis_tarama
JWT_SECRET=BURAYA_RASTGELE_GUCLU_BIR_SIFRE_YAZIN
HOST=0.0.0.0
PORT=8000
UPLOAD_DIR=/app/uploads
TESSERACT_LANG=tur
EOF

# JWT_SECRET'i değiştirin!
# Rastgele bir şifre üretmek için:
# openssl rand -hex 32
```

### Adım 3: Docker ile Başlat

```bash
# Docker ile build ve başlat
docker compose up -d --build

# Durumunu kontrol et
docker compose ps

# Logları izle (başarılı olduğunu doğrulayın)
docker compose logs -f backend
```

### Adım 4: Çalıştığını Doğrula

```bash
# Sağlık kontrolü
curl http://localhost:8000/health

# Beklenen yanıt:
# {"status":"ok","database":"connected"}

# API docs (tarayıcıda açın)
# http://SUNUCU_IP:8000/docs
```

### Adım 5: Firewall Ayarı

```bash
# UFW ile port açma (Ubuntu)
sudo ufw allow 8000/tcp
sudo ufw reload

# veya iptables ile
sudo iptables -A INPUT -p tcp --dport 8000 -j ACCEPT
```

### Adım 6: Mobil Uygulamaya Sunucu Adresini Gir

Mobil uygulama `mobile/src/lib/api.js` dosyasındaki `API_BASE` değişkenini güncelleyin:

```javascript
const API_BASE = "http://SUNUCU_IP_ADRESI:8000";
```

---

## 🔧 Sorun Giderme

### Docker başlatılamıyor
```bash
# Docker durumunu kontrol et
sudo systemctl status docker

# Yeniden başlat
sudo systemctl restart docker
```

### Veritabanı bağlantı hatası
```bash
# PostgreSQL durumunu kontrol et
docker compose logs db

# Veritabanı bağlantısını test et
docker compose exec db psql -U fis_user -d fis_tarama -c "SELECT 1;"
```

### OCR çalışmıyor
```bash
# Tesseract'ın kurulu olduğunu kontrol et
docker compose exec backend tesseract --version

# Türkçe dil paketi
docker compose exec backend tesseract --list-langs
```

### Port 8000 kullanımda
```bash
# Hangi sürecin kullandığını bul
sudo lsof -i :8000

# Farklı bir port kullanmak için .env'de PORT değerini değiştirin
# ve docker compose.yml'deki port eşlemesini güncelleyin
```

---

## 📊 Dashboard

Ana sayfadaki Dashboard ekranı şu bilgileri gösterir:

- **Özet Kartları:** Toplam gider, matrah, KDV, kayıt sayısı
- **Kategori Dağılımı:** Yatay bar grafiği ile yüzdelik dağılım
- **Dönem Karşılaştırması:** 10 günlük dönemlerin grafiksel karşılaştırması
- **KDV Oranı Dağılımı:** %0, %1, %10, %20 oranlarının dağılımı
- **Bir Önceki Aya Göre Değişim:** Yüzdelik artış/azalış

---

## 🧪 Testler

```bash
# Docker içinde testleri çalıştır
docker-compose exec backend python -m pytest tests/ -v

# Sadece belirli bir test dosyası
docker-compose exec backend python -m pytest tests/test_helpers.py -v

# Hızlı özet
docker-compose exec backend python -m pytest tests/ -v --tb=short
```

---

## 📱 Mobil Uygulama Kurulumu

Geliştirme bilgisi olanlar için:

```bash
cd mobile
npm install
npx expo start
```

> **Not:** Mobil uygulama, `mobile/src/lib/api.js` dosyasındaki `API_BASE` adresine bağlanır.
> Render kullanıyorsanız: `https://fis-tarama-api.onrender.com`
> Sunucu kullanıyorsanız: `http://SUNUCU_IP:8000`

---

## 📊 API Endpoints

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `/api/auth/register` | POST | Yeni kullanıcı kaydı |
| `/api/auth/login` | POST | Kullanıcı girişi |
| `/api/expenses/scan` | POST | Fiş fotoğrafı OCR tarama |
| `/api/expenses` | GET | Giderleri listele |
| `/api/expenses` | POST | Yeni gider ekle |
| `/api/expenses/{id}` | PATCH | Gider güncelle |
| `/api/expenses/{id}` | DELETE | Gider sil |
| `/api/reports/monthly` | GET | Aylık 10 günlük dönem raporu |
| `/api/reports/monthly/excel` | GET | Excel raporu indir |
| `/api/reports/monthly/pdf` | GET | PDF raporu indir |
| `/api/reports/vat-summary` | GET | KDV dökümü |

---

## 📋 Teknoloji

- **Backend:** Python + FastAPI
- **Veritabanı:** PostgreSQL 16
- **OCR:** Google Gemini AI (birincil) + Tesseract (yedek)
- **PDF:** ReportLab (A4 dikey)
- **Excel:** OpenPyXL (A4 dikey, ₺ simgeli)
- **Mobil:** React Native + Expo
- **Grafikler:** react-native-svg (Dashboard)
- **Deploy:** Docker Compose veya Render.com

---

## ⚠️ OCR Notları

**Google Gemini AI (Birincil):**
- Yüksek doğruluk ile OCR yapar (AI tabanlı)
- Ücretsiz plan: 15 istek/dakika
- `GEMINI_API_KEY` ortam değişkeni ile aktif edilir
- Gemini kullanılamıyorsa otomatik olarak Tesseract'a geçer

**Tesseract OCR (Yedek):**
- İnternet gerekmez
- %85-95 doğruluk (kaliteli fişlerde)
- El yazısı veya soluk fişlerde doğruluk düşebilir

Her zaman sonuçları kontrol edip onaylamanız önerilir.

---

*Fiş Tarama & Gider Takip — v1.0.0*
