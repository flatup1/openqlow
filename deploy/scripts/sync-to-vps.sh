#!/usr/bin/env bash
# OPENQLOW Mac → VPS 単方向同期スクリプト
# state/ drafts/ logs/ など本番側で増殖するものは必ず除外する。
# 使い方: bash deploy/scripts/sync-to-vps.sh

set -euo pipefail

SSH_KEY="${OPENQLOW_VPS_KEY:-$HOME/.ssh/openqlow_vps}"
SSH_USER="${OPENQLOW_VPS_USER:-root}"
SSH_HOST="${OPENQLOW_VPS_HOST:-162.43.41.182}"
REMOTE_DIR="${OPENQLOW_VPS_REMOTE:-/opt/openqlow/}"
AIKA_RESERVED_HOST="162.43.90.71"

if [[ "$SSH_HOST" == "$AIKA_RESERVED_HOST" || "$SSH_HOST" == "aika.flatupnarita.jp" ]]; then
  echo "停止: openQLOWの同期先にAIKA VPSは指定できません。" >&2
  echo "openQLOWの正しい同期先は 162.43.41.182 です。" >&2
  exit 2
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)/"

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .git
  # 先頭の / は「プロジェクトの一番上だけ」という意味。これが無いと、
  # rsync は同じ名前のフォルダを どの階層でも 除外してしまう。
  #
  # 2026-10-02 に実際に起きたこと:
  #   'state/' と書いていたため src/state/ まで除外され、VPS には
  #   古い src/state/file_store.ts が残り続けた。本番ビルドが
  #     error TS2724: has no exported member named 'readRecord'
  #   で失敗した。手元とCIは正しいので、絶対に気づけない壊れ方だった。
  #
  # ここで消したいのは本番で増え続ける一番上の state/ drafts/ logs/ dist/ だけ。
  --exclude '/dist/'
  --exclude '/state/'
  --exclude '/drafts/'
  --exclude '/logs/'
  # 本番が「いまどのコードで動いているか」の印。deploy-vps.sh がビルド成功後に
  # 書く。リポジトリには無いので --delete の対象になり、ビルドが失敗すると
  # 印だけ消えて「一度も反映できていません」と誤って出る。消させない。
  --exclude '/deployed-version.txt'
  --exclude '*.log'
  --exclude '.env'
  --exclude '.env.*'
  --exclude '.phase2-backup/'
  # npm のキャッシュ・ログは本番に不要。中の *.log が除外されるため
  # --delete がディレクトリを消せず rsync が終了コード23で落ちる原因にもなる。
  --exclude '.npm/'
  --exclude '.DS_Store'
  # Cloudflare の開発ごっこ用データ（miniflare の sqlite）。手元で動かすときだけ
  # 使うもので、VPS では一切読まない。中身は毎回書き換わるので、置いておくと
  # 反映のたびに送り直しになる。
  #
  # 以前は上の 'state/' が（階層を限定していなかったため）偶然これも除外していた。
  # 一番上だけに直したときに外れてしまったので、名指しで止める。
  --exclude '.wrangler/'
  # 映像・アニメ素材は VPS では一切使わない（LINEのプログラムからの参照はゼロ）。
  # Mac のレンダリング結果まで送ると16GB超になり、反映に数時間かかっていた。
  # 除外したものは VPS 側に残る（--delete は除外パスを消さない）。
  --exclude 'brand-film-ep*/'
  --exclude 'brand-film-series/'
  --exclude 'animation-studio/'
  --exclude 'gymstorys/'
  --exclude 'girl-power-op/'
  --exclude 'flatup-lp/'
  --exclude 'flatup-webos/'
  # uizin-clipper は Mac 専用の Python 道具。ダウンロードした大会動画が
  # 16GB たまっていて、これが同期の止まる最大の原因だった。VPS は Node の
  # webhook しか動かさないため、tools/ は丸ごと不要。
  --exclude 'tools/'
  # 上のフォルダ以外に置かれた大きなファイルも念のため止める
  --exclude '*.mp4'
  --exclude '*.mov'
  --exclude '*.m4v'
  --exclude '*.wav'
  --exclude '*.psd'
  --exclude '*.zip'
  --exclude '*.webm'
  --exclude '*.mkv'
  --exclude '*.ts.part'
  --exclude '*.part'
)

echo "[sync-to-vps] source: $PROJECT_ROOT"
echo "[sync-to-vps] target: ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
echo "[sync-to-vps] excludes: ${RSYNC_EXCLUDES[*]}"

# rsync の終了コード 23/24 は「除外ファイルが残っていてディレクトリを消せない」
# 「転送中にファイルが消えた」といった軽微な警告。転送自体は完了しているので、
# ここで止めずに警告として流す。それ以外の失敗はそのまま異常終了させる。
rsync_status=0
# -v: 何を送っているかを表示する。無言だと「フリーズした」と区別がつかず、
# 実際に16GBを送り続けていることに気づけなかった。
rsync -avz --delete "${RSYNC_EXCLUDES[@]}" \
  -e "ssh -i ${SSH_KEY}" \
  "$PROJECT_ROOT" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}" || rsync_status=$?

case "$rsync_status" in
  0) ;;
  23|24)
    echo "[sync-to-vps] 警告: 一部のファイルを削除/転送できませんでした (rsync ${rsync_status})。転送は完了しています。"
    ;;
  *)
    echo "[sync-to-vps] エラー: rsync が失敗しました (終了コード ${rsync_status})" >&2
    exit "$rsync_status"
    ;;
esac

# rsync は Mac の UID/GID をそのまま転送するため、VPS 側で
# webhook プロセスのユーザ (openqlow) が state/ drafts/ logs/ に
# 書き込めなくなる。同期後に明示的に chown して、書き込み対象ディレクトリも作っておく。
echo "[sync-to-vps] fixing ownership on ${REMOTE_DIR} → openqlow:openqlow"
ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" \
  "mkdir -p ${REMOTE_DIR}state ${REMOTE_DIR}drafts ${REMOTE_DIR}logs && \
   chown -R openqlow:openqlow ${REMOTE_DIR}"

echo "[sync-to-vps] done."
