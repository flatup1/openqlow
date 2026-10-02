#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/out"
TARGET_DIR="$ROOT_DIR/out-private-pages"

cd "$ROOT_DIR"
npm run build

mkdir -p "$TARGET_DIR"
rsync -a --delete "$SOURCE_DIR/_next/" "$TARGET_DIR/_next/"
mkdir -p "$TARGET_DIR/private"
rsync -a --delete "$SOURCE_DIR/private/" "$TARGET_DIR/private/"
cp "$SOURCE_DIR/_headers" "$TARGET_DIR/_headers"
cp "$ROOT_DIR/private-deploy/_redirects" "$TARGET_DIR/_redirects"

echo "Private Pages build: $TARGET_DIR"
