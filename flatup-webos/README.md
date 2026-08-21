# FLAT UP WebOS

**世界一優しい格闘技ジムの、世界一優しいWebOS。**

---

## FLAT UP WebOSとは何か

これは一般的な「キックボクシングジムのホームページ」ではありません。

FLAT UP GYM（千葉県成田市）の思想・Web・AI・LINE・予約導線を将来的に統合するための
**Webアプリケーション**です。ユーザーに優しく質問し、回答に応じて必要な情報だけを届け、
安心して体験予約まで進んでもらうことを目的とします。

## North Star（北極星）

> 世界一優しい格闘技ジム FLAT UP GYMへ、ユーザーを迷わせず、
> 必要な情報だけを必要な瞬間に届け、安心して最初の一歩＝体験予約まで進める
> 「世界一優しいWebOS」をつくる。

すべての機能・デザイン・文章・演出は、次の3つで判断します。

1. これはユーザーを安心させているか？
2. これはユーザーを迷わせていないか？
3. これは体験予約までの心理的負担を減らしているか？

かっこよくても不安を増やす機能は不要。技術的に高度でも迷わせる機能は不要です。

## なぜ普通のホームページではないのか

```text
従来型サイト:  閲覧 → 大量の情報 → 自分で探す → 比較する → 迷う → 予約
FLAT UP WebOS: 訪問 → 優しく質問 → 選択 → ユーザーを理解 → 不要情報を消す
               → 必要な情報だけ見せる → 安心 → 相談 → 体験予約
```

情報を並べて「探させる」のではなく、質問に答えるだけで
「その人専用に編集されたFLAT UP GYM」が現れる体験を作ります。

## 全体アーキテクチャ（概要）

```text
                  ┌─ WebOS（このディレクトリ / XServer想定）
USER ─ FLAT UP ──┼─ LINE（既存 / VPS）
                  └─ Future App
                       │
                       ▼
                Shared AI Layer（VPS / openqlow）
                       │
              Knowledge / Context（canon.ts ほか正本）
                       │
                    Booking（体験予約）
```

詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照。

## Phase構成

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 0 | 思想・要件のドキュメント固定（このdocs/） | ✅ 完了 |
| Phase 1 | MVP: Q1に答え、回答を保持し、簡易結果から体験予約へ | ✅ 完了（`app/`） |
| Phase 2 | 全質問フロー・パーソナライズ強化・VPS AI接続・LINE接続 | 未着手 |
| Phase 3 | Cinematic WebOS（3D・映像演出。CVRを落とすなら削除） | 未着手 |
| Phase 4 | FLAT UP AI OS への統合 | 構想 |

詳細は [docs/ROADMAP.md](docs/ROADMAP.md) を参照。

## 起動方法（Phase 1 MVP）

依存ゼロの静的Webアプリです。ビルド不要。

```bash
# ローカル確認（どちらでも可）
open flatup-webos/app/index.html            # ファイルを直接開く
npx serve flatup-webos/app                  # または簡易サーバー
python3 -m http.server -d flatup-webos/app  # または Python
```

XServerへはそのまま `app/` の中身をアップロードすれば動きます。

### 変更したら（2つだけ）

```bash
npm run test:webos-flow         # フロー自動検証（ブラウザ不要・CIでも毎回走る）
npm run test:webos-canon-sync   # 料金・LINE URLが正本とズレていないか照合
```

`app/` のJS・CSSを変えたら、`index.html` の `?v=` の数字を1つ上げる。
これを忘れると、古いファイルがスマホに残って新しい画面が出ない。

テストの詳細は [test/README.md](test/README.md) を参照。

## 開発原則（要約）

- 小さく完成させて、大きく育てる（設計→最小実装→テスト→採点→改善→次のPhase）
- 主役はユーザー。ジムは「主人公を助ける仲間・案内役」
- 最小質問数 × 最大パーソナライズ × 最短予約導線（質問は「予約前に必要か？」で判定）
- 選択していない情報は原則表示しない（Progressive Disclosure）
- モバイルファースト（iPhone最優先）
- 既存資産 > 無料OSS > 安価な既存サービス > 新規有料サービス
- 既存システム（openqlow / flatup-lp / LINE / VPS）を壊さない
- secretsをコミットしない

全文は [docs/PRINCIPLES.md](docs/PRINCIPLES.md) と [AGENTS.md](AGENTS.md) を参照。

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [docs/VISION.md](docs/VISION.md) | North Starとブランド感情 |
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | UX原則15箇条と合言葉 |
| [docs/USER_JOURNEY.md](docs/USER_JOURNEY.md) | 体験設計・ファーストビュー思想 |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | 質問フロー全定義（Mermaid） |
| [docs/PERSONALIZATION.md](docs/PERSONALIZATION.md) | パーソナライズのデータ設計 |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Gentle Adventure デザイン原則 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | XServer/VPS役割分担・技術選定 |
| [docs/AI_CONCIERGE.md](docs/AI_CONCIERGE.md) | One Brain / Multiple Interfaces |
| [docs/CONTENT_STRATEGY.md](docs/CONTENT_STRATEGY.md) | コピー方針とSEO |
| [docs/ANALYTICS.md](docs/ANALYTICS.md) | KPIとイベント設計 |
| [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) | 個人情報・secrets・承認境界 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase 0〜4の詳細 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Phase 1公開手順（XServer）と公開後チェックリスト |
| [references/README.md](references/README.md) | 参考サイトの扱い方 |
