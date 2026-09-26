#!/usr/bin/env bash
# FLATUP: OpenCut（classic）をこのMacに初回セットアップする。
# 実行するとネットからクローン・ダウンロードを行う。本番反映や外部送信はしない。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/opencut-classic"
REPO="https://github.com/opencut-app/opencut-classic.git"

say() { printf '\n== %s\n' "$1"; }
die() { printf '\n[中止] %s\n' "$1" >&2; exit 1; }

say "前提コマンドを確認"
# bun を入れた直後は PATH が通っていないことがあるので、既定の場所を自分で見に行く。
if [ -x "$HOME/.bun/bin/bun" ]; then PATH="$HOME/.bun/bin:$PATH"; fi
command -v git >/dev/null || die "git がありません。入れてください: xcode-select --install"
command -v bun >/dev/null || die "bun がありません。次の2行を実行してから、もう一度このスクリプトを実行してください:
  curl -fsSL https://bun.sh/install | bash
  export PATH=\"\$HOME/.bun/bin:\$PATH\""
echo "OK: git / bun ($(bun --version))"

# Docker は任意。動画の編集と書き出しだけなら無くても動く（検証済み）。
USE_DB=0
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  USE_DB=1
  echo "OK: docker（ログイン機能も使える状態）"
else
  echo "情報: Docker が無い、または起動していません。"
  echo "      編集と書き出しは Docker 無しでできます。このまま続けます。"
  echo "      使えないのはログイン・フィードバック送信など、サーバーが要る機能だけです。"
fi

say "OpenCut本体を取得"
if [ -d "$APP/.git" ]; then
  echo "既にあるので取得は省略: $APP"
else
  git clone "$REPO" "$APP"
fi

say "環境設定ファイルを用意"
if [ -f "$APP/apps/web/.env.local" ]; then
  echo "既にあるので上書きしない: apps/web/.env.local"
else
  cp "$APP/apps/web/.env.example" "$APP/apps/web/.env.local"
  echo "作成した: apps/web/.env.local（ローカル用の初期値のまま動く）"
fi

cd "$APP"

if [ "$USE_DB" = 1 ]; then
  say "データベースとRedisを起動（Docker）"
  docker compose up -d db redis serverless-redis-http

  say "データベースの接続を待つ"
  for i in $(seq 1 60); do
    if docker compose exec -T db pg_isready -U opencut >/dev/null 2>&1; then echo "OK: データベース応答"; break; fi
    [ "$i" = 60 ] && die "データベースが起動しませんでした。docker compose logs db を見てください。"
    sleep 2
  done
fi

say "依存パッケージを導入（数分かかる）"
bun install

if [ "$USE_DB" = 1 ]; then
  say "データベースの表を作成"
  # 注意: bun run db:push:local は本家の設定ミス（schema のパス違い）で失敗する。migrate を使う。
  ( cd apps/web && bun run db:migrate )
fi

say "完了"
cat <<MSG
次は起動です。

  $HERE/start.sh

起動したらブラウザで http://localhost:3000 を開きます。
止めるときは、そのターミナルで Ctrl + C です。
MSG
