# FLATUP AI OS - 現状採点と残作業（AI読み取り用）

> 更新: 2026-07-03 / 下の `yaml` ブロックを正とし、秘密値・個人情報は記載しない。

## SDL採点（100点満点）
| 観点 | 配点 | 現在 | 根拠 |
| --- | --- | --- | --- |
| 機能性・正確性 | 25 | 25 | 正本・受付ゲート・CRM・朝ブリーフ・loopを本番確認 |
| セキュリティ(CIA+脅威) | 30 | 28 | PIIログ防止、1 MiB制限、依存脆弱性0、pii_guard追加。旧Googleキー2個は失効済（人間報告）→実害停止。残: flatup履歴の値除去（値は無効）|
| 保守性 | 20 | 20 | shared正本、薄い再エクスポート、回帰テスト、運用設計書 |
| 効率 | 15 | 15 | 依存ゼロ安全網、systemd timer、差分実装 |
| 完全性・網羅 | 10 | 10 | branded固定URL(G8)を接続済（人間報告）。3repo統合・正本・手順書まで網羅 |
| **合計** | 100 | **98** | 残: G7b履歴書き換え(値は無効化済のセキュリティ衛生)のみ |

## 完了済み（main / production）
- `flatup-ai-os` の顧客向け4経路を `receptionReplyAsync` と `canonContext()` へ接続。
- openQLOWの正本、安全ゲート、障害フォールバック、自己改善loopをVaultへ接続。
- LINE本文、userId、外部APIエラー本文をログへ出さない。過大webhookはHTTP 413。
- openqlow / flatup-ai-os は `npm test` 成功、`npm audit --audit-level=low` で0件。
- openqlow / flatup-ai-os の全Git履歴は秘密候補0件。
- 本番のwebhook、loop、morning、monitor、cloudflaredはactive/enabled。
- 朝ブリーフは `OPENQLOW_LINE_DRY_RUN=true` で自動送信せず、Vaultへ保存。
- 3リポジトリREADMEの地図を追加済み。
- ソースへのPII直書きを検知する `pii_guard` を追加（`secret_guard` と対）。`src/` 全走査で0件を回帰テスト化。
- G7/G8の実行手順書を追加（秘密値・ファイル名を含まない）。人間/Codexがそのまま実行可能。
- **G7ステップ1完了**: 旧Google APIキー2個を人間がGoogle Cloudで失効/ローテーション（2026-07-01, human-attested）。履歴に残る値は無効化済＝悪用不可。残るは履歴からの物理除去(G7b)のみ。
- **G8完了**: branded固定HTTPS URL `line.flatupnarita.jp/openqlow/health` を接続（2026-07-03, human-attested）。openQLOW実行環境のegressポリシーが当該ホストを遮断するため、機械検証はオーナー実測に委譲（`curl -i` で200確認）。

## 残作業（機械可読）
```yaml
project: flatup_ai_os_perpetual_engine
score: 98
target: 100
verified_at: 2026-07-03
repos:
  engine: flatup1/openqlow
  reception: flatup1/flatup-ai-os
  memory: flatup1/flatup
gaps:
  - id: G7a
    title: 旧Google APIキー2個を失効・ローテーション
    area: security
    priority: critical
    repo: google_cloud
    owner: human
    status: done
    verification: human_attested_2026-07-01
    note: 値は無効化済のため、たとえ履歴に残っても悪用不可。実害リスクは停止。
    evidence:
      keys_revoked: 2
      revoked_at: 2026-07-01
  - id: G7b
    title: flatup過去履歴から無効化済みの旧キー文字列を物理除去
    area: security_hygiene
    priority: medium
    repo: flatup1/flatup
    owner: codex
    status: pending
    blocker: このセッションはopenqlowのみスコープ。flatupリポジトリで実施が必要。
    evidence:
      current_head_candidates: 0
      historical_unique_google_api_candidates: 2
      historical_files_affected: 5
      values_are_live: false
    required:
      - オーナー承認後にgit filter-repoで履歴を書き換える
      - 全cloneを再同期し、再スキャン0件を確認する
    runbook: openqlow/docs/RUNBOOK_G7_vault_key_rotation.md
    caution: 秘密値と対象ファイル名をIssueやチャットへ記載しない
  - id: G8
    title: branded固定HTTPS URLをopenQLOWへ接続
    area: reliability
    priority: high
    repo: infrastructure
    owner: human_cloudflare
    status: done
    verification: human_attested_2026-07-03
    note: >-
      openQLOW実行環境のegressポリシーが line.flatupnarita.jp を遮断するため
      機械検証は不可。オーナーが `curl -i` でhealth 200を確認済み。
    evidence:
      expected_host: line.flatupnarita.jp
      expected_path: /openqlow/health
      openqlow_vps: 162.43.41.182
    followups:
      - LINE DevelopersのWebhook URLを新固定URLへ更新済みか人間が最終確認
    runbook: openqlow/docs/RUNBOOK_G8_branded_https_url.md
```

## 不可侵ルール（全AI共通）
自動送信・予約確定・料金変更・返金・退会・謝罪送信なし（人間確認）。秘密/個人情報を git・ログ・チャットに出さない。Python/Flask化しない（依存ゼロTS）。既存(3repo)を壊さない・差分のみ・`npm test`緑維持。

## 参照
- 配線手順: `openqlow/docs/CODEX_REMAINING_WORK.md`
- 3repo統合: `openqlow/docs/UNIFY_3_REPOS.md`
- 全体要件: `openqlow/docs/PERPETUAL_ENGINE_REQUIREMENTS.md`
- 合体の接点: `openqlow/src/aika/receptionist.ts`
- G7手順書: `openqlow/docs/RUNBOOK_G7_vault_key_rotation.md`
- G8手順書: `openqlow/docs/RUNBOOK_G8_branded_https_url.md`
