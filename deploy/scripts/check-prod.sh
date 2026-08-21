#!/usr/bin/env bash
# openQLOW 本番の健康診断（読むだけ・何も変えない）
#
# Mac で `npm run check` と打つだけで、「本当にできてる？」に答えを出す。
#   1. GitHub の main と、本番で動いているコードが同じか
#   2. LINE の自動応答（webhook）が動いているか
#   3. 引き継ぎコードの受け口 /journey が生きているか
#   4. WebOS のページ（flatupnarita.jp/webos/）が公開されているか
#
# このスクリプトは読み取りだけ。再起動もデプロイもしない。
# 鍵が無い場所でも公開側だけ見たいときは `--public` を付ける（SSHを使わない）。
#
# 途中で失敗しても最後まで全部見る（set -e は付けない）。
# 「どこがダメか」を一度に全部知りたいのに、最初の1個で止まったら意味がないため。

set -uo pipefail

SSH_KEY="${OPENQLOW_VPS_KEY:-$HOME/.ssh/openqlow_vps}"
SSH_USER="${OPENQLOW_VPS_USER:-root}"
SSH_HOST="${OPENQLOW_VPS_HOST:-162.43.41.182}"
REMOTE_DIR="${OPENQLOW_VPS_REMOTE:-/opt/openqlow/}"
SERVICE="${OPENQLOW_SERVICE:-openqlow-webhook}"
WEBOS_URL="${OPENQLOW_WEBOS_URL:-https://flatupnarita.jp/webos/}"
JOURNEY_URL="${OPENQLOW_JOURNEY_URL:-https://aika.flatupnarita.jp/journey}"

PUBLIC_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --public) PUBLIC_ONLY=1 ;;
    *) echo "不明なオプション: $arg" >&2; exit 2 ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

NG=0
TODO=()
ok()   { echo "✅ $1"; }
ng()   { echo "❌ $1"; NG=$((NG + 1)); }
warn() { echo "⚠️ $1"; }

# HTTPのステータス番号だけを取る。つながらなければ 000。
# curl はつながらない時も "000" を出しつつ異常終了するので、
# `|| echo 000` を足すと "000000" になってしまう。数字3桁以外は 000 に直す。
http_code() {
  local code
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" 2>/dev/null)"
  [[ "$code" =~ ^[0-9]{3}$ ]] || code="000"
  echo "$code"
}

echo "=== FLAT UP 本番の健康診断 ==="
echo "（見るだけです。本番は何も変わりません）"

# ---- 1. コードの新しさ -------------------------------------------------
echo ""
echo "--- 1. コードの新しさ ---"
ORIGIN_SHA="$(git rev-parse --short origin/main 2>/dev/null || echo unknown)"
echo "GitHubのmain : ${ORIGIN_SHA}"

if [[ "$PUBLIC_ONLY" -eq 1 ]]; then
  warn "--public のため、本番のコードは確認していません"
else
  LIVE_VERSION="$(ssh -i "${SSH_KEY}" -o ConnectTimeout=10 "${SSH_USER}@${SSH_HOST}" \
    "cat ${REMOTE_DIR}deployed-version.txt 2>/dev/null || echo none" 2>/dev/null || echo unreachable)"
  LIVE_SHA="${LIVE_VERSION%% *}"
  case "$LIVE_SHA" in
    unreachable)
      ng "VPSにつながりません（鍵かネットワークの問題）"
      TODO+=("ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} が通るか確かめる")
      ;;
    none)
      ng "本番に deployed-version.txt がありません＝一度も新しいコードを送れていません"
      TODO+=("npm run deploy を実行する")
      ;;
    "$ORIGIN_SHA")
      ok "本番 ${LIVE_VERSION} ＝ GitHubのmainと同じ"
      ;;
    *)
      ng "本番は ${LIVE_SHA} で、GitHubの ${ORIGIN_SHA} より古いです"
      TODO+=("git pull --ff-only origin main のあと npm run deploy")
      ;;
  esac
