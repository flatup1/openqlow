# FLATUP AI OS - 現状採点と残作業（AI読み取り用）

> 更新: 2026-06-27 / 下の `yaml` ブロックを正とし、秘密値・個人情報は記載しない。

## SDL採点（100点満点）
| 観点 | 配点 | 現在 | 根拠 |
| --- | --- | --- | --- |
| 機能性・正確性 | 25 | 25 | 正本・受付ゲート・CRM・朝ブリーフ・loopを本番確認 |
| セキュリティ(CIA+脅威) | 30 | 23 | PIIログ防止、1 MiB制限、依存脆弱性0。残: Vault過去履歴の旧Googleキー候補 |
| 保守性 | 20 | 20 | shared正本、薄い再エクスポート、回帰テスト、運用設計書 |
| 効率 | 15 | 15 | 依存ゼロ安全網、systemd timer、差分実装 |
| 完全性・網羅 | 10 | 8 | 残: branded固定URLとVault履歴浄化 |
| **合計** | 100 | **91** | 外部・人間承認が必要な2項目を残す |

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

## 残作業（機械可読）
```yaml
project: flatup_ai_os_perpetual_engine
score: 91
target: 100
verified_at: 2026-06-27
repos:
  engine: flatup1/openqlow
  reception: flatup1/flatup-ai-os
  memory: flatup1/flatup
gaps:
  - id: G7
    title: Vault過去履歴の旧Google APIキー候補を失効・除去
    area: security
    priority: critical
    repo: flatup1/flatup
    owner: human_then_codex
    status: blocked_human_approval
    evidence:
      current_head_candidates: 0
      historical_unique_google_api_candidates: 2
      historical_files_affected: 5
    required:
      - Google Cloud側で該当キー2個を失効またはローテーション
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
    status: blocked_external_configuration
    evidence:
      expected_host: line.flatupnarita.jp
      expected_path: /openqlow/health
      current_http_status: 404
      current_dns_target: 162.43.90.71
      openqlow_vps: 162.43.41.182
      fallback_http_status: 200
      tunnel_type: accountless_quick_tunnel
    required:
      - Cloudflareでnamed tunnelまたはDNS/reverse-proxy経路を作る
      - HTTPSの固定URLでhealth 200を確認する
      - LINE Developersのwebhook URL変更は人間確認後
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
