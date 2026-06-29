#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/projects/komik-reader}"
CADDY_SITE="/etc/caddy/sites/komik-reader.caddy"
ORIGIN="${ORIGIN:-https://komik.ryanprayoga.dev}"

cd "$PROJECT_DIR"

echo "==> Pull latest"
git fetch --prune origin
git checkout main
git reset --hard origin/main

echo "==> Build & start containers"
export ORIGIN
docker compose build web
docker compose up -d

echo "==> Wait for health"
for i in $(seq 1 30); do
	if curl -sf "http://127.0.0.1:4311/health" >/dev/null; then
		echo "    Web healthy"
		break
	fi
	if [[ "$i" -eq 30 ]]; then
		echo "    Web health check failed" >&2
		docker compose logs --tail=50 web
		exit 1
	fi
	sleep 2
done

echo "==> Install Caddy site"
sudo install -m 644 deploy/caddy/komik-reader.caddy "$CADDY_SITE"
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

echo "==> Public smoke test"
for i in $(seq 1 10); do
	if curl -sf "${ORIGIN}/health" >/dev/null; then
		echo "Deploy OK: ${ORIGIN}"
		exit 0
	fi
	sleep 3
done
echo "Public health check failed for ${ORIGIN}" >&2
exit 1