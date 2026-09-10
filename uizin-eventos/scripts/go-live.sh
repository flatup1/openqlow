#!/usr/bin/env bash
#
# UIZIN EventOS を本番公開する。これ1本で終わる。
#
#   bash scripts/go-live.sh
#   bash scripts/go-live.sh <進行表のシートID>
#
# 途中で失敗しても、何が悪くて何をすればいいかを日本語で出します。
# 何度実行しても安全です（同じところに上書きするだけ）。

set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd -P)"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

step() { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die() {
  printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  if [ $# -gt 1 ]; then printf '  %s\n' "$2" >&2; fi
  exit 1
}

WRANGLER="npx --yes wrangler@4"
CONFIG="worker/wrangler.toml"

# wrangler.toml の [vars] を1行だけ書き換える。
# node -e のとき process.argv は [nodeのパス, 引数...] なので slice(1) で取る。
set_var() {
  node -e '
    const fs = require("fs");
    const [file, key, value] = process.argv.slice(1);
    const src = fs.readFileSync(file, "utf8");
    const re = new RegExp("^" + key + " = \".*\"$", "m");
    if (!re.test(src)) { console.error("設定行 " + key + " が見つかりません"); process.exit(1); }
    fs.writeFileSync(file, src.replace(re, key + " = \"" + value + "\""));
  ' "$1" "$2" "$3"
}

printf '%s\n' "${BOLD}=== UIZIN EventOS 本番公開 ===${RESET}"
printf '%s\n' "${DIM}5画面と裏側のシステムを Cloudflare に公開します。費用はかかりません。${RESET}"

# ---------------------------------------------------------------- 0. 前提確認
step "0/6  必要なものがそろっているか確認"

command -v node >/dev/null 2>&1 || die "Node.js が見つかりません。" "https://nodejs.org から Node.js 22 以上を入れてください。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node.js が古すぎます（今 $(node -v)）。" "Node.js 22 以上に上げてください。"
ok "Node.js $(node -v)"

if [ ! -d node_modules ]; then
  warn "部品が入っていないので入れます（1〜2分かかります）"
  npm ci --silent >/dev/null 2>&1 || npm install --silent >/dev/null 2>&1 || die "部品を入れられませんでした。" "npm install を単体で実行して、出たエラーを見てください。"
fi
ok "部品そろっています"

# ---------------------------------------------------------------- 1. ログイン
step "1/6  Cloudflare にログインしているか確認"

if ! $WRANGLER whoami >/dev/null 2>&1; then
  warn "まだログインしていません。ブラウザが開くので、許可してください。"
  $WRANGLER login || die "ログインできませんでした。" "もう一度 bash scripts/go-live.sh を実行してください。"
fi
ACCOUNT="$($WRANGLER whoami 2>/dev/null | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1 || true)"
if [ -n "$ACCOUNT" ]; then ok "ログイン済み（$ACCOUNT）"; else ok "ログイン済み"; fi

# ---------------------------------------------------------------- 2. 進行表のID
step "2/6  進行表スプレッドシートのIDを設定"

SHEET_ID="${SHEET_ID:-${1:-}}"
if [ -z "$SHEET_ID" ]; then
  CURRENT="$(grep -E '^SHEET_ID' "$CONFIG" | sed -E 's/.*"(.*)".*/\1/' || true)"
  if [ -n "$CURRENT" ]; then
    SHEET_ID="$CURRENT"
    ok "設定済みのIDを使います: $SHEET_ID"
  else
    printf '\n  進行表のURLの /d/ と /edit の間の文字列です。\n'
    printf '  例: docs.google.com/spreadsheets/d/%sここ%s/edit\n\n' "$BOLD" "$RESET"
    printf '  シートID: '
    read -r SHEET_ID
    [ -n "$SHEET_ID" ] || die "シートIDが入力されませんでした。"
  fi
fi

set_var "$CONFIG" SHEET_ID "$SHEET_ID" || die "シートIDを書き込めませんでした。"
ok "シートIDを設定しました"

warn "進行表の共有を「リンクを知っている全員／閲覧者」にしてください（あとで必要になります）。"
warn "申込の原本（メール・電話番号入り）は絶対に公開しないでください。"

# ---------------------------------------------------------------- 3. 操作キー
step "3/6  操作キーを設定"

NEW_KEY=""
if $WRANGLER secret list --config "$CONFIG" 2>/dev/null | grep -q OPERATOR_KEY; then
  ok "操作キーは設定済みです"
  printf '     %s変えたいとき: npx wrangler secret put OPERATOR_KEY --config %s%s\n' "$DIM" "$CONFIG" "$RESET"
else
  NEW_KEY="$(node -e 'console.log(require("crypto").randomBytes(9).toString("base64url"))')"
  printf '%s' "$NEW_KEY" | $WRANGLER secret put OPERATOR_KEY --config "$CONFIG" >/dev/null \
    || die "操作キーを設定できませんでした。"
  ok "操作キーを新しく作りました（最後に画面に出します）"
fi

# ---------------------------------------------------------------- 4. 裏側を公開
step "4/6  裏側のシステム（Worker）を公開"

WORKER_OUT="$($WRANGLER deploy --config "$CONFIG" 2>&1)" || { printf '%s\n' "$WORKER_OUT"; die "Worker を公開できませんでした。"; }
API_URL="$(printf '%s' "$WORKER_OUT" | grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' | head -1)"
if [ -z "$API_URL" ]; then
  printf '%s\n' "$WORKER_OUT"
  die "公開はできましたが、URLを読み取れませんでした。" "上の出力から workers.dev のURLを控えて、docs/DEPLOY.md の手順で続けてください。"
fi
ok "裏側: $API_URL"

# ---------------------------------------------------------------- 5. 画面を公開
step "5/6  5つの画面（Pages）を公開"

$WRANGLER pages project create uizin-eventos --production-branch main >/dev/null 2>&1 || true

NEXT_PUBLIC_EVENTOS_API="$API_URL" npm run build >/dev/null 2>&1 \
  || die "画面を組み立てられませんでした。" "npm run build を単体で実行して、出たエラーを見てください。"
ok "画面を組み立てました"

PAGES_OUT="$($WRANGLER pages deploy out --project-name uizin-eventos --branch main --commit-dirty=true 2>&1)" \
  || { printf '%s\n' "$PAGES_OUT"; die "画面を公開できませんでした。"; }
# 出力には2種類のURLが出る:
#   https://uizin-eventos.pages.dev            ← 毎回同じ。スタッフに配るのはこっち
#   https://<毎回変わる>.uizin-eventos.pages.dev ← デプロイごとに変わる。配ってはいけない
# 配ったURLが次の公開で変わると、当日に「開かない」が起きる。必ず固定のほうを取る。
STABLE_URL="https://uizin-eventos.pages.dev"
if printf '%s' "$PAGES_OUT" | grep -qF "$STABLE_URL"; then
  APP_URL="$STABLE_URL"
else
  PREVIEW_URL="$(printf '%s' "$PAGES_OUT" | grep -oE 'https://[A-Za-z0-9._-]+\.pages\.dev' | tail -1)"
  if [ -z "$PREVIEW_URL" ]; then
    printf '%s\n' "$PAGES_OUT"
    die "公開はできましたが、URLを読み取れませんでした。"
  fi
  APP_URL="$STABLE_URL"
  warn "固定URLがまだ出ていません（初回公開だと数十秒かかります）。"
  warn "$STABLE_URL を使ってください。開けないときは少し待ってから開き直してください。"
fi
ok "画面: $APP_URL"

# ---------------------------------------------------------------- 6. 締めて確認
step "6/6  他サイトから触れないように締めて、動作確認"

set_var "$CONFIG" ALLOWED_ORIGINS "$APP_URL" || warn "締め直しの書き込みに失敗しました"
$WRANGLER deploy --config "$CONFIG" >/dev/null 2>&1 || warn "締め直しに失敗しました（動作そのものには影響しません）"
ok "この画面からしか操作できないようにしました"

HEALTH="$(curl -fsS --max-time 15 "$API_URL/api/health" 2>/dev/null || true)"
if printf '%s' "$HEALTH" | grep -q '"ok":true'; then
  ok "裏側が応答しています"
  if printf '%s' "$HEALTH" | grep -q '"hasSheet":true'; then
    ok "進行表のIDも入っています"
  else
    warn "進行表のIDが空です"
  fi
else
  warn "応答確認ができませんでした。少し待ってから $API_URL/api/health を開いてみてください。"
fi

# ---------------------------------------------------------------- 結果
printf '\n%s=== 公開できました ===%s\n\n' "$BOLD" "$RESET"
printf '  %sオペレーター（JINだけ）%s  %s/op/\n'   "$BOLD" "$RESET" "$APP_URL"
printf '  MC                        %s/mc/\n'      "$APP_URL"
printf '  大型モニター               %s/screen/\n' "$APP_URL"
printf '  音響（Event Mix）          %s/mix/\n'    "$APP_URL"
printf '  音源チェック               %s/check/\n'  "$APP_URL"
printf '\n'

if [ -n "$NEW_KEY" ]; then
  printf '  %s%s操作キー: %s%s\n\n' "$BOLD" "$YELLOW" "$NEW_KEY" "$RESET"
  printf '  %sこの画面にしか出ません。今すぐ控えてください。%s\n' "$DIM" "$RESET"
  printf '  %sオペレーター画面の「接続設定」に入れると操作できるようになります。%s\n' "$DIM" "$RESET"
  printf '  %sMC・表示画面・音響の端末には入れないでください。%s\n\n' "$RED" "$RESET"
fi

printf '  %s次にやること%s\n' "$BOLD" "$RESET"
printf '    1. 進行表の共有を「リンクを知っている全員／閲覧者」にする\n'
printf '    2. %s/op/ を開いて操作キーを入れる\n' "$APP_URL"
printf '    3. 「取り込み直す」を押す\n'
printf '    4. 「音源チェック」で赤がゼロになるまで直す\n\n'
