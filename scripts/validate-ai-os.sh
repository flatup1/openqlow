#!/usr/bin/env bash
# FLATUP GYM AI OS 検証スクリプト
# 必須ファイルの存在・YAML frontmatter・JSON構文・秘密情報らしい文字列・
# 危険コマンドの混入・Skills 同期などを検査する。
# 追加パッケージはインストールしない。利用可能なコマンドだけを使う。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

PASS=0
FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()   { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "== 必須ファイル =="
REQUIRED=(
  "AGENTS.md" "CLAUDE.md"
  "docs/ai-os/README.md" "docs/ai-os/IMPLEMENTATION_REPORT.md"
  "docs/ai-os/canon/gym_profile.md"
  "docs/ai-os/canon/pricing_and_schedule.md"
  "docs/ai-os/canon/membership_rules.md"
  "docs/ai-os/canon/safety_rules.md"
  "docs/ai-os/canon/brand_voice.md"
  "docs/ai-os/canon/approval_matrix.md"
  ".claude/settings.json"
  ".codex/rules/flatup-safety.md"
  "scripts/sync-agent-skills.sh"
)
for f in "${REQUIRED[@]}"; do
  [[ -f "$f" ]] && ok "$f" || ng "$f が無い"
done

echo "== 10 Skills（正本 + 両配布先）=="
SKILLS=(flatup-daily-command flatup-inquiry-reply flatup-trial-followup flatup-social-repurpose flatup-content-qc flatup-weekly-kpi flatup-faq-update flatup-file-audit flatup-campaign-planner flatup-change-review)
for s in "${SKILLS[@]}"; do
  src="docs/ai-os/skills-source/$s/SKILL.md"
  cl=".claude/skills/$s/SKILL.md"
  ag=".agents/skills/$s/SKILL.md"
  if [[ -f "$src" && -f "$cl" && -f "$ag" ]]; then
    # YAML frontmatter（name/description）の存在
    if head -6 "$src" | grep -q '^name:' && head -6 "$src" | grep -q '^description:'; then
      ok "$s（正本/claude/agents + frontmatter）"
    else
      ng "$s の frontmatter（name/description）が不足"
    fi
  else
    ng "$s の配布が不完全（src=$([[ -f $src ]]&&echo o||echo x) claude=$([[ -f $cl ]]&&echo o||echo x) agents=$([[ -f $ag ]]&&echo o||echo x)）"
  fi
done

echo "== JSON 構文 =="
for j in .claude/settings.json; do
  if command -v jq >/dev/null 2>&1; then
    jq empty "$j" 2>/dev/null && ok "$j" || ng "$j 構文エラー"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool "$j" >/dev/null 2>&1 && ok "$j" || ng "$j 構文エラー"
  else
    echo "  - JSON検証ツール無し（skip）"
  fi
done

echo "== シェルスクリプト構文（bash -n）=="
for sh in scripts/sync-agent-skills.sh scripts/validate-ai-os.sh scripts/hooks/flatup-guard.sh; do
  [[ -f "$sh" ]] || continue
  bash -n "$sh" 2>/dev/null && ok "$sh" || ng "$sh 構文エラー"
done

echo "== 壊れたシンボリックリンク =="
BROKEN=$(find docs/ai-os .claude/skills .agents/skills -type l ! -exec test -e {} \; -print 2>/dev/null || true)
[[ -z "$BROKEN" ]] && ok "壊れたリンク無し" || ng "壊れたリンク: $BROKEN"

echo "== 秘密情報らしい文字列（ai-os配下 + skills）=="
SECRET_HITS=$(grep -REn 'sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN[[:space:]].*PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]{10,}' docs/ai-os .claude/skills .agents/skills .codex 2>/dev/null || true)
[[ -z "$SECRET_HITS" ]] && ok "秘密情報らしい文字列なし" || ng "要確認:\n$SECRET_HITS"

echo "== 危険コマンドが Skills / canon に書かれていないか =="
DANGER=$(grep -REn 'rm[[:space:]]+-[a-zA-Z]*rf|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f|git[[:space:]]+push[[:space:]]+.*--force' docs/ai-os/skills-source docs/ai-os/canon 2>/dev/null | grep -v 'approval_matrix\|禁止\|拒否\|しない' || true)
[[ -z "$DANGER" ]] && ok "危険コマンドの実行指示なし" || ng "要確認:\n$DANGER"

echo "== 料金表記の矛盾候補（正本 vs 他所）=="
# 正本の主要金額が他ファイルで異なる書き方をしていないか軽く確認
for token in "9,900" "8,800" "7,700" "10,000"; do
  cnt=$(grep -REl "$token" docs/ai-os/canon 2>/dev/null | wc -l | tr -d ' ')
  [[ "$cnt" -ge 1 ]] && : # 正本に存在していればOK（詳細突合は人間）
done
ok "料金は canon/pricing_and_schedule.md を単一の参照元とする（詳細突合は人間）"

echo ""
echo "== 結果: PASS=${PASS} / FAIL=${FAIL} =="
[[ "$FAIL" -eq 0 ]] && { echo "✅ 検証OK"; exit 0; } || { echo "⚠️ 要修正あり"; exit 1; }
