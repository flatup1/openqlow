# COORDINATION（AI協業ボード）

> このファイルは Claude と Codex が衝突しないように作業領域を分けるための **黒板** です。
> 作業を始める前に必ず読み、自分の担当外には触らないでください。
> オーナーJINがハブとなり、両AIが書いた内容を見て差配します。

最終更新: 2026-08-29

---

## 0. 最重要ルール（両AI共通）

1. **作業前にこのファイルを読む**。担当外領域は読み取り専用。
2. **コミットメッセージ先頭に発信元AIを書く**：`claude: ...` または `codex: ...`（共同は `co-ai:`、JIN手作業は `jin:`）。
3. **push 権限は JIN が持つ**。AIは commit までOK、push は JIN 承認後。
4. **触りたい領域が他AI担当だったら、JIN に確認**。勝手に解除しない。
5. **作業切替時はハンドオフ書を書く**：`docs/HANDOFF_<日付>_<from>→<to>.md`
6. **並列度は L2（分担並列）が基本**。重要決定・本番反映は L1（シーケンシャル）。
7. **同じファイルを両AIが触ってしまった衝突時は、作業中AIが即停止 → JIN に報告 → JIN が手動マージ**。

> ※ §0 は `AGENTS.md` の「AI協業ルール（7項）」と整合させること（2026-07-07 に rule6/7 を反映）。ルート直下の `COORDINATION.md` はこのファイルへのシンボリックリンク。

---

## 1. ファイル領域の担当

| 領域 | 担当AI | ステータス | 最終更新 |
|---|---|---|---|
| `openqlow/src/sources/` | Claude | open | 2026-06-06 |
| `openqlow/src/distribution/` | Claude | open | 2026-06-06 |
| `openqlow/src/generators/` | Claude | open | 2026-06-06 |
| `openqlow/src/crm/` | Claude | open | 2026-06-11 |
| `openqlow/src/brand_growth/` | Claude | open | 2026-08-29 |
| `openqlow/src/scheduler/` | Codex | open | 2026-06-06 |
| `openqlow/src/monitor/` | Codex | open | 2026-06-06 |
| `openqlow/src/line_bot/` | Codex | open | 2026-06-06 |
| `openqlow/src/safety/` | Codex | open | 2026-06-06 |
| `openqlow/src/approval/` | Codex | open | 2026-06-06 |
| `openqlow/src/commands/` | Codex | open | 2026-06-06 |
| `openqlow/src/publish/` | Codex | open | 2026-06-06 |
| `openqlow/src/adapters/` | Codex | open | 2026-06-06 |
| `openqlow/src/conversation/` | Codex | open | 2026-06-06 |
| `openqlow/src/state/` | Codex | open | 2026-06-06 |
| `openqlow/src/privacy/` | Codex | open | 2026-06-06 |
| `openqlow/deploy/` | Codex | open | 2026-06-06 |
| `openqlow/scripts/` | Codex | open | 2026-06-06 |
| `openqlow/scripts/adapters/` | Codex | open | 2026-06-08 |
| `openqlow/docs/ai-os/` | Codex | open | 2026-07-18 |
| `openqlow/docs/flatup-ai-os/` | Codex（設計） | open | 2026-08-14 |
| `openqlow/src/brand_growth/` | Claude Code（実装） | Phase 4最終commit `14aae4b`までpush済み / 2026-08-29 JIN承認により`main`へ統合 / Phase 5以降は未着手 | 2026-08-29 |
| `openqlow/.agents/skills/flatup-*` | Codex | open | 2026-07-18 |
| `openqlow/.claude/skills/flatup-*` | Codex | open | 2026-07-18 |
| `openqlow/.claude/hooks/` | Codex | open | 2026-07-18 |
| `openqlow/.codex/` | Codex | open | 2026-07-18 |
| `openqlow/scripts/*ai-os*` | Codex | open | 2026-07-18 |
| `openqlow/tools/uizin-clipper/` | Claude | open | 2026-08-07 |
| `openqlow/ai-glasses/` | Claude Code | open / Phase 0（調査・採点）完了、Phase 1-A未着手 | 2026-08-28 |
| `openqlow/docs/` | 共有 | open | - |
| `openqlow/docs/superpowers/specs/` | 共有 | open | 2026-06-12 |
| `flatup-ai-os/src/data/` | Claude | open | 2026-06-06 |
| `flatup-ai-os/src/ai/` | Codex | open | 2026-06-06 |
| `flatup-ai-os/src/utils/` | Codex | open | 2026-06-06 |
| `flatup-ai-os/src/index.ts` | Codex | open | 2026-06-06 |
| `docs/` (HelMES直下) | 共有 | open | - |
| `obsidian-vault/` | 共有 | open | - |
| `COORDINATION.md` | 共有 | open | - |