fi

# ---- 2. LINE の自動応答 ------------------------------------------------
echo ""
echo "--- 2. LINEの自動応答（お客さま対応） ---"
if [[ "$PUBLIC_ONLY" -eq 1 ]]; then
  warn "--public のため、確認していません"
elif ssh -i "${SSH_KEY}" -o ConnectTimeout=10 "${SSH_USER}@${SSH_HOST}" \
     "systemctl is-active --quiet ${SERVICE}" 2>/dev/null; then
  ok "${SERVICE} は動いています（お客さまへの返信は止まっていません）"
else
  ng "${SERVICE} が止まっています。これはお客さまに影響します"
  TODO+=("ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} 'journalctl -u ${SERVICE} -n 30 --no-pager' でログを見る")
fi

# ---- 3. 引き継ぎコードの受け口 -----------------------------------------
echo ""
echo "--- 3. 引き継ぎコードの受け口（WebOS→LINE） ---"
# POST専用の窓口。GETだと 405 が返るのが正解＝「窓口は生きている」。
# 404 は「まだ新しいコードが本番に無い」か「nginxが /journey を通していない」。
JOURNEY_CODE="$(http_code "${JOURNEY_URL}")"
case "$JOURNEY_CODE" in
  405) ok "${JOURNEY_URL} は生きています（405＝POST専用の正しい反応）" ;;
  404)
    ng "${JOURNEY_URL} が 404。新しいコードが本番に無いか、nginxが通していません"
    TODO+=("npm run deploy のあと、まだ404なら nginx に location = /journey を足す")
    ;;
  000)
    ng "${JOURNEY_URL} につながりません（DNSかネットワーク）"
    TODO+=("スマホの回線など別のネットワークから試す")
    ;;
  *) warn "${JOURNEY_URL} が ${JOURNEY_CODE} を返しました（405が正解）" ;;
esac

# ---- 4. WebOS のページ -------------------------------------------------
echo ""
echo "--- 4. WebOSのページ ---"
WEBOS_CODE="$(http_code "${WEBOS_URL}")"
if [[ "$WEBOS_CODE" == "200" ]]; then
  ok "${WEBOS_URL} は公開されています"
  WEBOS_HTML="$(curl -s -m 10 "${WEBOS_URL}" 2>/dev/null || echo "")"
  LOCAL_V="$(grep -o 'styles\.css?v=[0-9]*' flatup-webos/app/index.html 2>/dev/null | head -1)"
  if [[ -n "$LOCAL_V" ]] && [[ "$WEBOS_HTML" == *"$LOCAL_V"* ]]; then
    ok "アップロード済みのページは手元と同じ版です（${LOCAL_V}）"
  elif [[ -n "$LOCAL_V" ]]; then
    ng "公開中のページが古いです（手元は ${LOCAL_V}）"
    TODO+=("flatup-webos/app/ の中身を XServer の public_html/webos/ へ上げ直す")
  fi
elif [[ "$WEBOS_CODE" == "000" ]]; then
  # ページもjourneyも両方つながらないなら、本番ではなく手元の回線の問題。
  # ここを「本番が落ちている」と言ってしまうと、いらない不安と作業を生む。
  ng "${WEBOS_URL} につながりません（この端末からネットに出られていない可能性）"
  TODO+=("別のネットワーク（スマホ回線など）から もう一度 npm run check")
else
  ng "${WEBOS_URL} が ${WEBOS_CODE}（200が正解）"
  TODO+=("XServer の public_html/webos/ に index.html があるか確かめる")
fi

# ---- まとめ ------------------------------------------------------------
echo ""
echo "=== まとめ ==="
if [[ "$NG" -eq 0 ]]; then
  echo "✅ 全部おわっています。追加の作業はありません。"
  exit 0
fi

echo "❌ ${NG}個、まだ終わっていません。次の一手:"
for i in "${!TODO[@]}"; do
  echo "  $((i + 1)). ${TODO[$i]}"
done
exit 1
