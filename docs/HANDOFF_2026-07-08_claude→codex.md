# HANDOFF 2026-07-08 claude→codex 【CLOSED / 決定記録】

## 決定（JIN・2026-07-08）
朝の日報は **LINEだけで十分**。→ `DAILY-BRIEF.md` の Vault 保存は **有効化しない**。

**Codexへの依頼はありません。触らないでください。** この項目はクローズ。

## つまり何もしない
- `OPENQLOW_WRITE_DAILY_BRIEF` は **既定 false のまま**。
- 本番 `/etc/openqlow/openqlow.env` も `deploy/openqlow.vps.env.example` も **変更不要**。
- 朝07:00 JST の LINE 実送信（`openqlow-morning.timer` / `OPENQLOW_LINE_DRY_RUN=false`）は従来どおり稼働。日報はそれで届く。

## 背景（なぜ検討したか・なぜやめたか）
- 統合コード（`morning_briefing.ts` の `writeDailyBriefToVault`, フラグ `OPENQLOW_WRITE_DAILY_BRIEF`）は 2026-06-27 に本番mainへ導入済み。だが有効化フラグ未投入で眠っていた。
- 有効化を検討したが、本番 `OBSIDIAN_VAULT_ROOT=/opt/obsidian-vault` は VPS ローカルで、JIN の Mac Vault とは別物。「日報をどこで読むか」をJINに確認 → **LINEで十分**との回答。
- よって Vault 保存は不要。コードは残置（将来必要になれば env 1行で有効化できる）。

## 将来もし気が変わったら
`OPENQLOW_WRITE_DAILY_BRIEF=true` を本番envに足すだけで有効化可能。ただしその前に「DAILY-BRIEF をどこに置き、どうJINへ届けるか（Mac Vault同期 等）」を先に決めること。

---
発信: claude / 受け: codex・JIN / 状態: CLOSED（作業不要）
