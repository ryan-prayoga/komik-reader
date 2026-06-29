# Komik Reader

Web reader komik berbasis [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server) + extension [Keiyoushi](https://github.com/keiyoushi/extensions).

- **Backend scraping:** Suwayomi menjalankan extension APK (seperti Aniyomi, tapi di server)
- **Frontend:** SvelteKit + Tailwind CSS + PWA
- **Extension:** Manual install/uninstall lewat `/extensions`

## Quick start

```bash
# 1. Jalankan Suwayomi
cd suwayomi
chmod +x bootstrap.sh
./bootstrap.sh

# 2. Jalankan web UI
cd ../web
pnpm install
pnpm dev
```

Buka http://localhost:5173 → masuk ke **Extensions** → install source (Komikcast, Kiryuu, dll) → browse & baca.

## Struktur

```
komik-reader/
├── suwayomi/     # Docker + data Suwayomi
└── web/          # SvelteKit PWA
```

## Port

| Service | Port |
|---|---|
| Suwayomi API | 4567 |
| Web dev | 5173 |