> ※ `flatup-ai-os/*` は6月までの旧AI-OS。AIKA本番の実働は `flatup1/flatup`（AIKA VPS 162.43.90.71）側。詳細は [[project-handoff-v4]]（2026-07-02 確定）。flatup-ai-os を触る前に現行かどうかJINに確認。

### ステータスの意味

- `open` ：担当AIが触ってOK、他AIは読み取り専用
- `locked` ：担当AIが現在作業中、他AIは絶対触らない
- `paused` ：作業途中で中断、再開待ち（理由を「現在のロック」に書く）

---

## 2. 現在のロック（作業中）

なし

### Phase 4 の現在状態（Claude Code 記入 / 2026-08-29）

- 対象: `src/brand_growth/` Phase 4「Quality Guardian and Growth Metadata」
- branch: `claude/flatup-gym-ai-os-phase4-20260816`
- branch最終commit: `14aae4b`。`origin/claude/flatup-gym-ai-os-phase4-20260816` へpush済み。
- 2026-08-29にJINがmergeを承認し、最新`main`との競合を解消して本merge commitで統合した。
- 経緯: Claude Code の Phase 4 実装 → Codex レビュー反映 `706da60` → `main` を merge `b5c3965`
  → push → 2026-08-29 の境界仕上げ（ローカル1 commit・未push）。
  2026-08-16 時点で「ローカルのみ・未push・`971f53e`」と書いていた記述は、この時点で古くなっている。
- 2026-08-29 の追加作業（Claude Code / `14aae4b`）: 境界と文書整合性の仕上げ。
  - `src/brand_growth/storage/config.ts` から環境変数と暗黙の作業ディレクトリ依存を除去し、
    呼び出し側からの明示注入だけで保存先が決まる純関数にした（基準が無ければ fail closed）。
  - 境界検査の `process.env` 例外を撤廃し、`src/brand_growth` 全体で環境の読み取りを禁止した。
    fs / path の許可はファイル単位の完全一致のみで、storage に新しいファイルを足しても
    権限を継承しないことを恒久的な反証テストで固定した。
  - `docs/flatup-ai-os/adr/ADR-0015-NARROW-LOCAL-EVENT-STORE-BOUNDARY.md` を追加し、
    `AGENTS.md` の「pure」記述を storage adapter の例外つきへ最小修正した。
- 引き継ぎ書: `docs/HANDOFF_20260816_claude→codex.md`（§0 に 2026-08-29 の更新注記あり）
- Codex 承認: **2026-08-29 に Approved**（境界検査のファイル単位例外 / ADR-0015）。
  absolute root のみで cwd を渡さない経路は、機能OFF・呼び出し元未接続・明示 root が管理側の信頼済み入力である
  現 Phase 4 では受容。**将来の本番 integration caller は absolute cwd / repositoryRoot を必須で渡す**運用条件付き。
  部分文字列による境界検査も保守的な fail-closed として承認。→ Codex 側のレビュー事項はクローズ。
- push / merge: **JIN承認済み・完了**。deployと実データ投入は未実施。
- JIN 承認が要る事項: deploy、実データ投入の開始
- Phase 5・Phase 6 は未着手（指示により禁止中）

## 3. 並列度のレベル

| レベル | 方式 | 推奨場面 |
|---|---|---|
| L1 シーケンシャル | 1AIずつ、終わるまで他は待機 | 重要決定・本番反映 |
| **L2 分担並列** ⭐ | 担当領域を分けて並列OK | 通常開発 |
| L3 自由並列 | 触る範囲制限なし | 急ぎの実験のみ |

**基本はL2**。JINが「L1で」「L3で」と明示しない限りL2扱い。

---

## 4. 既知の役割分担（2026-06-06時点）

### Claude（コンテンツ層）
- ブランド表現・キャンペーン規約・知識（canon_2026.md）
- テーマ生成・本文テンプレート
- 投稿レビュー・採点
- 顧客対応文面ドラフト
  - 集客AI司令塔「問い合わせ返信AIKA」 `src/generators/inquiry_reply.ts`（生成のみ・自動送信なし）
  - 集客AI司令塔「体験後フォロー＋口コミ依頼」 `src/generators/trial_followup.ts`（trialインタビュー項目を入力に流用・状態管理は持たない）
  - 集客AI司令塔「広告文生成」 `src/generators/ad_copy.ts`（ターゲット×媒体・配信なし）
  - 集客AI司令塔「サイト改善チェック」 `src/generators/site_audit.ts`（入力テキスト評価・ネットワーク取得なし）
  - 見込み客CRM `src/crm/`（台帳・追客抽出・日報・自己修復ログ・intake）
  - LINE接続口 `src/crm/line_intake.ts`（webhook配線はCodexへハンドオフ → `docs/HANDOFF_2026-06-11_claude→codex.md`）
