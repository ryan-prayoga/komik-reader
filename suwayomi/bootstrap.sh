#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Starting Suwayomi server..."
docker compose up -d

echo "==> Waiting for Suwayomi API..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:4567/api/graphql -H 'Content-Type: application/json' \
    -d '{"query":"{ aboutServer { version } }"}' >/dev/null 2>&1; then
    echo "    Suwayomi is ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "    Timed out waiting for Suwayomi on :4567"
    exit 1
  fi
  sleep 2
done

echo "==> Syncing Keiyoushi extension catalog..."
curl -sf http://localhost:4567/api/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { fetchExtensions(input: {}) { extensions { pkgName name isInstalled } } }"}' \
  | python3 -m json.tool >/dev/null

echo "==> Done. Install extensions manually via web UI at /extensions"
echo "    Suwayomi: http://localhost:4567"
echo "    Web dev:  cd ../web && pnpm dev"