#!/usr/bin/env bash
# いまの作業フォルダの「指紋」を1行で出す（コミットの番号 + 変更の中身）。
# verify-private-all.sh が、全部合格したときに書き、deploy-private.sh が、公開の前に見くらべる。
# 指紋がちがえば、「検証したあとで、中身が変わった」ということ。
#   bash scripts/tree-stamp.sh          指紋（コミット:変更の中身）
#   bash scripts/tree-stamp.sh --tree   このフォルダの中身の番号（git の tree）。コミットしていない変更や、まだ追跡していないファイルが
#                                       1つでもあるとき（.gitignore で無視している物は数えない）は、何も出さずに 1 で終わる
#   bash scripts/tree-stamp.sh --list   検証ずみの一覧（リポジトリのいちばん上の uizin-eventos-verified-trees.txt）の場所
# --tree と --list は、このフォルダが git のいちばん上のとき（一覧がフォルダの中に入って、中身の番号が変わってしまう）と、git の外では、1 で終わる。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIST_NAME="uizin-eventos-verified-trees.txt"

# このフォルダが、リポジトリの中の1つのフォルダか（git のいちばん上でも、git の外でもない）
in_subfolder() { [ -n "$(git -C "$ROOT_DIR" rev-parse --show-prefix 2>/dev/null || true)" ]; }
# このフォルダに、コミットしていない変更が1つも無いか（まだ追跡していないファイルも数える。設定で隠さないよう、はっきり指定する）
folder_clean() {
  local changes
  changes="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal -- . 2>/dev/null)" || return 1
  [ -z "$changes" ]
}
case "${1:-}" in
  --tree) { in_subfolder && folder_clean; } || exit 1; git -C "$ROOT_DIR" rev-parse HEAD:./ 2>/dev/null || exit 1; exit 0 ;;
  --list) in_subfolder || exit 1; echo "$(git -C "$ROOT_DIR" rev-parse --show-toplevel)/$LIST_NAME"; exit 0 ;;
  '') ;;
  *) echo "知らない指定です: $1（使えるのは --tree と --list だけ）" >&2; exit 2 ;;
esac

HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse --verify -q HEAD 2>/dev/null || echo none)"
# まだ追跡していないファイルの、名前と中身（git の番号）。名前だけだと、git add の前に直した中身が、指紋に出ない
untracked() {
  git -C "$ROOT_DIR" ls-files --others --exclude-standard -z -- . 2>/dev/null | while IFS= read -r -d '' f; do
    printf '%s %s\n' "$(git -C "$ROOT_DIR" hash-object -- "$f" 2>/dev/null || echo '-')" "$f"
  done
}
# 追跡しているファイルの変更 + まだ追跡していないファイルの名前と中身（コミットしていない作業の指紋）
CHANGES="$( { git -C "$ROOT_DIR" diff HEAD -- . 2>/dev/null || true; git -C "$ROOT_DIR" status --porcelain -- . 2>/dev/null || true; untracked || true; } | { sha1sum 2>/dev/null || shasum; } | cut -d' ' -f1)"
echo "${HEAD_SHA}:${CHANGES}"
