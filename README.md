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

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **PR / push:** `pnpm check`, `pnpm build`, secret scan (gitleaks)
- **push `main`:** deploy otomatis via self-hosted runner di VPS

Secrets **tidak** disimpan di repo. Buat `.env` hanya di server dari `.env.example`:

```bash
cp .env.example .env
# isi AUTH_SECRET, ADMIN_PASSWORD, SMTP_PASS, dll. di VPS saja
```

Register runner (sekali) di VPS:

```bash
cd /home/ubuntu
mkdir -p actions-runner-komik-reader && cd actions-runner-komik-reader
# download runner arm64, lalu:
./config.sh --url https://github.com/ryan-prayoga/komik-reader --token <REG_TOKEN> \
  --name vps-komik-reader --labels self-hosted,komik-reader --unattended
sudo ./svc.sh install ubuntu && sudo ./svc.sh start
```