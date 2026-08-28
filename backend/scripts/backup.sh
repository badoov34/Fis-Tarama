#!/bin/bash
# ============================================================================
# Veritabanı Yedekleme Scripti
#
# Her çalıştırıldığında PostgreSQL veritabanının yedeğini alır.
# Son 7 yedek dosyasını tutar, eskilerini siler.
#
# Kullanım:
#   docker compose exec backup /app/scripts/backup.sh
# veya
#   docker compose run --rm backup
# ============================================================================

set -e

# Yapılandırma
BACKUP_DIR="/backups"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-fis_tarama}"
DB_USER="${DB_USER:-fis_user}"
# Tüm yedekler süresiz saklanır (iş mali müşavirlik için gerekli)

# Tarih damgası
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/fis_tarama_${TIMESTAMP}.sql.gz"

echo "📦 Veritabanı yedeklemesi başlatılıyor..."
echo "   Veritabanı: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "   Hedef: ${BACKUP_FILE}"

# Yedekleme klasörünü oluştur
mkdir -p "${BACKUP_DIR}"

# pg_dump ile yedek al ve sıkıştır
PGPASSWORD="${DB_PASSWORD:-fis_sifre}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  2>/dev/null | gzip > "${BACKUP_FILE}"

# Boyutu göster
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Yedekleme tamamlandı: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Tüm yedekler saklanır (iş mali müşavirlik için gerekli)
echo ""
echo "📋 Mevcut yedekler ($(ls ${BACKUP_DIR}/fis_tarama_*.sql.gz 2>/dev/null | wc -l) adet):"
ls -lh "${BACKUP_DIR}"/fis_tarama_*.sql.gz 2>/dev/null | awk '{print "   " $NF " (" $5 ")"}' || echo "   (henüz yedek yok)"

echo ""
echo "🎉 İşlem tamamlandı!"
