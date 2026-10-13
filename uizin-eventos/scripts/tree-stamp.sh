#!/usr/bin/env bash
# いまの作業フォルダの「指紋」を1行で出す（コミットの番号 + 変更の中身）。
# verify-private-all.sh が、全部合格したときに書き、deploy-private.sh が、公開の前に見くらべる。
# 指紋がちがえば、「検証したあとで、中身が変わった」ということ。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo none)"
# 追跡しているファイルの変更 + まだ追跡していないファイルの名前（コミットしていない作業の指紋）
CHANGES="$( { git -C "$ROOT_DIR" diff HEAD -- . 2>/dev/null || true; git -C "$ROOT_DIR" status --porcelain -- . 2>/dev/null || true; } | { sha1sum 2>/dev/null || shasum; } | cut -d' ' -f1)"
echo "${HEAD_SHA}:${CHANGES}"
