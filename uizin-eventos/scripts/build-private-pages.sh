#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/out"
TARGET_DIR="$ROOT_DIR/out-private-pages"
# 公開用フォルダは、いったん空の作業場所（STAGE）で組み立てて、最後に丸ごと入れかえる。
# こうすると、前のビルドの古いファイル・手で置いたファイル（CSV・バックアップなど）が、公開用に残らない。
STAGE="$(mktemp -d)"

cd "$ROOT_DIR"
npm run build

# Follow the private pages' static dependency graph. ZIP/Excel libraries are
# dynamic chunks referenced by another chunk (not by HTML), so a single grep
# is insufficient. Copy fonts/media separately because CSS uses relative URLs.
asset_list="$(mktemp)"
copied_list="$(mktemp)"
pending_list="$(mktemp)"
trap 'rm -f "$asset_list" "$copied_list" "$pending_list"; find "$STAGE" -delete 2>/dev/null || true' EXIT
grep -rhoE '/_next/static/[A-Za-z0-9._/-]+' "$SOURCE_DIR/private" "$SOURCE_DIR/apply" | sort -u > "$asset_list"
while :; do
  sort -u "$asset_list" -o "$asset_list"
  sort -u "$copied_list" -o "$copied_list"
  comm -23 "$asset_list" "$copied_list" > "$pending_list"
  [[ -s "$pending_list" ]] || break
  while IFS= read -r asset; do
    relative="${asset#/}"
    mkdir -p "$STAGE/$(dirname "$relative")"
    cp "$SOURCE_DIR/$relative" "$STAGE/$relative"
    printf '%s\n' "$asset" >> "$copied_list"
    grep -hoE 'static/chunks/[A-Za-z0-9._/-]+' "$SOURCE_DIR/$relative" 2>/dev/null \
      | sed 's#^#/_next/#' >> "$asset_list" || true
  done < "$pending_list"
done
if [[ -d "$SOURCE_DIR/_next/static/media" ]]; then
  mkdir -p "$STAGE/_next/static/media"
  rsync -a --delete "$SOURCE_DIR/_next/static/media/" "$STAGE/_next/static/media/"
fi
mkdir -p "$STAGE/private"
rsync -a --delete "$SOURCE_DIR/private/" "$STAGE/private/"
mkdir -p "$STAGE/apply"
rsync -a --delete "$SOURCE_DIR/apply/" "$STAGE/apply/"
cp "$SOURCE_DIR/_headers" "$STAGE/_headers"
cp "$ROOT_DIR/private-deploy/_redirects" "$STAGE/_redirects"
cp "$SOURCE_DIR/template-link.json" "$STAGE/template-link.json"
mkdir -p "$STAGE/templates"
rsync -a --delete "$SOURCE_DIR/templates/" "$STAGE/templates/"

# 組み立てたものを、公開用フォルダへ丸ごと入れかえる（中にあった余分なファイルは消える）
mkdir -p "$TARGET_DIR"
rsync -a --delete "$STAGE/" "$TARGET_DIR/"
echo "Private Pages build: $TARGET_DIR"

# 公開してよい形か、自動で確かめる（部品の抜け・混ざった画面・秘密らしき文字）。駄目ならここで止まる。
node "$ROOT_DIR/scripts/check-private-build.mjs" "$TARGET_DIR"
