#!/bin/sh
set -e

cd /app

mkdir -p /app/data /data
chmod -R 777 /app/data /data || true

echo "[Entrypoint] Downloading existing database from cloud storage..."
node /sync.js download || echo "[Entrypoint] Download finished or fresh start."

echo "[Entrypoint] Starting background auto-sync loop..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute server on 0.0.0.0:${PORT:-10000}..."
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-10000}"
export OMNIROUTE_PORT="${PORT:-10000}"
export DATA_DIR="${DATA_DIR:-/app/data}"
export NODE_OPTIONS="--max-old-space-size=400"

exec node dev/run-standalone.mjs
