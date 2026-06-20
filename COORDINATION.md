# COORDINATION（AI協業ボード）

> このファイルは Claude と Codex が衝突しないように作業領域を分けるための **黒板** です。
> 作業を始める前に必ず読み、自分の担当外には触らないでください。
> オーナーJINがハブとなり、両AIが書いた内容を見て差配します。

最終更新: 2026-06-20

---

## 0. 最重要ルール（両AI共通）

1. **作業前にこのファイルを読む**。担当外領域は読み取り専用。
2. **コミットメッセージ先頭に発信元AIを書く**：`claude: ...` または `codex: ...`
3. **push 権限は JIN が持つ**。AIは commit までOK、push は JIN 承認後。
4. **触りたい領域が他AI担当だったら、JIN に確認**。勝手に解除しない。
5. **作業切替時はハンドオフ書を書く**：`docs/HANDOFF_<日付>_<from>→<to>.md`
6. **ブランチは必ず最新 `origin/main` から切る**。`git fetch origin` → `git checkout origin/main -b <branch>` の順。**local main から直接枝を切らない**（古い local main から切ると、他AIの作業を消す危険なブランチができる）。
7. **作業開始時と push 前に同期を確認する**：`git fetch origin` → `git status -sb`（origin との先行/遅延を見る）→ `git log --oneline -5 origin/main`（他AIの最新を把握）。**local main が origin より遅れていたら、その上で作業しない**。

---

## 0.1 事故防止チェックリスト（毎回・コミット/プッシュ前）

```text
□ COORDINATION.md を読んだ（§1 で自分の担当領域を確認した）
□ git fetch origin した
□ git status -sb で origin/main との差を確認した（◯ahead / ◯behind）
□ 触ったファイルは全部「自分の担当領域」内か？（担当外なら handoff に切替）
□ コミットメッセージ先頭は claude: / codex: / co-ai: / jin: のどれか
□ ブランチは origin/main 起点か？（local main 起点はNG）
□ push する前に JIN の承認を得たか？
```

### 過去事故ログ（同じ轍を踏まないために）
- **2026-06-20 / Claude**: COORDINATION.md を読まずに作業開始 →
  (1) Codex 領域 `scripts/` を編集しようとした、
  (2) **56コミット遅れた local main から枝を切って push**し、origin/main より 5850 行少ない「マージ即データ消失」ブランチを作った、
  (3) JIN 承認前に push した。
  → 危険ブランチは削除済み。原因は全て「§0 を最初に守らなかった」こと。
  対策として §0 に rule 6/7 と本チェックリストを追加。

---

## 1. ファイル領域の担当

| 領域 | 担当AI | ステータス | 最終更新 |
|---|---|---|---|
| `openqlow/src/sources/` | Claude | open | 2026-06-06 |
| `openqlow/src/distribution/` | Claude | open | 2026-06-06 |
| `openqlow/src/generators/` | Claude | open | 2026-06-06 |
| `openqlow/src/crm/` | Claude | open | 2026-06-11 |
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
| `openqlow/docs/` | 共有 | open | - |
| `openqlow/docs/superpowers/specs/` | 共有 | open | 2026-06-12 |
| `flatup-ai-os/src/data/` | Claude | open | 2026-06-06 |
| `flatup-ai-os/src/ai/` | Codex | open | 2026-06-06 |
| `flatup-ai-os/src/utils/` | Codex | open | 2026-06-06 |
| `flatup-ai-os/src/index.ts` | Codex | open | 2026-06-06 |
| `docs/` (HelMES直下) | 共有 | open | - |
| `obsidian-vault/` | 共有 | open | - |
| `COORDINATION.md` | 共有 | open | - |

### ステータスの意味

- `open` ：担当AIが触ってOK、他AIは読み取り専用
- `locked` ：担当AIが現在作業中、他AIは絶対触らない
- `paused` ：作業途中で中断、再開待ち（理由を「現在のロック」に書く）

---

## 2. 現在のロック（作業中）

なし

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

---

## 5. インフラ情報（両AI参照用）

| 項目 | 値 |
|---|---|
| openQLOW VPS | 162.43.41.182（openqlow-vps / Ubuntu 24.04） |
| openQLOW VPS パス | `/opt/openqlow`, `/opt/flatup-ai-os` |
| AIKA VPS | 162.43.90.71（別マシン） |
| デプロイ方式 | rsync / scp（git管理なし） |
| GitHub | flatup1/openqlow, flatup1/flatup-ai-os |
| 主要 systemd unit | openqlow-webhook, openqlow-monitor.timer, openqlow-daily.timer, openqlow-morning.timer, cloudflared-openqlow |
| LINE openQLOW | @817nsdhr |
| LINE AIKA | @jfl0054o |

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
