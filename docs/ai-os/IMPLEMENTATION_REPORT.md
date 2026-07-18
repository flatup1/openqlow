# FLATUP GYM AI OS 実装レポート

実装日：2026-07-18
対象リポジトリ：openqlow
ブランチ：claude/flatup-gym-ai-os-b94eak

## 1. 調査した既存構成

- `AGENTS.md`：既存の詳細な憲法（承認ゲート・協業ルール・セキュリティ）。**保持**。
- `CLAUDE.md`：**存在しなかった** → 新規作成。
- `.claude/skills/run-openqlow-dryrun/`：既存 Skill。**保持**。
- `.agents/` `.codex/`：**存在しなかった** → 新規作成。
- `.gitignore`：既存。**追記のみ**（上書きせず）。
- `scripts/hooks/`：既存の pre-commit / commit-msg（git-secrets, 協業チェック）。**保持**、新規ガードを追加。
- 言語：TypeScript / Node.js。パッケージ：npm。

## 2. 作成したファイル

- `CLAUDE.md`（新規・簡潔版）
- `docs/ai-os/README.md`, `docs/ai-os/IMPLEMENTATION_REPORT.md`
- 正本 `docs/ai-os/canon/`：gym_profile / pricing_and_schedule / membership_rules / safety_rules / brand_voice / approval_matrix
- ワークフロー `docs/ai-os/workflows/`：inquiry_to_trial / trial_followup / social_content / weekly_management / file_cleanup
- 雛形 `docs/ai-os/templates/`：inquiry_reply / trial_reminder / trial_followup / social_post / weekly_report
- 連携 `docs/ai-os/integrations/`：MCP_SETUP / AUTOMATION_SETUP
- Skills 正本 `docs/ai-os/skills-source/`（10件）＋ 配布 `.claude/skills/`・`.agents/skills/`（各10件）
- `.codex/rules/flatup-safety.md`
- `.claude/settings.json`, `scripts/hooks/flatup-guard.sh`
- `scripts/validate-ai-os.sh`, `scripts/sync-agent-skills.sh`

## 3. 変更した既存ファイル

- `AGENTS.md`：末尾に「FLATUP GYM AI OS」参照節を**追記**（既存内容は保持）。
- `.gitignore`：AI OS 用の除外ルールを**追記**（既存は保持）。

## 4. バックアップ場所

- 今回は既存ファイルの**全面上書きなし**（AGENTS.md と .gitignore は追記のみ）。破壊的変更がないためバックアップ退避は未使用。
- 今後、既存正本を変更する場合は `.ai-os-backup/<日時>/` へ退避する運用（`.gitignore` 済み）。

## 5. 実装した Skills（10）

flatup-daily-command / flatup-inquiry-reply / flatup-trial-followup / flatup-social-repurpose / flatup-content-qc / flatup-weekly-kpi / flatup-faq-update / flatup-file-audit / flatup-campaign-planner / flatup-change-review

各 SKILL.md に `name` / `description`（使うとき・使わないとき）を記載。正本は canon を参照し、長文を埋め込まない。

## 6. Claude Code 側の安全設定

- `.claude/settings.json`：`permissions.deny`（rm -rf / reset --hard / clean -fd / force push / .env 読取）、`permissions.ask`（push / commit / deploy）、`PreToolUse` フックで `flatup-guard.sh` を実行。
- `scripts/hooks/flatup-guard.sh`：Bash コマンドを検査し、危険操作を deny、push/commit/deploy/外部送信を ask。jq 無しでも動作（deny は exit 2）。
- JSON 構文検証済み、フック動作テスト済み（deny/ask/allow）。
- `--dangerously-skip-permissions` を前提にしない設計。

## 7. Codex 側の安全設定

- `.codex/rules/flatup-safety.md`：拒否リスト（rm -rf / reset --hard / clean -fd / force push / DB削除 等）と確認リスト（push / PR / deploy / 外部API / 課金）。
- Codex のバージョンにより Rules の解釈が異なる可能性があるため、機械実行に依存しすぎず、人間・AI 双方が読める安全規約としても機能する形式にした。

## 8. 検証結果

`bash scripts/validate-ai-os.sh` を実行（結果はチャットの最終報告に記載）。
確認項目：必須ファイル存在 / 10 Skills の正本・両配布・frontmatter / JSON 構文 / シェル構文 / 壊れたシンボリックリンク / 秘密情報らしい文字列 / Skills・canon 内の危険コマンド混入 / 料金参照元の一元化。

## 9. 未実装項目

- MCP サーバーの実接続（GitHub 以外）：未接続。`integrations/MCP_SETUP.md` に候補を記載。
- 定時実行の実設定：架空設定を作らず `integrations/AUTOMATION_SETUP.md` に候補（launchd/cron/GitHub Actions 等）を記載。
- Skills は 10 個のみ（50選のうち高頻度分）。残りは運用しながら順次。

## 10. 外部連携に必要な作業

- LINE公式 / 会費ペイ / Instagram / Googleスプレッドシート等の接続状況を実環境で確認（採点の残り6点に相当）。
- まず読み取り専用で接続し、書き込み・送信は人間承認を挟む。

## 11. 人間が確認すべき事項

- 料金・スケジュール・退会規定が最新か（`canon/pricing_and_schedule.md`, `canon/membership_rules.md`）。
- この AI OS を openqlow に置くか、flatup / flatup-ai-os にも展開するか。
- commit / push / PR を行うか（本実装は未実施。承認待ち）。

## 12. 次に実装すべき優先順位

1. 実環境での正本値の突合（料金・日時・退会）。
2. LINE / スプレッドシート等の読み取り接続。
3. 週次KPIの自動集計（読み取り系のみ定時実行）。
4. 50選の残り Skills を利用頻度順に追加。

## 13. 正本整合（2026-07-18 追記）

初版の `docs/ai-os/canon/` は指示書の数値を直書きしていたが、リポジトリには既に
**唯一の正本 `src/shared/canon.ts`（永久機関 R2/R4：数値を直書きしない）** と
**`src/shared/cancellation_rules.md`（退会・休会・違約金の正本）** が存在した。
オーナー判断により、canon の値を確定版に一致させ、以下を修正した。

- タグライン：「世界一初心者に優しい」→ **「世界一優しい格闘技ジム（太陽のジム）」**（BRAND と一致）
- 退会：「当月申請」→ **「当月末日までの申請で翌月末退会」**（cancellation_rules.md と一致）
- クラス：3種 → **9クラス**（ボクシング/キック/ムエタイ/寝技/レスリング/MMA/BJJ/キッズ/レディース）
- 体験予約枠：確定版の bookingMen（火木土 or 平日19時以降）／bookingWomen（月水土）に一致
- 追加した確定情報：グローブ＋レガース 11,000円 / 住所（成田市土屋516-4 2F）/ 最寄駅・アクセス /
  親子割 −500円 / 紹介特典 / 専用駐車場 / スタッフ在館時間（平日10-12・18-20、土クラス制）
- 確定版に無い記載を削除：カードキー未返却・紛失 1,000円 / 体験30分・説明込み40分 / 軍手可
  （根拠が確定版に無いため。復活が必要なら先に `src/shared/canon.ts` へ追記して正式化する）

各 canon ファイル冒頭に「値の唯一の正本は `src/shared/canon.ts`」と明記し、以後のドリフトを防止。
テンプレート（inquiry_reply / trial_reminder）と `CLAUDE.md` のタグラインも整合済み。
