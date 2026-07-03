#!/bin/sh
set -e

# The /app/data volume may carry files owned by root from older root-run
# containers. Fix ownership (as root) before dropping to the unprivileged node
# user, otherwise SQLite can't open auth.db for writing (WAL) and the app 500s.
chown -R node:node /app/data 2>/dev/null || true

exec su-exec node "$@"
