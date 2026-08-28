# 🚀 Render.com'a Deploy Rehberi

Bu belge, uygulamayı Render.com'a ücretsiz olarak deploy etmek için adım adım rehberdir.

---

## 📋 Gereksinimler

- [GitHub](https://github.com) hesabı (ücretsiz)
- [Render](https://render.com) hesabı (ücretsiz, kredi kartı gerekmez)
- Mobil uygulama (Expo Go ile test edebilirsiniz)

---

## Adım 1: GitHub Reposu Oluşturun

1. https://github.com/new adresine gidin
2. Repo adı: `fis-tarama` yazın
3. **Public** seçin (Render ücretsiz planda sadece public repolara izin verir)
4. **Create repository** butonuna tıklayın

---

## Adım 2: Dosyaları GitHub'a Yükleyin

Bilgisayarınızda `fis-tarama` klasöründe şu komutları çalıştırın:

```bash
cd fis-tarama
git init
git add .
git commit -m "İlk versiyon"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/fis-tarama.git
git push -u origin main
```

> **Not:** `KULLANICI_ADI` kısmını GitHub kullanıcı adınızla değiştirin.

---

## Adım 3: Render'da Veritabanı Oluşturun

1. https://render.com/dashboard adresine gidin
2. **New +** butonuna tıklayın
3. **PostgreSQL** seçin
4. Ayarlar:
   - **Name:** `fis-tarama-db`
   - **Plan:** Free
   - **Database:** `fis_tarama`
   - **User:** `fis_user`
   - **Region:** Frankfurt (EU) — Türkiye'ye en yakın
5. **Create Database** butonuna tıklayın
6. **Connection** bilgilerini kopyalayın (sonra lazım olacak):
   - Internal Database URL
   - External Database URL

---

## Adım 4: Render'da Web Service Oluşturun

1. **New +** butonuna tıklayın
2. **Web Service** seçin
3. GitHub hesabınızı bağlayın (ilk seferde izin istenir)
4. `fis-tarama` reposunu seçin
5. Ayarlar:
   - **Name:** `fis-tarama-api`
   - **Runtime:** Docker
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Docker Context:** `./backend`
   - **Port:** `8000`
   - **Plan:** Free
6. **Advanced** bölümüne gidin, **Environment Variables** ekleyin:

| Anahtar | Değer |
|---------|-------|
| `DATABASE_URL` | Adım 3'ten kopyaladığınız **External Database URL** |
| `JWT_SECRET` | Güçlü bir şifre (örn: `openssl rand -hex 32` ile üretebilirsiniz) |
| `UPLOAD_DIR` | `/app/uploads` |
| `TESSERACT_LANG` | `tur` |
| `ENVIRONMENT` | `production` |

> **Önemli:** `DATABASE_URL` değerinin başında `postgresql://` olduğundan emin olun.
> Eğer `postgres://` ile başlıyorsa, `postgresql://` olarak değiştirin.

7. **Create Web Service** butonuna tıklayın

---

## Adım 5: Deploy'u Bekleyin

1. Render, GitHub'dan kodunuzu indirecek
2. Docker imajını oluşturacak (ilk seferde 5-10 dakika)
3. Uygulamayı başlatacak
4. Size bir URL verecek: `https://fis-tarama-api.onrender.com`

> **İlk deploy 5-10 dakika sürebilir.** Sonraki deploy'lar 2-3 dakikada biter.

---

## Adım 6: Çalıştığını Kontrol Edin

Tarayıcınızda şunları açın:

1. **Ana sayfa:** `https://fis-tarama-api.onrender.com`
   - `{ "app": "Fiş Tarama & Gider Takip", "status": "çalışıyor" }` görmelisiniz

2. **API dokümantasyonu:** `https://fis-tarama-api.onrender.com/docs`
   - Swagger UI açılacaktır

3. **Sağlık kontrolü:** `https://fis-tarama-api.onrender.com/health`
   - `{ "status": "ok" }` görmelisiniz

---

## Adım 7: İlk Kullanıcıyı Oluşturun

API dokümantasyonunda (Adım 6'daki `/docs` adresi):

1. **POST /api/auth/register** endpoint'ine tıklayın
2. **Try it out** butonuna tıklayın
3. Şu bilgileri girin:
   ```json
   {
     "email": "test@example.com",
     "password": "sifre123",
     "name": "Test Kullanıcı"
   }
   ```
4. **Execute** butonuna tıklayın
5. **access_token** değerini kopyalayın

---

## Adım 8: Mobil Uygulamayı Bağlayın

Mobil uygulamadaki `src/lib/api.js` dosyasında API_BASE adresini güncelleyin:

```javascript
const API_BASE = "https://fis-tarama-api.onrender.com";
```

---

## ⚠️ Bilmeniz Gerekenler

### Ücretsiz Plan Limitleri
- **Web Service:** 750 saat/ay (yaklaşık 31 gün 24 saat)
- **PostgreSQL:** 1 GB depolama, 90 gün sonra sona erer
- **Uyuma:** 15 dakika hareketsizlikten sonra uygulama uyur
- **Uyanma:** İlk istekte 30-60 saniye bekleme

### Fotoğraf Saklama
- Render'ın dosya sistemi **geçicidir** (ephemeral)
- Container yeniden başlatıldığında yüklenen fotoğraflar silinir
- **Çözüm:** Fotoğrafları veritabanına kaydedin (sadece URL/base64)
- **Veya:** Render'ın ücretli planına geçin (Persistent Disk)

### Veritabanı Yedekleme
- Render ücretsiz planda otomatik yedekleme **yapmaz**
- Manuel olarak dışa aktarma yapın:
  ```bash
  pg_dump $DATABASE_URL > backup.sql
  ```

---

## 🔧 Sorun Giderme

### "Application failed to respond" hatası
- Deploy loglarını kontrol edin (Render dashboard → Logs)
- ENV variable'ların doğru olduğundan emin olun
- `DATABASE_URL`'in `postgresql://` ile başladığından emin olun

### OCR çalışmıyor
- Tesseract dil paketi yüklenmemiş olabilir
- Dockerfile'daki `tesseract-ocr-tur` paketinin kurulu olduğundan emin olun

### Veritabanı bağlantı hatası
- `DATABASE_URL`'in `?sslmode=require` içerdiğinden emin olun
- Veritabanı servisinin aktif (Active) olduğundan emin olun

---

## 🎯 Sonraki Adımlar

1. **Oracle Cloud'a taşıma:** Arkadaşınızın sunucusuna geçiş yapın
2. **HTTPS ekleme:** Let's Encrypt ile ücretsiz SSL
3. **Fotoğraf depolama:** AWS S3 veya Oracle Object Storage'a geçin
4. **Bildirimler:** Yeni gider eklendiğinde bildirim gönderin

---

## 📞 Yardım

Sorun yaşarsanız:
1. Render dashboard → Logs bölümünü kontrol edin
2. API docs (`/docs`) üzerinden test edin
3. Hata mesajlarını not edin
