---
name: flatup-change-review
description: Use to independently review proposed code, configuration, copy, or canon changes before integration. Do not use to approve your own release, commit, push, deploy, or bypass the owner gate.
---

# FLATUP Change Review

## Review order

1. Read the request, current `AGENTS.md`, `COORDINATION.md`, and relevant canon.
2. Inspect the complete diff and list changed files.
3. Check that only intended files changed and user work is preserved.
4. Check existing behavior, security, personal data, secrets, and canon consistency.
5. Run the smallest relevant tests plus `./scripts/validate-ai-os.sh` for AI OS changes.
6. Classify findings by severity and identify all human approval gates.

If there are no findings, state exactly what was checked and which risks remain. Review never equals permission to publish or deploy.
