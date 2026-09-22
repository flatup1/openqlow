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
command -v git  >/dev/null || die "git がありません。Xcode Command Line Tools を入れてください: xcode-select --install"
command -v bun  >/dev/null || die "bun がありません。入れてください: curl -fsSL https://bun.sh/install | bash"
command -v docker >/dev/null || die "docker がありません。Docker Desktop を入れて起動してください: https://docs.docker.com/desktop/"
docker info >/dev/null 2>&1 || die "Docker が起動していません。Docker Desktop を起動してから、もう一度実行してください。"
echo "OK: git / bun / docker"

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

say "データベースとRedisを起動（Docker）"
cd "$APP"
docker compose up -d db redis serverless-redis-http

say "データベースの接続を待つ"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U opencut >/dev/null 2>&1; then echo "OK: データベース応答"; break; fi
  [ "$i" = 60 ] && die "データベースが起動しませんでした。docker compose logs db を見てください。"
  sleep 2
done

say "依存パッケージを導入（数分かかる）"
bun install

say "データベースの表を作成"
# 注意: bun run db:push:local は本家の設定ミス（schema のパス違い）で失敗する。migrate を使う。
( cd apps/web && bun run db:migrate )

say "完了"
cat <<'MSG'
次は起動です。

  ./opencut-studio/start.sh

ブラウザで http://localhost:3000 を開きます。
MSG
