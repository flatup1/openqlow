#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/out"
TARGET_DIR="$ROOT_DIR/out-private-pages"

cd "$ROOT_DIR"
npm run build

mkdir -p "$TARGET_DIR"
mkdir -p "$TARGET_DIR/_next"
find "$TARGET_DIR/_next" -type f -delete
grep -rhoE '/_next/static/[A-Za-z0-9._/-]+' "$SOURCE_DIR/private" | sort -u | while IFS= read -r asset; do
  relative="${asset#/}"
  mkdir -p "$TARGET_DIR/$(dirname "$relative")"
  cp "$SOURCE_DIR/$relative" "$TARGET_DIR/$relative"
done
mkdir -p "$TARGET_DIR/private"
rsync -a --delete "$SOURCE_DIR/private/" "$TARGET_DIR/private/"
cp "$SOURCE_DIR/_headers" "$TARGET_DIR/_headers"
cp "$ROOT_DIR/private-deploy/_redirects" "$TARGET_DIR/_redirects"
mkdir -p "$TARGET_DIR/templates"
rsync -a --delete "$SOURCE_DIR/templates/" "$TARGET_DIR/templates/"

echo "Private Pages build: $TARGET_DIR"
