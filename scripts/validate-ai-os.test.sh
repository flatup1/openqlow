#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
VALIDATOR="$ROOT_DIR/scripts/validate-ai-os.sh"

if [[ ! -x "$VALIDATOR" ]]; then
  echo "FAIL: scripts/validate-ai-os.sh must exist and be executable" >&2
  exit 1
fi

OUTPUT="$("$VALIDATOR")"
printf '%s\n' "$OUTPUT"

grep -Fq "AI OS validation passed" <<<"$OUTPUT"
grep -Fq "10 skills verified" <<<"$OUTPUT"
grep -Fq "Claude safety hook verified" <<<"$OUTPUT"

# Codex execpolicy の実行検査は Codex CLI がある環境でのみ成立する。
# CLI が無い環境（CI・未導入端末）では、明示的に SKIP されていることを確認する。
if command -v codex >/dev/null 2>&1; then
  grep -Fq "Codex rules verified" <<<"$OUTPUT"
else
  grep -Fq "SKIP: Codex CLI unavailable" <<<"$OUTPUT"
fi

# 正本ドリフト検出が実際に働いていること（合格出力に必ず現れる）。
grep -Fq "canon view amounts and times all trace back to canon.ts" <<<"$OUTPUT"

# --- ここから負のテスト（検出器そのものを検査する）---
#
# 背景: ドリフト検出は一度「部分一致」で誤判定していた。grep -F "1,000円" が
# 正本の "11,000円"（グローブセット）に一致し、存在しない値を「あり」として
# 通してしまう欠陥で、検出器として無力な状態が本番に入っていた。
# 「合格すること」だけを見ていると、この種のバグは永久に気づけない。
# そこで、わざと壊した複製に対して検出器が確実に落ちることを確認する。
#
# 実リポジトリは触らない。毎回 clean な複製を作って検査する。
SANDBOX="$(mktemp -d)"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# 追跡ファイルだけを複製した検査用リポジトリを作る。
# git init が必要: 安全フックは `git rev-parse --show-toplevel` で root を解決するため、
# 非gitディレクトリだとフック検査が別要因で落ち、負のテストが空振りになる。
#
# gc.auto=0 / maintenance.auto=false は必須。既定のgitは commit の後に自動メンテナンスを
# **バックグラウンドで**走らせる。その裏プロセスが .git/objects へ書いている最中に
# 次のケースの `rm -rf` が走ると、CIで
# `rm: cannot remove '.../case/.git/objects': Directory not empty` として落ちる。
# 使い捨ての検査用リポジトリにメンテナンスは不要なので、最初から起動させない。
# core.hooksPath=/dev/null は、Mac側の共通git-secrets hookがfixture作成を
# 誤停止するのを防ぐ。AI OS validatorの検査内容自体は変えない。
build_sandbox() {
  local work="$1"
  rm -rf "$work"
  mkdir -p "$work"
  ( cd "$ROOT_DIR" && git ls-files -z ) \
    | ( cd "$ROOT_DIR" && tar --null -T - -cf - ) \
    | ( cd "$work" && tar -xf - )
  ( cd "$work" \
      && git init -q \
      && git -c core.hooksPath=/dev/null -c gc.auto=0 -c maintenance.auto=false add -A \
      && git -c core.hooksPath=/dev/null -c gc.auto=0 -c maintenance.auto=false \
             -c user.email=t@t -c user.name=t commit -qm fixture )
}

# 最重要: 無改変の複製が「通る」ことを先に確認する。
# ここを飛ばすと、複製が壊れているせいで常に落ちるだけの状態でも
# 負のテストが全て緑になり、検出器が無力でも気づけない。
PRISTINE="$SANDBOX/pristine"
build_sandbox "$PRISTINE"
if ! ( cd "$PRISTINE" && bash scripts/validate-ai-os.sh >/dev/null 2>&1 ); then
  echo "FAIL: 検査用の複製が無改変で落ちている。負のテストが無意味になるため中断する。" >&2
  ( cd "$PRISTINE" && bash scripts/validate-ai-os.sh 2>&1 | grep -E '^FAIL' >&2 || true )
  exit 1
fi
echo "PASS[negative]: sandbox is valid when unmodified"

negative_case() {
  local label="$1" file="$2" from="$3" to="$4" expect="$5"
  local work="$SANDBOX/case"
  build_sandbox "$work"

  grep -Fq "$from" "$work/$file" || {
    echo "FAIL[$label]: fixture text not found in $file: $from" >&2
    exit 1
  }
  # sed ではなく perl -0 で厳密置換（区切り文字の衝突を避ける）。
  FROM="$from" TO="$to" perl -0pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/' "$work/$file"

  local out rc
  set +e
  out="$( cd "$work" && bash scripts/validate-ai-os.sh 2>&1 )"
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    echo "FAIL[$label]: 検出器が壊れた正本を素通りさせた（exit 0）" >&2
    exit 1
  fi
  if ! grep -Fq "$expect" <<<"$out"; then
    echo "FAIL[$label]: 期待した検出メッセージが出ない: $expect" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  echo "PASS[negative]: $label"
}

# 1) 正本に存在しない金額を同期ビューへ混入 → 必ず落ちること。
negative_case "unknown amount is rejected" \
  "docs/ai-os/canon/pricing_and_schedule.md" \
  "初回体験: 500円" "初回体験: 2,500円" \
  "has an amount absent from canon.ts"

# 2) 実際に出荷してしまった部分一致バグの再発防止。
#    "5,000円" は正本の "15,000円"（6回券）に文字列として含まれるが、
#    独立した値としては存在しない。素朴な部分一致だとここを取りこぼす。
negative_case "substring match must not pass (regression: 5,000 inside 15,000)" \
  "docs/ai-os/canon/pricing_and_schedule.md" \
  "初回体験: 500円" "初回体験: 5,000円" \
  "has an amount absent from canon.ts"

# 3) 時刻のドリフトも同様に検出されること。
negative_case "unknown time is rejected" \
  "docs/ai-os/canon/pricing_and_schedule.md" \
  "18:00〜21:00" "18:00〜23:00" \
  "has a time absent from canon.ts"

echo "validate-ai-os tests passed"
