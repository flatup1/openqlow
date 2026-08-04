#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT_DIR"

FAILURES=0
fail() {
  echo "FAIL: $*" >&2
  FAILURES=$((FAILURES + 1))
}
pass() {
  echo "PASS: $*"
}

REQUIRED_FILES=(
  AGENTS.md
  CLAUDE.md
  docs/ai-os/README.md
  docs/ai-os/IMPLEMENTATION_REPORT.md
  docs/ai-os/canon/gym_profile.md
  docs/ai-os/canon/pricing_and_schedule.md
  docs/ai-os/canon/membership_rules.md
  docs/ai-os/canon/safety_rules.md
  docs/ai-os/canon/brand_voice.md
  docs/ai-os/canon/approval_matrix.md
  docs/ai-os/workflows/inquiry_to_trial.md
  docs/ai-os/workflows/trial_followup.md
  docs/ai-os/workflows/social_content.md
  docs/ai-os/workflows/weekly_management.md
  docs/ai-os/workflows/file_cleanup.md
  docs/ai-os/templates/inquiry_reply.md
  docs/ai-os/templates/trial_reminder.md
  docs/ai-os/templates/trial_followup.md
  docs/ai-os/templates/social_post.md
  docs/ai-os/templates/weekly_report.md
  docs/ai-os/integrations/MCP_SETUP.md
  docs/ai-os/integrations/AUTOMATION_SETUP.md
  .codex/config.toml
  .codex/rules/flatup-safety.rules
  .codex/hooks.json
  .claude/settings.json
  scripts/sync-agent-skills.sh
  scripts/validate-ai-os.test.sh
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "required file missing: $file"
done
[[ "$FAILURES" -eq 0 ]] && pass "required files present"

SKILLS=(
  flatup-daily-command
  flatup-inquiry-reply
  flatup-trial-followup
  flatup-social-repurpose
  flatup-content-qc
  flatup-weekly-kpi
  flatup-faq-update
  flatup-file-audit
  flatup-campaign-planner
  flatup-change-review
)

for skill in "${SKILLS[@]}"; do
  file="docs/ai-os/skills-source/$skill/SKILL.md"
  [[ -f "$file" ]] || {
    fail "skill missing: $skill"
    continue
  }
  head -n 1 "$file" | grep -Fxq -- "---" || fail "frontmatter start missing: $skill"
  grep -Eq "^name: $skill$" "$file" || fail "name metadata mismatch: $skill"
  grep -Eq "^description: .+" "$file" || fail "description metadata missing: $skill"
done

if ./scripts/sync-agent-skills.sh --check >/dev/null; then
  pass "10 skills verified"
else
  fail "Codex and Claude skill links are not synchronized"
fi

if command -v node >/dev/null 2>&1; then
  for json in .claude/settings.json .codex/hooks.json; do
    if node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$json"; then
      pass "JSON valid: $json"
    else
      fail "invalid JSON: $json"
    fi
  done
else
  fail "Node.js unavailable for JSON and hook validation"
fi

for shell_file in scripts/validate-ai-os.sh scripts/validate-ai-os.test.sh scripts/sync-agent-skills.sh .codex/hooks/guard-command.sh .claude/hooks/guard-command.sh; do
  bash -n "$shell_file" || fail "shell syntax invalid: $shell_file"
done
[[ "$FAILURES" -eq 0 ]] && pass "shell syntax valid"

BROKEN_LINKS="$(find -L .agents/skills .claude/skills -type l -print 2>/dev/null || true)"
if [[ -n "$BROKEN_LINKS" ]]; then
  fail "broken skill symlink detected"
else
  pass "no broken skill symlinks"
fi

CANON_PAIRS=(
  "初回体験500円|初回体験: 500円"
  "2回目以降ビジター3,000円|2回目以降ビジター: 3,000円"
  "キッズ7,700円|キッズ月会費: 7,700円"
  "女性8,800円|女性月会費: 8,800円"
  "男性9,900円|男性月会費: 9,900円"
  "入会金10,000円|入会金: 10,000円"
  "土曜14:30|レディース: 土曜14:30"
)
for pair in "${CANON_PAIRS[@]}"; do
  source_text="${pair%%|*}"
  doc_text="${pair#*|}"
  grep -Fq "$source_text" src/shared/canon.ts || fail "source canon value missing: $source_text"
  grep -Fq "$doc_text" docs/ai-os/canon/pricing_and_schedule.md || fail "AI OS canon view mismatch: $doc_text"
done
pass "pricing and schedule canon checked"

if rg -n --glob 'SKILL.md' '(rm[[:space:]]+-rf|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+clean[[:space:]]+-fd|git[[:space:]]+push[[:space:]]+(--force|-f))' docs/ai-os/skills-source >/dev/null; then
  fail "dangerous command literal found in a Skill"
else
  pass "Skills contain no dangerous command recipes"
fi

for phrase in "AIだけで実行可能" "実行前に人間承認" "実行禁止" "commit" "LINE" "課金"; do
  grep -Fq "$phrase" docs/ai-os/canon/approval_matrix.md || fail "approval rule missing: $phrase"
done
pass "approval matrix checked"

if grep -Fq 'Read(./.env.*)' .claude/settings.json \
  || grep -Fq 'Edit(./.env.*)' .claude/settings.json \
  || grep -Fq 'Write(./.env.*)' .claude/settings.json; then
  fail "Claude env deny rule is too broad and would block .env.example"
elif grep -Fq 'Read(./.env)' .claude/settings.json \
  && grep -Fq 'Read(./.env.local)' .claude/settings.json; then
  pass "Claude secret env rules preserve .env.example access"
else
  fail "Claude secret env deny rules are incomplete"
fi

if rg -n '(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|Bearer[[:space:]]+[A-Za-z0-9._-]{30,})' docs/ai-os .agents .claude .codex scripts/validate-ai-os.sh >/dev/null; then
  fail "possible secret value found in AI OS files"
else
  pass "no obvious secret values found"
fi

if find docs/ai-os -type f \( -iname '*member-roster*' -o -iname '*customer-list*' -o -iname '*会員名簿*' -o -iname '*顧客一覧*' -o -iname '*健康情報*' \) -print | grep -q .; then
  fail "customer-data-like filename found under docs/ai-os"
else
  pass "no customer-data-like files found"
fi

if command -v codex >/dev/null 2>&1; then
  RULES=.codex/rules/flatup-safety.rules
  FORBIDDEN_JSON="$(codex execpolicy check --rules "$RULES" -- rm -rf example 2>/dev/null || true)"
  PROMPT_JSON="$(codex execpolicy check --rules "$RULES" -- git push origin feature 2>/dev/null || true)"
  if grep -Fq '"decision":"forbidden"' <<<"$FORBIDDEN_JSON" && grep -Fq '"decision":"prompt"' <<<"$PROMPT_JSON"; then
    pass "Codex rules verified"
  else
    fail "Codex rule decisions did not match forbidden/prompt expectations"
  fi
else
  fail "Codex CLI unavailable for execpolicy validation"
fi

DENY_INPUT='{"tool_name":"Bash","tool_input":{"command":"git reset --hard HEAD"}}'
ASK_INPUT='{"tool_name":"Bash","tool_input":{"command":"git push origin feature"}}'
DENY_OUTPUT="$(printf '%s' "$DENY_INPUT" | FLATUP_HOOK_ENGINE=codex .codex/hooks/guard-command.sh 2>/dev/null || true)"
ASK_OUTPUT="$(printf '%s' "$ASK_INPUT" | CLAUDE_PROJECT_DIR="$ROOT_DIR" .claude/hooks/guard-command.sh 2>/dev/null || true)"
if grep -Fq '"permissionDecision":"deny"' <<<"$DENY_OUTPUT" && grep -Fq '"permissionDecision":"ask"' <<<"$ASK_OUTPUT"; then
  pass "Claude safety hook verified"
else
  fail "Claude hook did not deny/ask as expected"
fi

if grep -Fxq 'approval_policy = "on-request"' .codex/config.toml \
  && grep -Fxq 'sandbox_mode = "workspace-write"' .codex/config.toml \
  && grep -Fxq 'hooks = true' .codex/config.toml; then
  FEATURES_OUTPUT="$(codex features list 2>/dev/null || true)"
  if grep -Eq '^hooks[[:space:]]+stable[[:space:]]+true$' <<<"$FEATURES_OUTPUT"; then
    pass "Codex project config checked and hooks stable"
  else
    fail "installed Codex CLI does not report stable enabled hooks"
  fi
else
  fail "Codex project config is missing required safety settings"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "AI OS validation failed: $FAILURES issue(s)" >&2
  exit 1
fi

echo "AI OS validation passed"
