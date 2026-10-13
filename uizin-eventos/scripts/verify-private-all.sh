#!/usr/bin/env bash
# 1つのコマンドで、会長の画面（Tournament OS v3）の「全部の確認」を動かす。
#   1) 型チェック(tsc)  2) 単体テスト(npm test)  3) 公開用フォルダを作る(build:private + 自動チェック)
#   4) 手元の静かなサーバー  5) 画面の確認(scripts/test-*.mjs を、名前が合うもの全部)  6) validate-ai-os  7) git の見張り
# 使い方（uizin-eventos/ で）:
#   bash scripts/verify-private-all.sh            全部（画面の確認は、全部で およそ30分）
#   bash scripts/verify-private-all.sh --fast     いちばん長い test-private-mistake-proof（およそ16分）を、とばす
#   npm run verify:all                            上と同じ（--fast は npm run verify:all -- --fast）
# 環境変数:
#   TOS_PLAYWRIGHT_MODULE（既定: playwright）  TOS_CHROME_PATH（Chrome/Chromium の実行ファイル。既定: パソコンの Chrome）
#   TOS_PORT（既定 4990）  TOS_SKIP_BUILD=1（out-private-pages を作り直さない）  TOS_PLAIN_SERVER=1（_headers を付けない python3 のサーバー）
#   TOS_ONLY="test-class-ab test-polish-private"（この画面の確認だけ動かす。型チェック等は省く）
#   TOS_SCENARIOS="M1,M2"（確認の中の「場面」だけ動かす。各確認の TOS_ONLY として渡す）
# 手元だけで動く: デプロイしない。通信は 127.0.0.1 だけ。1つの手順が失敗しても、ほかは最後まで動かす。
# 全部合格したときだけ、.verify-ok（コミットと中身の指紋）を書く。npm run deploy:private が、公開の前に見る。
# 目安の合格数（2026年10月12日の時点。数は増える）:
#   browser 86 / setup 60 / v3-safety 44 / glance 84 / resilience / live-list / class-ab 820 / mistake-proof 3331 / bout-flow / polish-private / polish-apply / polish-misc
set -euo pipefail
set +e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${TOS_PORT:-4990}"
FAST=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "知らない指定です: ${arg}（使えるのは --fast だけ）"; exit 2 ;;
  esac
done

fail=0
failed=""
table=""
step() { printf '\n===== %s =====\n' "$1"; }
note() { table="$table$(printf '%-6s %6ss  %s' "$1" "$2" "$3")\n"; }
run() {
  local name="$1"; shift
  step "$name"
  local t0=$SECONDS
  if "$@"; then note "OK" "$((SECONDS - t0))" "$name"; echo "OK   $name"; else note "FAIL" "$((SECONDS - t0))" "$name"; echo "FAIL $name"; fail=$((fail + 1)); failed="$failed\n  - $name"; fi
}
skip() { note "とばす" "0" "$1"; echo "とばす $1"; }

build_private() {
  local out
  out="$(npm run build:private 2>&1)"; local code=$?
  printf '%s\n' "$out" | tail -4
  [ $code -eq 0 ] && printf '%s\n' "$out" | tail -1 | grep -q '^OK 公開用フォルダは、正常です'
}

# 作業フォルダに、コミットしてはいけない物が混ざっていないか（名簿・バックアップ・秘密・手元の作業フォルダ）
git_watch() {
  local bad
  bad="$(git -C "$ROOT/.." status --porcelain --untracked-files=all 2>/dev/null | grep -E '^\?\? ' | sed 's/^?? //' | grep -E '(^|/)(next-stale-cache[^/]*|bd-[^/]*|audit|srv\.pid)(/|$)|\.(csv|zip|enc|log|map|jpe?g|png)$|(^|/)\.env' || true)"
  if [ -n "$bad" ]; then
    echo "コミットしてはいけない物が、まだ追跡していない形で並んでいます（.gitignore に足すか、消してください）:"
    printf '%s\n' "$bad" | head -20
    return 1
  fi
  local fresh
  fresh="$(git -C "$ROOT/.." status --porcelain --untracked-files=all 2>/dev/null | grep -c '^?? ' || true)"
  echo "i まだ git に入れていない新しいファイル: ${fresh} 件（コミットの前に、中身を見てから git add します）"
  return 0
}

if [ -z "${TOS_ONLY:-}" ]; then
  run "tsc" npx tsc --noEmit --incremental false
  run "unit tests (npm test)" npm test --silent
  if [ "${TOS_SKIP_BUILD:-0}" != "1" ]; then run "build:private" build_private; else skip "build:private (TOS_SKIP_BUILD)"; fi
fi

if [ ! -d out-private-pages ]; then echo "out-private-pages がありません。TOS_SKIP_BUILD を付けずに、もう一度動かしてください。"; exit 1; fi
# 手元のサーバー。ふだんは scripts/serve-with-headers.mjs（_headers の CSP などを、本番と同じように付ける。画面の確認が、本物の安全の約束の下で通るかを見る）。
# TOS_PLAIN_SERVER=1 のときだけ、見出しの付かない python3 -m http.server（比べたいときの逃げ道）
if [ "${TOS_PLAIN_SERVER:-0}" = "1" ]; then
  python3 -m http.server "$PORT" -d out-private-pages --bind 127.0.0.1 >/dev/null 2>&1 &
else
  node scripts/serve-with-headers.mjs out-private-pages "$PORT" >/dev/null 2>&1 &
fi
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1

suites="${TOS_ONLY:-}"
if [ -z "$suites" ]; then suites="$(ls scripts/test-*.mjs | sed 's#scripts/##; s#\.mjs$##' | tr '\n' ' ')"; fi
export TOS_TEST_BASE="http://127.0.0.1:$PORT"
export TOS_PLAYWRIGHT_MODULE="${TOS_PLAYWRIGHT_MODULE:-playwright}"
for suite in $suites; do
  if [ "$FAST" = "1" ] && [ "$suite" = "test-private-mistake-proof" ]; then skip "browser: $suite (--fast)"; continue; fi
  # TOS_ONLY は、この書類では「どの確認を動かすか」。確認の中では「どの場面だけ動かすか」の意味なので、渡さない（TOS_SCENARIOS を渡す）
  run "browser: $suite" env -u TOS_ONLY TOS_ONLY="${TOS_SCENARIOS:-}" node --experimental-strip-types "scripts/$suite.mjs"
done

if [ -z "${TOS_ONLY:-}" ]; then
  if [ -x "$ROOT/../scripts/validate-ai-os.sh" ]; then run "validate-ai-os" bash -c "cd '$ROOT/..' && ./scripts/validate-ai-os.sh"; else skip "validate-ai-os (見つかりません)"; fi
  run "git: 混ざってはいけない物" git_watch
fi

printf '\n===== 結果 =====\n'
printf '%b' "$table"
if [ "$fail" -eq 0 ]; then
  if [ -z "${TOS_ONLY:-}" ] && [ "$FAST" = "0" ]; then
    bash scripts/tree-stamp.sh > .verify-ok 2>/dev/null && echo "✓ 全部合格。.verify-ok に、いまの指紋を書きました（公開のコマンドが見ます）。"
  else
    echo "✓ 合格。ただし一部だけ動かした（--fast か TOS_ONLY）ので、公開用の指紋（.verify-ok）は書きません。"
  fi
  echo "ALL OK"; exit 0
fi
printf '%d 件失敗:%b\n' "$fail" "$failed"
exit 1
