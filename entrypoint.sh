#!/bin/sh
set -e

mkdir -p /app/data
chmod 777 /app/data

echo "[Entrypoint] Downloading existing database if any..."
node /sync.js download || echo "[Entrypoint] Download failed, continuing..."

echo "[Entrypoint] Starting upload loop in background..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute with strict memory limit..."
# Bypass run-standalone wrapper to save 100MB of RAM
# Directly run the websocket server with strict V8 heap limit
export NODE_OPTIONS="--max-old-space-size=250"
exec node server-ws.mjs
