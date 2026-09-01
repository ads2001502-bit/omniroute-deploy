#!/bin/sh
set -e

cd /app

mkdir -p /app/data /data
chmod -R 777 /app/data /data || true

echo "[Entrypoint] Restoring database from GitHub private storage..."
node /sync.js download || echo "[Entrypoint] Download finished or fresh start."

echo "[Entrypoint] Starting background auto-sync loop..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute standalone server on 0.0.0.0:${PORT:-10000}..."
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-10000}"
export DATA_DIR="${DATA_DIR:-/app/data}"

if [ -f "server.js" ]; then
    exec node server.js
elif [ -f "dev/run-standalone.mjs" ]; then
    exec node dev/run-standalone.mjs
else
    exec node $(find . -maxdepth 2 -name "server.js" | head -n 1)
fi
