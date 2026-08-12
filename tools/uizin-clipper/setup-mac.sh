#!/bin/bash
# UIZIN 大会動画 自動切り抜きシステム — Mac用セットアップ
#
# 何度実行しても安全です（入っているものは飛ばします）。
# 途中で失敗したら、直したあともう一度同じコマンドを実行してください。

set -u

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; OFF=$'\033[0m'

ok()   { echo "${GREEN}✓${OFF} $*"; }
todo() { echo "${YELLOW}→${OFF} $*"; }
ng()   { echo "${RED}✗${OFF} $*"; }
step() { echo; echo "${BOLD}$*${OFF}"; }

REPO_URL="https://github.com/flatup1/openqlow.git"
BRANCH="claude/uizin-auto-clip-system-klrph3"
DEST="$HOME/openqlow"

echo "${BOLD}UIZIN 切り抜きシステム セットアップ${OFF}"
echo "入っていないものだけ入れます。5〜30分ほどかかります。"

# ---------------------------------------------------------------- 1. 開発ツール
step "1/5  開発ツール（git・python3）"

if xcode-select -p >/dev/null 2>&1; then
    ok "入っています"
else
    ng "入っていません。ここが最初の関門です。"
    echo
    echo "  これから ${BOLD}インストールのダイアログ${OFF} が出ます。"
    echo "  ${BOLD}他のウィンドウの裏に隠れることが多い${OFF}ので、"
    echo "  F3（Mission Control）を押して探してください。"
    echo
    echo "  見つけたら「インストール」→「同意する」→ 終わるまで待つ（5〜20分）"
    echo
    read -r -p "  Enter を押すとダイアログを出します… " _
    xcode-select --install 2>/dev/null

    echo
    echo "  インストールが終わったら、${BOLD}もう一度このスクリプトを実行${OFF}してください。"
    echo "  ダイアログが出ない場合は、こちらから直接落とせます（Apple ID・無料）:"
    echo "    https://developer.apple.com/download/all/  →「Command Line Tools」"
    exit 1
fi

# ---------------------------------------------------------------- 2. Homebrew
step "2/5  Homebrew（道具を入れるための道具）"

if ! command -v brew >/dev/null 2>&1; then
    # インストール済みだがPATHに無いだけ、という場合を先に救う
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$candidate" ]; then
            eval "$("$candidate" shellenv)"
            break
        fi
    done
fi

if command -v brew >/dev/null 2>&1; then
    ok "入っています（$(brew --version | head -1)）"
else
    todo "入れます。${BOLD}Macのログインパスワード${OFF}を聞かれます。"
    echo "   （打っても画面には何も出ませんが、入力されています）"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || {
        ng "Homebrew のインストールに失敗しました。"
        exit 1
    }
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$candidate" ]; then
            echo "eval \"\$($candidate shellenv)\"" >> "$HOME/.zprofile"
            eval "$("$candidate" shellenv)"
            break
        fi
    done
    command -v brew >/dev/null 2>&1 && ok "入りました" || { ng "brew が見つかりません"; exit 1; }
fi

# ---------------------------------------------------------------- 3. ffmpeg
step "3/5  ffmpeg（動画を切る道具）"

if command -v ffmpeg >/dev/null 2>&1; then
    ok "入っています（$(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)）"
else
    todo "入れます。${BOLD}5〜15分かかります${OFF}（部品が多いので）。"
    brew install ffmpeg || { ng "ffmpeg のインストールに失敗しました。"; exit 1; }
    ok "入りました"
fi

# ---------------------------------------------------------------- 4. コード
step "4/5  切り抜きシステム本体"

if [ -d "$DEST/.git" ]; then
    ok "すでにあります: $DEST"
    git -C "$DEST" fetch origin "$BRANCH" --quiet 2>/dev/null || true
    git -C "$DEST" checkout "$BRANCH" --quiet 2>/dev/null || true
else
    todo "取ってきます: $DEST"
    if ! git clone --quiet "$REPO_URL" "$DEST"; then
        ng "取得に失敗しました。"
        echo "   リポジトリが private の場合は、GitHub のアカウント連携が必要です。"
        exit 1
    fi
    git -C "$DEST" checkout "$BRANCH" --quiet || {
        ng "ブランチ $BRANCH が見つかりません"; exit 1;
    }
    ok "取れました"
