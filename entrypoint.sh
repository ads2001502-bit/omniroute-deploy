#!/bin/sh
set -e

# Setup permissions for data directory
mkdir -p /data
# OmniRoute runs as a node user or root depending on the image, so we ensure the directory is accessible.
chmod 777 /data

echo "[Entrypoint] Downloading existing database if any..."
node /sync.js download

echo "[Entrypoint] Starting upload loop in background..."
node /sync.js upload-loop &

echo "[Entrypoint] Starting OmniRoute..."
# Original OmniRoute command is usually npm run start
exec npm run start
