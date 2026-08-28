FROM python:3.11-slim

# Tesseract OCR kur (Türkçe dil desteği dahil — yedek OCR için)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-tur \
    tesseract-ocr-eng \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Çalışma dizini
WORKDIR /app

# Tüm uygulama dosyalarını ÖNCE kopyala (cache kırıcı)
COPY . .

# Python bağımlılıklarını kur (google-generativeai dahil)
RUN pip install --no-cache-dir -r requirements.txt

# Upload klasörünü oluştur
RUN mkdir -p /app/uploads

# Build zaman damgası — her deploy'da farklı olur, cache kırar
ARG BUILD_DATE
RUN echo "Build: ${BUILD_DATE:-$(date)}" > /app/build_info.txt

# Port (Render dinamik PORT atar)
EXPOSE ${PORT:-8000}

# Gunicorn ile başlat (production için)
CMD gunicorn main:app \
    --workers 2 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 120 \
    --access-logfile -
