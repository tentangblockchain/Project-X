# 🤖 Project-X LP Daily Analysis Bot

Bot Telegram profesional yang dirancang untuk melacak dan menganalisis posisi **Liquidity Provider (LP)** pada ekosistem Project-X. Memungkinkan pengguna memantau saldo, poin, biaya (fees), dan status rentang harga (price range) secara otomatis melalui database PostgreSQL.

## 🚀 Fitur Unggulan

- **Multi-Account Support**: Kelola banyak akun Project-X dalam satu bot secara terpisah (Akun 1-10).
- **Smart Data Parsing**: Deteksi otomatis data dari copy-paste dashboard Project-X menggunakan AI Groq (Saldo, Points, Fees, Positions).
- **Real-time Analytics**: Laporan mendalam per akun termasuk estimasi pendapatan harian, status *in-range*, dan pertumbuhan YoY.
- **History Tracking**: Pantau pertumbuhan saldo dan poin dengan snapshot harian otomatis untuk analisis tren.
- **Portfolio Summary**: Ringkasan total aset, fees, dan yield dari seluruh akun yang terdaftar.
- **Database Persistence**: Data aman tersimpan di PostgreSQL dengan sistem backup otomatis Replit.
- **Image Support**: Dapat memproses screenshot dashboard Project-X secara langsung dengan vision AI.

## 📱 Menu Utama

### 📊 Input Akun Baru
Menambahkan akun baru atau update data akun yang sudah ada:
- Paste data teks dari dashboard Project-X
- AI otomatis mendeteksi dan parsing semua field (saldo, points, fees, positions)
- Pilih nomor akun untuk menyimpan (1-10)

### 👥 List Akun
Menampilkan daftar lengkap semua akun Anda:
- Lihat saldo dan total points setiap akun
- Klik akun untuk melihat analisa detail

### 💰 Summary
Melihat ringkasan total portfolio:
- Total saldo dari semua akun
- Total points, fees, dan pending yield
- Jumlah akun yang terdaftar

### 📈 Analisa
Analisa mendalam untuk akun pilihan:
- **Growth Metrics**: Perbandingan saldo dan points dengan snapshot sebelumnya
- **Active Positions**: Detail setiap pair LP (size, APR, status in-range)
- **Performance**: Estimasi earning harian, total position value, average APR
- **Rekomendasi**: Saran action berdasarkan pending yield

### 📅 Update History
Panduan untuk update data harian dan melihat pertumbuhan portfolio Anda.

### ❓ Help
Bantuan lengkap cara menggunakan bot.

### ⚠️ Hapus Semua Data
Menghapus seluruh data akun dan history (dengan konfirmasi).

## 🛠️ Teknologi

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Telegraf.js](https://telegraf.js.org/) (Telegram Bot API)
- **AI**: [Groq SDK](https://console.groq.com/) untuk parsing dan vision analysis
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Neon-backed pada Replit)
- **Environment**: Dotenv untuk manajemen secret/API keys

## 📋 Prasyarat

Sebelum menjalankan, pastikan Anda memiliki:
1. **BOT_TOKEN**: Dapatkan dari [@BotFather](https://t.me/botfather) di Telegram
2. **GROQ_API_KEY**: Dapatkan dari [Groq Console](https://console.groq.com/) untuk AI parsing (free tier tersedia)
3. **DATABASE_URL**: String koneksi PostgreSQL (Otomatis disediakan jika menggunakan Replit)

## 🚀 Cara Memulai

### 1. Setup di Replit
```bash
# Install dependencies
npm install

# Gunakan workflow "Telegram Bot" untuk menjalankan bot
# Atau jalankan manual:
node index.js
```

### 2. Konfigurasi Environment
- Set `BOT_TOKEN` di Secrets/Environment Variables
- Set `GROQ_API_KEY` di Secrets/Environment Variables
- DATABASE_URL akan otomatis terkonfigurasi oleh Replit

### 3. Mulai Gunakan Bot
- Buka Telegram bot Anda (hasil dari `/start`)
- Klik **📊 Input Akun Baru** untuk akun pertama
- Copy data dari dashboard Project-X dan paste ke chat
- AI akan parsing otomatis, pilih nomor akun untuk simpan
- Gunakan menu lain untuk analisa dan tracking

## 🗄️ Struktur Database

Bot ini mengelola tiga tabel utama di PostgreSQL:

### `accounts` Table
Menyimpan data inti setiap akun pengguna:
- `user_id`: ID Telegram user
- `account_number`: Nomor akun (1-10)
- `saldo`: Total portfolio value
- `total_points`: Accumulated points
- `total_fees`: Total fees earned
- `pending_yield`: Unclaimed yield/rewards
- `account_name`: Nama custom akun (optional)

### `positions` Table
Melacak detail setiap pair LP aktif:
- `account_id`: Reference ke accounts
- `pair`: Trading pair (e.g., HYPE/USD)
- `position_size`: Jumlah yang diposisi
- `apr`: Annual Percentage Rate
- `in_range`: Status apakah harga dalam range

### `daily_history` Table
Menyimpan snapshot harian untuk analisis tren:
- `account_id`: Reference ke accounts
- `saldo`: Saldo pada hari tersebut
- `total_points`: Points pada hari tersebut
- `total_fees`: Fees pada hari tersebut
- `recorded_at`: Tanggal snapshot

## 🔧 Cascade Mode (Model Fallback)

Bot menggunakan sistem cascade untuk parsing data (resilient):
1. **Primary Models**: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
2. **Fallback Models**: `qwen/qwen3-32b`, `allam-2-7b`

Jika model pertama gagal, otomatis try model berikutnya untuk maksimal success rate.

## 📊 Data Flow

```
User Input (Text/Image)
    ↓
Groq AI Parser (Cascade Mode)
    ↓
Extract JSON (saldo, points, fees, positions, etc.)
    ↓
Validate & Display Preview
    ↓
User Select Account Number
    ↓
Save to PostgreSQL (accounts, positions, daily_history)
    ↓
Ready for Analysis
```

## 🚀 Deployment

Bot ini optimal untuk deployment di **Replit**:
- Built-in PostgreSQL support
- Persistent storage
- Easy secret management
- Automated backups

Gunakan fitur "Publish" di Replit untuk membuat bot 24/7 accessible.

## 📝 Catatan Pengembangan

- Bot dikonfigurasi untuk lingkungan **Replit** dengan keep-alive HTTPS agent
- Gunakan workflow **Telegram Bot** untuk menjalankan bot
- Setiap user memiliki database terpisah (user_id based)
- Data history disimpan untuk setiap update (3 tabel dengan ON DELETE CASCADE)
- AI parsing intelligent dan cascade-fallback untuk reliability

## 🔐 Security

- Semua secret disimpan di Environment Variables (tidak di commit)
- Database connection menggunakan SSL (production mode)
- User data isolated berdasarkan Telegram user_id
- No logging of sensitive data (saldo, keys, etc.)

## 📞 Support

Jika ada pertanyaan atau bug, silakan hubungi atau buat issue di repository ini.

---
*Dikembangkan dengan ❤️ untuk komunitas Project-X LP traders.*