- Brand Growth 領域 `src/brand_growth/`（Phase 1〜4。ドメインロジックは純関数。ローカル記録の追記だけ `storage/event_store.ts` がファイルI/Oを持つ（ADR-0015）。ネットワーク・課金・公開なし。AIKA / canon / safety / line_bot / publish / scheduler / loop / animation / deploy は読み取りもせず変更しない）
- ドキュメント整備

### Codex（フロー層 + ブラウザ投稿全般）
- LINE webhook・コマンドルーティング
- 承認フロー（OK/修正/NO）
- VPS Monitor / systemd / cloudflared
- 日報パーサ・スケジューラ
- VPSデプロイ運用
- 自己修復ロジック
- 汎用ブラウザ投稿ランナー `scripts/mac-browser-poster.mjs`
- **Google Business / LINE VOOM 専用アダプタ** `scripts/adapters/`（半自動・JIN視覚確認）

### Brand Growth Design Pack（2026-08-14 JIN承認）

- Codex: `docs/flatup-ai-os/` の設計、競合確認、受入条件、Claude Codeへの引き渡し
- Claude Code: 承認された設計に従う `src/brand_growth/` の段階実装とテスト
- JIN: ブランド、料金、規約、安全、主要KPI、Provider有効化、本番変更の最終承認
- 既存AIKA、canon、承認、LINE、公開、デプロイの責務は変更しない。Brand Growth側から重複実装しない。
- branch `claude/flatup-gym-ai-os-phase1-15lytr`で、Phase 1 Router `b941924`、Phase 2 Knowledge Registry `dd82d90`、Phase 3 Director / Prompt IR `fcdb1b6`はpush済み。Phase 4は branch `claude/flatup-gym-ai-os-phase4-20260816` の最終commit `14aae4b`までpushし、2026-08-29にJIN承認のもと`main`へ統合した。本番Runtimeへの接続、外部接続、deployは未着手。

---

## 5. インフラ情報（両AI参照用）

| 項目 | 値 |
|---|---|
| openQLOW VPS | `162.43.41.182`（`line.flatupnarita.jp` / オーナー側自動化） |
| openQLOW VPS パス | `/opt/openqlow`, `/opt/flatup-ai-os` |
| AIKA VPS | `162.43.90.71`（`aika.flatupnarita.jp` / 顧客向けAIKA・WebOS→LINE） |
| WebOS journey本番 | `https://aika.flatupnarita.jp/journey`（AIKA Python実装のみ） |
| デプロイ方式 | rsync / scp（git管理なし） |
| GitHub | openQLOW=`flatup1/openqlow`、AIKA=`flatup1/flatup` |
| 主要 systemd unit | openqlow-webhook, openqlow-monitor.timer, openqlow-daily.timer, openqlow-morning.timer, cloudflared-openqlow |
| LINE openQLOW | @817nsdhr |
| LINE AIKA | @jfl0054o（末尾は英字o） |

---

## 6. コミットメッセージ規約

### 必須プレフィックス

```
claude: feat(scope): description
codex:  feat(scope): description
```

両AI同一作業の稀なケース：
```
co-ai: ...
```

JINの手作業：
```
jin: ...
```

### 例

```
claude: feat(canon): add canon_2026.md
codex: feat(monitor): add VPS self-healing
jin: chore: bump deps
```

---

## 7. ハンドオフ書の運用

作業を相手AIに渡すときは、必ず `docs/HANDOFF_YYYYMMDD_<from>→<to>.md` を書く。
テンプレ：`docs/templates/HANDOFF.md`

ハンドオフ書に書くこと（最小）：
- 今やったこと
- 未完了で残したこと
- 触ったファイルパス（git diff のサマリ）
- 受け手AIへの注意事項
- JIN確認待ち事項

---

## 8. 領域の追加・変更

新しいディレクトリを作る場合、このファイルに**先に追記してから**実装する。

担当変更したい場合：
1. JINに依頼
2. JINがCOORDINATION.mdを更新
3. 両AIに通知

---

## 9. 衝突発生時の対応

万が一同じファイルを両AIが触ってしまった場合：

1. **作業中のAIは即停止**（最新のコミットだけ残す）
2. **JINに報告**：「Claude/Codex 同時編集発生、 `<file>` で衝突」
3. **JINが手動マージ**または**片方のコミットを revert**
4. **COORDINATION.md に再発防止策を追記**

---

## 10. このファイル自身の更新ルール

- `COORDINATION.md` 自体は **共有**領域
- 両AIが書き込み可能だが、書く時は「自分のAI名」を明示
- 担当変更などの構造変更は **JINが最終承認**
