#!/usr/bin/env bash
#
# Mac用: このファイルを Finder で**ダブルクリック**すると、本番公開が始まります。
#
# 中身は scripts/go-live.sh を呼ぶだけ。ターミナルを開いてコマンドを打つ代わりに、
# ダブルクリック1回で済むようにしてあるだけです。
#
# 失敗しても窓がすぐ閉じないようにしてあります（理由が読めないと直せないため）。

set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd -P)"

clear
printf '\033[1m=== UIZIN EventOS を本番に出します ===\033[0m\n'
printf '\033[2m何度やっても安全です。同じ場所に上書きするだけです。\033[0m\n'

STATUS=0
bash scripts/go-live.sh "$@" || STATUS=$?

printf '\n'
if [ "${STATUS}" -ne 0 ]; then
  printf '\033[31m止まりました。\033[0m 上に出ている赤い文字が理由です。\n'
  printf 'そのままコピーして JIN に見せれば、どこで止まったか分かります。\n\n'
fi

printf 'Enterキーを押すと、この窓を閉じます。\n'
read -r _ || true
exit "${STATUS}"
