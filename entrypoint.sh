#!/bin/sh
set -e

mkdir -p /app/data /data
chmod -R 777 /app/data /data || true

echo "[Entrypoint] Downloading existing database from cloud storage..."
node /sync.js download || echo "[Entrypoint] Download finished or fresh start."

echo "[Entrypoint] Starting background auto-sync loop..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute server..."
export NODE_OPTIONS="--max-old-space-size=400"
exec node dev/run-standalone.mjs
