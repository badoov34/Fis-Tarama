#!/bin/bash
# ============================================================================
# Veritabanı Geri Yükleme Scripti
#
# Belirli bir yedek dosyasından veritabanını geri yükler.
#
# Kullanım:
#   docker compose exec backup /app/scripts/restore.sh fis_tarama_20260828_120000.sql.gz
# ============================================================================

set -e

BACKUP_DIR="/backups"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-fis_tarama}"
DB_USER="${DB_USER:-fis_user}"

if [ -z "$1" ]; then
  echo "❌ Kullanım: restore.sh <yedek_dosya_adi>"
  echo ""
  echo "📋 Mevcut yedekler:"
  ls -lh "${BACKUP_DIR}"/fis_tarama_*.sql.gz 2>/dev/null | awk '{print "   " $NF}' || echo "   (yedek bulunamadı)"
  exit 1
fi

BACKUP_FILE="${BACKUP_DIR}/$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Yedek dosyası bulunamadı: ${BACKUP_FILE}"
  exit 1
fi

echo "⚠️  DİKKAT: Bu işlem mevcut veritabanının TÜM verisini silecek!"
echo "   Yedek dosyası: $1"
echo "   Hedef veritabanı: ${DB_NAME}"
echo ""
read -p "Devam etmek istiyor musunuz? (evet/hayır): " CONFIRM

if [ "$CONFIRM" != "evet" ]; then
  echo "İptal edildi."
  exit 0
fi

echo "🔄 Veritabanı geri yükleniyor..."

# Mevcut veritabanını temizle
PGPASSWORD="${DB_PASSWORD:-fis_sifre}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
  -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" \
  2>/dev/null

# Yedeği geri yükle
gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD:-fis_sifre}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -q 2>/dev/null

echo "✅ Veritabanı başarıyla geri yüklendi: $1"
