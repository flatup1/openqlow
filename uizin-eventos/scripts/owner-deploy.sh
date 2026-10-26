#!/usr/bin/env bash
# オーナーの Mac から、Tournament OS を公開する1本（前の ~/a3deploy.sh と同じ仕事を、リポジトリに入れたもの）。
#   1) 決めた枝（ブランチ）を ~/openqlow-a3 に取ってくる（はじめてのときは、新しく取ってくる）
#   2) npm ci（package-lock.json のとおりに部品を入れる。ファイルを書きかえないので、フォルダは「変更なし」のまま）
#   3) npm run deploy:private（作り直し → 自動チェック → 公開する内容の確認 → yes と打ったときだけ公開）
# 使い方（Mac のターミナル）:
#   bash ~/openqlow-a3/uizin-eventos/scripts/owner-deploy.sh            いつもの枝（下の DEFAULT_BRANCH）
#   bash ~/openqlow-a3/uizin-eventos/scripts/owner-deploy.sh 枝の名前   ちがう枝を公開するとき
# ~/openqlow-a3 は、公開するためだけの場所です。そこで手で直した物は、取ってくるときに、取ってきた中身に戻ります。
set -euo pipefail

# いつも公開する枝。ここ1か所だけに書く（枝を変えたら、この1行を直す）
DEFAULT_BRANCH="claude/tournament-os-hanamichi"

# 全部を1つの関数にして、読み終えてから動かす（取ってくると、このファイル自身も新しくなるため）
main() {
  case "${1:-}" in -h|--help) sed -n '2,9p' "$0"; return 0 ;; esac
  local branch="${1:-$DEFAULT_BRANCH}"
  local new="$HOME/openqlow-a3"
  local old="$HOME/tournament-os-latest/uizin-eventos"
  if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
    echo "枝の名前の形が正しくありません: ${branch}（何もしていません）" >&2
    return 2
  fi
  if [ -d "$new/.git" ]; then
    echo "== 1/3 枝「${branch}」を取ってきます（${new}）"
    git -C "$new" fetch --depth 1 origin "$branch"
    git -C "$new" checkout -f -B "$branch" FETCH_HEAD
  else
    # 取ってくる先：前の場所（古い作業フォルダ）と同じ取り先があれば、それを使う（Mac の鍵の設定のまま取れる）
    local origin url
    origin="$(git -C "$old" remote get-url origin 2>/dev/null || true)"
    case "$origin" in
      *flatup1/openqlow*) url="$origin" ;;
      *) url="https://github.com/flatup1/openqlow.git" ;;
    esac
    echo "== 1/3 はじめてなので、新しく取ってきます（${url} の 枝「${branch}」→ ${new}）"
    git clone --depth 1 --branch "$branch" "$url" "$new"
  fi
  cd "$new/uizin-eventos"
  echo "   取ってきたコミット: $(git rev-parse --short HEAD)"
  # はじめの1回だけ：古い場所の公開用フォルダから、ひな形のコピー用リンクの控えを作る（前の ~/a3deploy.sh と同じ）
  if [ ! -f "$HOME/template-link.backup.json" ] && [ -f "$old/out-private-pages/template-link.json" ]; then
    cp "$old/out-private-pages/template-link.json" "$HOME/template-link.backup.json"
    echo "   ひな形のリンクの控えを作りました: $HOME/template-link.backup.json"
  fi
  echo "== 2/3 部品を入れます（npm ci）"
  npm ci --no-audit --no-fund
  echo "== 3/3 公開のコマンド（npm run deploy:private）"
  npm run deploy:private
}
main "$@"; exit $?
