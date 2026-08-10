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

PIP_ARGS=(install -r "$TOOL_DIR/requirements.txt" --quiet)
if ! python3 -m pip "${PIP_ARGS[@]}" 2>/dev/null; then
    # 最近の macOS は外部管理エラーを出すので、その場合だけ回避オプションを付ける
    todo "通常の方法が拒否されたので、--break-system-packages で入れ直します"
    python3 -m pip "${PIP_ARGS[@]}" --break-system-packages || {
        ng "部品のインストールに失敗しました。"
        exit 1
    }
fi
ok "入りました"

# ---------------------------------------------------------------- 完了
step "セットアップ完了"
echo
echo "${BOLD}次にやること${OFF}"
echo
echo "  1) この行をコピーして実行（作業フォルダへ移動）"
echo "       cd $TOOL_DIR"
echo
echo "  2) 大会動画を落とす（4時間ぶんなので20分〜1時間かかります）"
echo "       python3 -m uizin_clipper download \"https://www.youtube.com/live/P8CCcO_wWq0\""
echo
echo "  3) 落ちたら、スコアボードの位置を教える作業に進みます（初回だけ・約10分）"
echo "       README.md の「ステップ2」を見てください"
echo
echo "  空き容量を ${BOLD}20GB 以上${OFF} 空けておいてください（4時間の動画は5〜15GBあります）。"
echo
