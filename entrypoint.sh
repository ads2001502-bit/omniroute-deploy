#!/bin/sh
set -e

mkdir -p /app/data
chmod 777 /app/data

echo "[Entrypoint] Downloading existing database if any..."
node /sync.js download || echo "[Entrypoint] Download failed, continuing..."

echo "[Entrypoint] Starting upload loop in background..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute..."
exec "$@"
