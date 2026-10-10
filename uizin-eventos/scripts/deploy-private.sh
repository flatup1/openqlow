#!/usr/bin/env bash
# Tournament OS（会長向けの準備・申込の画面）を、Cloudflare Pages「tournament-os-v3」だけに公開する。
# 公開先は、この1つに固定。古い uizin-eventos や Worker には、さわらない。
# 使い方:  npm run deploy:private   （最後に「yes」と打つまで、公開しない）
set -euo pipefail

PROJECT="tournament-os-v3"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT_DIR/out-private-pages"
LINK_BACKUP="${TOS_TEMPLATE_LINK_FILE:-$HOME/template-link.backup.json}"
cd "$ROOT_DIR"

echo "== 1/4 作り直して、自動チェックをかける"
npm run build:private

echo "== 2/4 ひな形のコピー用リンクを確かめる"
has_link() { grep -Eq '"copyUrl"[[:space:]]*:[[:space:]]*"https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+/copy"' "$1" 2>/dev/null; }
if ! has_link "$OUT/template-link.json"; then
  if has_link "$LINK_BACKUP"; then
    cp "$LINK_BACKUP" "$OUT/template-link.json"
    echo "   控えのリンクを入れました: $LINK_BACKUP"
  else
    echo "NG ひな形のリンクがありません。公開しません。" >&2
    echo "   控え（${LINK_BACKUP}）に、\"copyUrl\" を入れてから、もう一度やってください。" >&2
    exit 1
  fi
fi
has_link "$OUT/template-link.json" || { echo "NG リンクの形が正しくありません。公開しません。" >&2; exit 1; }
node "$ROOT_DIR/scripts/check-private-build.mjs" "$OUT"

echo "== 3/4 公開する内容の確認"
COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
DIRTY="$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
echo "   公開先   : $PROJECT  （古い uizin-eventos ではありません）"
echo "   ブランチ : $BRANCH"
echo "   コミット : $COMMIT"
[ "$DIRTY" != "0" ] && echo "   注意     : 保存していない変更が ${DIRTY} 件あります（このコミットと、違う内容かもしれません）"
echo "   中身     : 準備の画面・設定の画面・当日の画面・選手の申込画面だけ。名簿・写真・連絡先は入りません。"
printf "公開してよいですか？ よければ yes と打って Enter: "
read -r ANSWER
[ "$ANSWER" = "yes" ] || { echo "やめました。何も公開していません。"; exit 1; }

echo "== 4/4 公開"
npx wrangler pages deploy "$OUT" --project-name "$PROJECT" --branch main
