#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/out"
TARGET_DIR="$ROOT_DIR/out-private-pages"

cd "$ROOT_DIR"
npm run build

mkdir -p "$TARGET_DIR"
# Follow the private pages' static dependency graph. ZIP/Excel libraries are
# dynamic chunks referenced by another chunk (not by HTML), so a single grep
# is insufficient. Copy fonts/media separately because CSS uses relative URLs.
find "$TARGET_DIR/_next" -type f -delete 2>/dev/null || true
asset_list="$(mktemp)"
copied_list="$(mktemp)"
pending_list="$(mktemp)"
trap 'rm -f "$asset_list" "$copied_list" "$pending_list"' EXIT
grep -rhoE '/_next/static/[A-Za-z0-9._/-]+' "$SOURCE_DIR/private" | sort -u > "$asset_list"
while :; do
  sort -u "$asset_list" -o "$asset_list"
  sort -u "$copied_list" -o "$copied_list"
  comm -23 "$asset_list" "$copied_list" > "$pending_list"
  [[ -s "$pending_list" ]] || break
  while IFS= read -r asset; do
    relative="${asset#/}"
    mkdir -p "$TARGET_DIR/$(dirname "$relative")"
    cp "$SOURCE_DIR/$relative" "$TARGET_DIR/$relative"
    printf '%s\n' "$asset" >> "$copied_list"
    grep -hoE 'static/chunks/[A-Za-z0-9._/-]+' "$SOURCE_DIR/$relative" 2>/dev/null \
      | sed 's#^#/_next/#' >> "$asset_list" || true
  done < "$pending_list"
done
if [[ -d "$SOURCE_DIR/_next/static/media" ]]; then
  mkdir -p "$TARGET_DIR/_next/static/media"
  rsync -a --delete "$SOURCE_DIR/_next/static/media/" "$TARGET_DIR/_next/static/media/"
fi
mkdir -p "$TARGET_DIR/private"
rsync -a --delete "$SOURCE_DIR/private/" "$TARGET_DIR/private/"
cp "$SOURCE_DIR/_headers" "$TARGET_DIR/_headers"
cp "$ROOT_DIR/private-deploy/_redirects" "$TARGET_DIR/_redirects"
mkdir -p "$TARGET_DIR/templates"
rsync -a --delete "$SOURCE_DIR/templates/" "$TARGET_DIR/templates/"

echo "Private Pages build: $TARGET_DIR"
