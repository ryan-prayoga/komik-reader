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
| Suwayomi API (dev) | 4567 |
| Web dev | 5173 |
| Web production (VPS) | 127.0.0.1:4311 |

## Production (VPS)

URL: **https://komik.ryanprayoga.dev**

```bash
# Di VPS
git clone git@github.com:ryan-prayoga/komik-reader.git /home/ubuntu/projects/komik-reader
cd /home/ubuntu/projects/komik-reader
bash deploy/remote/deploy.sh
```

Stack: Docker Compose (Suwayomi + SvelteKit adapter-node) + Caddy reverse proxy.

GitHub Actions deploy otomatis butuh secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
Untuk SSH via Cloudflare Tunnel, set `VPS_HOST` ke hostname tunnel (bukan IP publik).