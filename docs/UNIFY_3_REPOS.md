# FLATUP 3リポジトリ統合 指示書（Codex 貼り付け用 / 中学生にもわかる版）

> 対象3リポジトリ:
> - `flatup1/flatup`（Obsidian Vault = 記憶と人格）
> - `flatup1/openqlow`（エンジン = 頭脳と安全網・正本）
> - `flatup1/flatup-ai-os`（受付AIKA = お客様対応・LLM）
> 実装者: Codex / 設計: Claude。既存の上に積む・作り直さない・`npm test`緑・秘密はgitに入れない。

## 1. ゴール（中学生にもわかる説明）
FLATUPのAIは今3つの「箱」に分かれています。これを **1つの脳** として、情報を整理して共有します。

| 箱 | 役割（たとえ） | 中身 |
|---|---|---|
| **flatup**（Obsidian） | 🧠 記憶と心 | ルール(AGENTS.md)・オーナー情報(USER.md)・理念(SOUL.md)・毎日の記録(daily_logs) |
| **openqlow** | 🧮 考える頭脳＋良心(安全網) | 集客SNS(攻め)・**正本**(料金等の事実)・優しさ採点・障害フォールバック・受付接点・自己改善ループ |
| **flatup-ai-os** | 👄 お客様対応の口(守り) | LINEでやさしく返すAIKA(LLM) |

→ 3つが **「1冊の正本・1つの優しさルール・1つの記憶」** を共有すれば完成。

## 2. 情報共有のルール（ここが“整理”の核）
1. **事実は1か所だけ**：料金・住所・営業・クラス・特典は **`openqlow/src/shared/canon.ts`（`FLATUP_CANON`）だけ**が正。
   - flatup-ai-os はこれを読む（直書き・推測しない）。
   - flatup(Obsidian) は人間用に `00_CANON/正本.md` で**同じ内容を参照**（openqlowを正とする）。
2. **優しさは1つの門番**：お客様に出す全返信は **`openqlow/src/aika/receptionist.ts` の `receptionReplyAsync`** を通す（正本注入＋100点採点＋reject差し替え＋障害フォールバック）。
3. **記憶は1つの脳**：LINEログ・日報は flatup(Obsidian) に貯め、**`openqlow/src/loop`（`npm run loop`）が読み込み→採点→改善提案**を出す。

## 3. Codex 残作業
### T1 受付AIを安全網につなぐ（flatup-ai-os）
`docs/CODEX_REMAINING_WORK.md` の **T1** を実施（4つの依存ゼロ安全網ファイルをコピー＋各 `line_reply/followup/review_request/daily_manager` を `receptionReplyAsync` 経由に＋`canonContext()` をプロンプトへ）。

### T2 記憶をつなぐ（flatup ↔ openqlow loop）
- `openqlow` の環境変数 `OPENQLOW_LOG_INBOX` を flatup の `01_DAILY_OPERATIONS/daily_logs/` に向ける（または日次同期）。
- loop の出力（scorecard・改善提案）を flatup の `6_システム/openqlow_loop/` に保存。
- 取り込み時 **PIIマスク必須**（`openqlow/src/loop/ingest.ts` 利用）。

### T3 各リポジトリに「地図README」を置く（中学生向け・3行）
各repoの先頭READMEに:
1. この箱は何か（記憶／頭脳／受付）
2. 他の箱との関係（正本は openqlow）
3. 触る前に読む正本（`openqlow/src/shared/canon.ts`）

### T4 24時間化・鍵
`docs/CODEX_REMAINING_WORK.md` の **T2/T3**（cloudflared固定URL・自動再起動・loop常駐・APIキーは各自`.env`・**公開repoに鍵が無いか確認**）。

## 4. 完了の定義（100点）
- [ ] 事実は **canon 1か所**、全返信は **門番1つ**、記憶は **vault 1つ**。
- [ ] 3repoのREADMEに「地図」があり、中学生でも「どの箱が何か」分かる。
- [ ] LLM障害でも沈黙しない／24時間自動復帰／二重送信なし。
- [ ] 秘密・個人情報が git に無い（公開 flatup-ai-os を含め確認）。
- [ ] 自己改善ループが毎日 採点→改善提案を出す。

## 5. 不可侵ルール
自動送信・予約確定・料金変更・返金・退会・謝罪送信なし（人間確認）。秘密/個人情報を git・ログ・チャットに出さない。Python/Flask化しない（依存ゼロTS）。既存(flatup/openqlow/flatup-ai-os)を壊さない・差分のみ。

## 6. 参照
- 合体の接点: `openqlow/src/aika/receptionist.ts`（`receptionReplyAsync`/`canonContext`）
- 正本/ゲート/フォールバック: `openqlow/src/shared/*`・`openqlow/port/aika/*`
- 残作業詳細: `openqlow/docs/CODEX_REMAINING_WORK.md`
- 設計: `openqlow/knowledge/wiki/{perpetual-engine,100-point-roadmap}.md`
