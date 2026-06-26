# FLATUP AI OS — 現状採点と残作業（AI読み取り用）

> 更新: 2026-06-26 / このファイルは他AI(Codex等)が読んで続行するための**機械可読ステータス**です。
> 下の `yaml` ブロックを正とし、散文は人間用の補足です。

## SDL採点（100点満点）
| 観点 | 配点 | 現在 | 根拠 |
| --- | --- | --- | --- |
| 機能性・正確性 | 25 | 24 | 単一正本・正本一貫性ガード・77テスト緑 |
| セキュリティ(CIA+脅威) | 30 | 27 | secret_guard(鍵検知)・PII除去(氏名含)・禁止行為ブロック・自動送信なし。残: 公開repo鍵スキャン/本番秘密管理 |
| 保守性 | 20 | 19 | src/shared 一本化・薄い再エクスポート・テスト網羅 |
| 効率 | 15 | 14 | 依存ゼロTS・ルールベースは無コスト |
| 完全性・網羅 | 10 | 8 | AIKA配線/24時間/鍵投入が未(コード外) |
| **合計** | 100 | **92** | |

## 完了済み（main）
- 単一正本 `src/shared/canon.ts`、優しさゲート `src/shared/response_quality.ts`、障害フォールバック `src/shared/fallback_reply.ts`
- 受付アダプタ `src/aika/receptionist.ts`（`receptionReply` / `receptionReplyAsync` / `canonContext`）
- 自己改善ループ `src/loop/*`（取り込み[PII/氏名マスク]→採点→改善提案、Vault出力）
- セキュリティ/正本ガード `src/shared/secret_guard.*` / `src/shared/canon.test.ts`
- `npm test` 77グループ緑

## 残作業（機械可読）
```yaml
project: flatup_ai_os_perpetual_engine
score: 92
target: 100
repos:
  engine: flatup1/openqlow          # 母体・正本・安全網（書込可）
  reception: flatup1/flatup-ai-os   # 守りAIKA・LLM（公開・別repo）
  memory: flatup1/flatup            # Obsidian Vault・記憶（非公開想定）
gaps:
  - id: G1
    title: AIKA返信を安全網に配線
    area: integration
    priority: critical
    repo: flatup1/flatup-ai-os
    owner: codex_or_human
    status: implemented_local_unpushed   # Codexがローカル実装済・未push
    detail: >
      src/ai/router.ts で line_reply/followup/review_request/daily_manager を
      receptionReplyAsync 経由にし、各プロンプト先頭に canonContext() を注入。
      安全網4ファイル(canon/response_quality/fallback_reply/receptionist)は
      openqlow/port/aika の依存ゼロ版をコピー。
    acceptance:
      - 全顧客返信が送信前に scoreResponseQuality を通る
      - reject級は正本返信に差し替え（送らない）
      - LLM障害(401/timeout)で fallbackReply（沈黙しない）
      - 料金/住所/予定は FLATUP_CANON のみ（直書き禁止）
    reference: openqlow/docs/CODEX_REMAINING_WORK.md#T1
  - id: G2
    title: 公開repoの鍵漏れスキャン
    area: security
    priority: high
    repo: flatup1/flatup-ai-os
    owner: codex_or_human
    status: not_started
    detail: flatup-ai-os は公開中。全履歴に APIキー/トークンが無いか確認し、あれば失効&除去。
    acceptance:
      - git log -p / secret scanner でヒット0
      - openqlow/src/shared/secret_guard.ts のパターンを流用
  - id: G3
    title: 24時間インフラ
    area: reliability
    priority: high
    repo: flatup1/openqlow
    owner: human_on_vps
    status: partial   # systemd/timer 雛形あり・本番有効化未
    detail: cloudflared固定URL、webhook/トンネル/LLMの死活監視+自動再起動、openqlow-loop.timer有効化、AIKAサービスのsystemd化。
    acceptance:
      - 落ちても自動復帰・沈黙しない・二重送信なし
    reference: openqlow/docs/CODEX_REMAINING_WORK.md#T2
  - id: G4
    title: APIキー投入（秘密管理）
    area: security
    priority: high
    repo: all
    owner: human
    status: not_started
    detail: OPENROUTER_API_KEY / LINE_CHANNEL_* / Meta / Google を各サーバ .env に。gitに入れない。
    acceptance:
      - .env.example に全キー列挙（空値）
      - 実値はサーバのみ・secret_guard で混入検知
  - id: G5
    title: 3リポジトリの地図README（情報共有の整理）
    area: docs
    priority: medium
    repo: all
    owner: any_ai
    status: not_started
    detail: 各repo先頭READMEに「この箱は何か/正本はopenqlow/触る前に読むのは canon.ts」を中学生向け3行。
    reference: openqlow/docs/UNIFY_3_REPOS.md#T3
  - id: G6
    title: Vaultに人間用正本参照
    area: docs
    priority: low
    repo: flatup1/flatup
    owner: any_ai
    status: not_started
    detail: flatup の 00_CANON/正本.md に openqlow/src/shared/canon.ts の内容を人間向けに反映（openqlowを正とする）。
```

## 不可侵ルール（全AI共通）
自動送信・予約確定・料金変更・返金・退会・謝罪送信なし（人間確認）。秘密/個人情報を git・ログ・チャットに出さない。Python/Flask化しない（依存ゼロTS）。既存(3repo)を壊さない・差分のみ・`npm test`緑維持。

## 参照
- 配線手順: `openqlow/docs/CODEX_REMAINING_WORK.md`
- 3repo統合: `openqlow/docs/UNIFY_3_REPOS.md`
- 全体要件: `openqlow/docs/PERPETUAL_ENGINE_REQUIREMENTS.md`
- 合体の接点: `openqlow/src/aika/receptionist.ts`