fi

TOOL_DIR="$DEST/tools/uizin-clipper"
[ -d "$TOOL_DIR" ] || { ng "フォルダがありません: $TOOL_DIR"; exit 1; }

# ---------------------------------------------------------------- 5. 部品
step "5/5  Python の部品（yt-dlp / numpy / PyYAML）"

# ★この道具専用の置き場所（.venv）に入れます。
#   システムの Python を汚さないので、失敗しても元に戻せます。
#
#   以前は「システムの Python に直接入れる → 拒否されたら --break-system-packages」
#   という2段構えでしたが、実機で壊れました:
#     ・最初の失敗を 2>/dev/null で隠していたので、本当の原因が分からない
#     ・古い pip には --break-system-packages が無く「no such option」で終わる
#   専用の置き場所を使えば、そもそも拒否されないので回避策自体が要りません。

# ★必要なのは 3.10 以上。yt-dlp が 3.9 を非推奨にしており（実機で警告が出た）、
#   いずれ動かなくなる。Mac に最初から入っている python3 は 3.9 のことが多い。
NEEDED='(3, 10)'
is_new_enough() {
    [ -x "$1" ] && [ "$("$1" -c "import sys; print(1 if sys.version_info >= $NEEDED else 0)" 2>/dev/null)" = "1" ]
}

PY="$(command -v python3 || true)"
[ -n "$PY" ] || { ng "python3 が見つかりません"; exit 1; }

if ! is_new_enough "$PY"; then
    todo "Python が古いので新しいものを入れます（今: $("$PY" -V 2>&1)）"
    brew install python || { ng "Python の導入に失敗しました。"; exit 1; }
    PY="$(brew --prefix)/bin/python3"
    is_new_enough "$PY" || { ng "新しい Python が見つかりません: $PY"; exit 1; }
fi
ok "使う Python: $("$PY" -V 2>&1)"

VENV="$TOOL_DIR/.venv"
if ! is_new_enough "$VENV/bin/python"; then
    if [ -e "$VENV" ]; then
        # 古い Python で作った置き場所が残っている。--clear で中身だけ作り直す。
        todo "置き場所が古い Python で作られていたので、作り直します"
    else
        todo "この道具専用の置き場所を作ります: $VENV"
    fi
    "$PY" -m venv --clear "$VENV" || {
        ng "置き場所を作れませんでした。上のエラーをそのまま貼ってください。"
        exit 1
    }
fi

# 古い pip のままだと新しい部品を落とせないことがあるので、先に更新する
"$VENV/bin/python" -m pip install --upgrade pip --quiet || true

# ★ここでエラーを隠さない。隠すと、次に失敗したとき原因が分からなくなる。
"$VENV/bin/python" -m pip install -r "$TOOL_DIR/requirements.txt" --quiet || {
    ng "部品のインストールに失敗しました。上のエラーをそのまま貼ってください。"
    exit 1
}
ok "入りました（$VENV）"

# ---------------------------------------------------------------- 完了
step "セットアップ完了"
echo
echo "${BOLD}次にやること${OFF}"
echo
echo "  1) この2行をコピーして実行（作業フォルダへ移動して、道具を使える状態にする）"
echo "       cd $TOOL_DIR"
echo "       source .venv/bin/activate"
echo
echo "     ${BOLD}ターミナルを開き直すたびに、この2行が必要です。${OFF}"
echo "     成功すると、行の先頭に (.venv) と出ます。"
echo
echo "  2) 大会動画を落とす（4時間ぶんなので20分〜1時間かかります）"
echo "       python -m uizin_clipper download \"https://www.youtube.com/live/P8CCcO_wWq0\""
echo
echo "  3) 落ちたら、スコアボードの位置を教える作業に進みます（初回だけ・約10分）"
echo "       README.md の「ステップ2」を見てください"
echo
echo "  空き容量を ${BOLD}20GB 以上${OFF} 空けておいてください（4時間の動画は5〜15GBあります）。"
echo
