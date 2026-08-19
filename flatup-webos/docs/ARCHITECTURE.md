# ARCHITECTURE — 構成と技術選定

## 現状調査の結果（2026-08-19時点）

| 資産 | 場所 | 役割 |
|---|---|---|
| openqlow | GitHub `flatup1/openqlow` | AI頭脳・LINE bot・CRM・安全網。VPS常時稼働 |
| 事実の正本 | `openqlow/src/shared/canon.ts` | 料金・時間・クラス等の唯一の正本 |
| 既存LP | `openqlow/flatup-lp/index.html` | 静的LP（XServer等へ配置可能な単一HTML） |
| VPS構成 | `openqlow/deploy/`（nginx / systemd / AnythingLLM / richmenu） | LINE・AI・自動処理 |
| flatup-ai-os | GitHub `flatup1/flatup-ai-os` | AIKA下書きOS（TypeScript / 依存ゼロ / OpenRouter） |
| flatup (Vault) | GitHub `flatup1/flatup` | Obsidian正本・人格・日次運用 |

**FLAT UP WebOSは `openqlow/flatup-webos/` に独立ディレクトリとして配置。**
理由: (1) Web公開資産（flatup-lp）とVPS構成が既にopenqlowにある、
(2) 正本 `canon.ts` とAI頭脳に最も近い、(3) 既存構成を壊さず追加のみで済む。
将来必要になれば独立リポジトリ `flatup-webos` へ切り出せる構成（自己完結）を維持する。

## ホスティング思想（XServer / VPS の役割分担）

### XServer — ユーザーへ公開するWeb側

- Web UI / SEO対象ページ / 静的アセット / 必要に応じたフロントエンド /
  画像 / 動画 / LP / WebOS UI

### VPS — 常時稼働が必要な処理

- AI API / LINE Bot / WebチャットAPI / バックエンド / データベース /
  共通ロジック / 将来的な自動処理

**現在の実環境を調査せずに既存構成を壊してはいけない。まず調査する。**
（VPS上の実稼働状態はこのリポジトリからは未確認。Phase 2でVPS接続する前に必ず実環境を確認する。）

## 全体構成（目標形）

```text
                  ┌─ WebOS（XServer / 静的配信）
USER ─ FLAT UP ──┼─ LINE（VPS / 既存bot）
                  └─ Future App
                       │
                       ▼
                Shared AI Layer（VPS / One Brain）
                       │
              Knowledge / Context（canon.ts・Vault正本）
                       │
                    Booking（体験予約）
```

## 技術選定（Phase 1）

原則: 保守しやすい / Claude Code・Codexが理解しやすい / スマホ高速 /
XServerへ配置可能 / VPS APIと接続可能 / TypeScript優先 / コンポーネント化 / 過剰設計しない。

**Phase 1の結論: ビルド不要・依存ゼロの静的Web（HTML + CSS + Vanilla JS）**

- XServerへそのままアップロードでき、追加コストゼロ
- flatup-ai-os と同じ「依存ゼロ」思想。npm脆弱性・ビルド事故と無縁
- 質問定義はデータ（`questions.js`）として分離し、ロジックと切り離す
- Phase 2でVPS AI接続やページ数増加により必要になった時点で、
  TypeScript + 軽量ビルド（例: Vite）への移行を検討する。早すぎる導入はしない

## State設計

ユーザー回答は少なくとも概念的に以下の形で保持する（実装時に改善可）。

```ts
type UserJourney = {
  audience?: string;
  gender?: string;
  goal?: string[];
  experience?: string;
  availability?: string[];
  currentStep: number;
};
```

- 保存先はブラウザの `sessionStorage`（Phase 1）。サーバーへ送信しない。
- 質問ロジックをハードコードしすぎない。質問はデータ駆動（→ USER_FLOWS.md）。

## ディレクトリ構成

```text
flatup-webos/
├── README.md            # 入口
├── AGENTS.md            # AI憲法
├── docs/                # 思想・設計の正本（Phase 0成果物）
├── references/          # 参考サイト資料の置き場（原則URLとメモ）
└── app/                 # Phase 1 MVP（静的Webアプリ）
    ├── index.html
    ├── styles.css
    └── js/
        ├── questions.js   # 質問定義（データ）
        ├── state.js       # UserJourney状態管理
        ├── analytics.js   # イベント計測（Phase 1はローカル記録）
        ├── concierge.js   # AI API接続用interface（Phase 1はスタブ）
        └── app.js         # 画面遷移・描画
```

## 拡張の原則

WebOSは将来のFLAT UP AI OSの一部になる（→ ROADMAP.md Phase 4）。
そのため拡張可能でありつつ、過剰設計しない。
不要なマイクロサービス・巨大DB・新規SaaSを安易に追加しない。
