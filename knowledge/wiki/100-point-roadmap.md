---
type: wiki
title: "100点AIロードマップ — 理想を実現するために必要なこと全部"
tags: [roadmap, requirements, auth, vision, checklist]
created: 2026-06-25
updated: 2026-06-25
sources:
  - "[[perpetual-engine]]"
---

# 100点AIロードマップ

[[perpetual-engine|永久機関]]＝「100点AI」を完成させるために必要なものを、**私ができる / あなたが必要 / 私はやらない**に分けて網羅した。

## ゴール（「100点」の定義）
1. 返信が **4観点100点**（共感・不自然なし・重複なし・世界一優しい）。
2. **正本が1つ**で矛盾ゼロ（料金・予定・クラス・住所…確定済み）。
3. 守り **AIKA**＋攻め **OPENQLOW**＋第二の脳が **1つのGitHub** に統合。
4. **24時間**止まらず動く（落ちても自動復帰）。
5. **ログで自己改善**するループが、人間承認つきで回り続ける。

## いま完成しているもの ✅
- 第二の脳（[[second-brain]]）／正本確定（[[flatup-canonical-faq]]）／4観点ゲート（`src/safety/response_quality.ts`）／
  AIKA移植キット（`port/aika/`）／設計図（[[perpetual-engine]]）／運用採点（[[ops-scorecard-2026-06]]）。

---

## まだ必要なもの（4カテゴリ）

### ① リポジトリのアクセス（GitHubのスコープ）
- このセッションは **`flatup1/openqlow` だけ**許可。AIKA（`AIKAAPP` / `flatup-ai-os`）は**読めない**。
- **必要**: あなたが Claude Code on the web の環境に AIKAリポジトリを**追加**する（[docs](https://code.claude.com/docs/en/claude-code-on-the-web)）。
- → 追加後、私が `openqlow/aika/` へ統合できる。

### ② 外部サービスの認証（APIキー・トークン）※秘密。**gitやチャットに置かない**
| サービス | 用途 | ログでの症状 | 用意する人 |
| --- | --- | --- | --- |
| **OpenRouter** APIキー | LLMで返信生成 | 401 "User not found" / "No API provider" | あなた（管理画面で再発行） |
| **LINE Messaging API**（トークン＋シークレット） | 受信・返信 | webhook fetch failed 多発 | あなた |
| **Threads / Instagram / Facebook** Graphトークン | SNS投稿 | Instagram 400 / Facebook 324 | あなた |
| **Google ビジネスプロフィール** | 投稿 | 今は手動パネル運用 | あなた |
| （任意）X/Twitter API | 投稿 | X post 402 | あなた |
- 発行した値は**サーバーの環境変数(.env)**に置く（`.env.example` を私が整備可能）。
- 私は**ブラウザ代行ログインしない**（パスワード/2FAを扱わないため）。発行手順と置き場所は私が用意する。

### ③ サーバー / 24時間インフラ
- **VPS**（常時起動の借りPC）… `deploy/systemd/` 一式あり。
- **cloudflared 固定トンネル**… ngrok動的URLで「承認が届かない」問題の解決。
- **死活監視＋自動再起動**… 一部 `systemd_self_heal` 実装済み。仕上げが必要。
- デプロイはサーバーに入る作業。**手順は私が用意**、実行はあなた（or サーバーアクセス手段の共有）。

### ④ Obsidian Vault の git化
- `/push` が失敗（not a git repository / dubious ownership / sparse-checkout）。
- **直しコマンドを私が用意**できる（VaultをGitHubの第二の脳と同期）。

---

## 私が「できること」メニュー（このセッション）
- `flatup1/openqlow` 内のコード・テスト・正本・ドキュメントの作成/修正。
- **追加されたリポジトリの統合**（AIKAを `aika/` へ、`shared/` に正本＋ゲート抽出、両AI接続）。
- 4観点ゲート・正本・自己改善ループの設計と実装、テストで固定。
- PR作成・採点・レビュー対応・（指示あれば）マージ。
- `.env.example`・デプロイ手順・エラー修正コマンドの作成。

## 私が「やらないこと」（安全のため）
- あなたのアカウントへ**ブラウザ代行ログイン**（パスワード/2FAを扱わない）。
- 秘密鍵・トークンを**git/チャットに残す**。
- **人間確認なし**の送信・予約確定・料金変更（[[forbidden-actions]]）。

---

## おすすめの順番（最短で100点へ）
1. **AIKA統合**: `AIKAAPP`/`flatup-ai-os` をセッション追加 → 私が `aika/` へ統合（Phase 2）。
2. **返信を動かす**: OpenRouter等のキーを再発行 → サーバー `.env` へ。
3. **24時間化**: cloudflared 固定URL＋systemdで自動起動・自動復帰。
4. **ループ稼働**: 毎日ログ取り込み→採点→改善PRを定期実行（人間承認つき）。
5. **Vault同期**: 個人Obsidian Vaultをgit化し第二の脳と接続。

## 関連
- [[perpetual-engine]] — 全体構想
- [[24-7-operation-runbook]] — 24時間運用の設定
- [[flatup-canonical-faq]] — 正本
- [[kindest-ai-response-policy]] — 返信の質
