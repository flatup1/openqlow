# 要件指示書 — 返信下書きルーティン（Gmail / LINE公式）

作成日: 2026-09-01 ／ 更新: 2026-09-02 ／ 状態: **Phase 1 実装済み（既定オフ・JIN確認待ち）** ／ 担当: openQLOW

## 1. ひとことで言うと

**問い合わせが来たら、返信の「下書き」だけを自動で作り、JINのLINEに届け、Obsidianに残す。送信はしない。**

送るかどうかを決めるのは、いつでもJIN。AIは下書きまで。

## 2. なぜ作るか

- 返信が遅れると体験予約が逃げる。文章を1から書く時間がいちばんの詰まり。
- 下書きが最初からあれば、JINは「直して送る」だけで済む。
- 何を聞かれたかがObsidianに残るので、あとでFAQと営業改善に使える。

## 3. やること（この指示書の範囲）

1. **Gmail** の新着問い合わせを読む
2. **LINE公式** の新着メッセージを読む
3. 返信の**下書きを作る**（既存のAIKA基準に通す）
4. 下書きを**Obsidianとローカルに保存する**
5. 作った時点で**JINのLINEへ通知する**

この5つを、毎日決まった時間に自動で繰り返す（＝ルーティン）。

## 4. やらないこと（はっきり範囲外）

- お客様へ**自動で送信しない**。Gmailの送信もLINEの返信もしない。
- 予約の確定、料金・返金・退会・休会の確定回答をしない。
- 顧客情報を新しい場所へ勝手に増やさない（保存先は既存のCRMとObsidianだけ）。
- クレーム、ケガ、健康、未成年の話は下書きを作らず「JIN確認」とだけ出す。
- Gmailのラベル変更・既読化・アーカイブをしない（v1では読むだけ）。

`docs/ai-os/canon/approval_matrix.md` の「実行前に人間承認」に合わせる。

## 5. 全体の流れ

```text
[Gmail]  ──┐
           ├─→ ①受信を読む ─→ ②仕分け ─→ ③下書きを作る ─→ ④保存 ─→ ⑤LINEでJINへ通知
[LINE公式] ┘                    │                              │
                                │                              └→ Obsidian（記録）
                                └→ 危ないもの（クレーム/健康/未成年）は
                                   下書きを作らず「JIN確認」だけ通知
```

送信は⑤のあと、JINが自分の手で行う。ここは自動化しない。

## 6. 受信元ごとの要件

### 6-1. Gmail

| 項目 | 決めごと |
| --- | --- |
| 読む範囲 | 環境変数で指定した検索条件のみ（既定: `is:unread newer_than:2d` ＋指定ラベル） |
| 対象外 | 広告メール、請求書、社内メール（除外語リストで落とす） |
| 変更操作 | しない。既読にしない、ラベルもつけない、アーカイブもしない |
| 認証 | Gmail MCP または Google API。鍵は環境変数のみ。ファイルに書かない |
| 取りこぼし対策 | 処理済みメッセージIDを `state/reply_drafts/gmail_seen.json` に残し、二重に下書きを作らない |
| 未接続のとき | 何もしないで終わる。エラーで止めない（`docs/ai-os/integrations/MCP_SETUP.md` の「未接続時は下書き文を出す」に合わせる） |

**v1ではGmailの下書き機能に保存しない。** ローカルとObsidianに置くだけ。
Gmailの下書きに入れるのは外部サービスへの書き込みなので、JIN承認後にv2で足す（`OPENQLOW_GMAIL_SAVE_DRAFT=true` を新設する想定）。

### 6-2. LINE公式

| 項目 | 決めごと |
| --- | --- |
| 受信 | 既存のwebhook（`src/line_bot/webhook.ts`）が受けたメッセージを使う。新しい受信口は作らない |
| 対象 | 承認者（JIN）以外＝お客様・会員からのメッセージ |
| 返信 | **しない。** 既存の `src/line_bot/member_reply_gate.ts` の「既定は送らない」をそのまま守る |
| 個人情報 | userIdは `src/line_bot/pseudonymize.ts` で伏せてから保存・通知する |
| 取りこぼし対策 | 処理済みイベントIDを `state/reply_drafts/line_seen.json` に残す |

## 7. 下書きの作り方（既存のものを使い回す）

新しく作らない。すでにあるものを順に通す。

1. `src/generators/inquiry_reply.ts` の `generateInquiryReply()` — 問い合わせ文から返信案と仕分け（優先度A/B/C、次の一手）を作る
2. `src/generators/reply_gate.ts` の `gateInquiryReplies()` — 送ってよい内容かの関門
3. `src/aika/receptionist.ts` の `receptionReply()` — 正本（`src/shared/canon.ts`）に沿っているか、品質が足りているかを見る
4. `src/safety/check.ts` — 断定・誇張・医療表現などを止める
5. `src/privacy/rules.ts` の `sanitiseFreeText()` — 電話番号・メールを伏字にしてから保存・通知する

**料金・時間・クラス名は必ず `src/shared/canon.ts` から取る。** 推測で書かない。

品質が足りない・危ないと判定されたものは、下書きを出さずに「JIN確認」とだけ通知する。

## 8. 保存（Obsidian とローカル）

### 8-1. Obsidian

既存の置き場に合わせる（新しい階層を勝手に増やさない）。

```text
30_INBOX/openqlow/reply_drafts/YYYY-MM-DD.md   ← その日の下書き一覧
6_システム/openqlow_logs/reply-drafts.jsonl    ← 機械が読む記録（既存の logs と同じ場所）
```

1件の書き方:

```markdown
## 2026-09-01 09:12 gmail #a1b2c3

- 状態: 未送信（下書き）
- 相手: ████（伏字）
- 種類: 体験の問い合わせ / 優先度A
- 次の一手: 日程を2つ提案する

### もらった内容（原文）

（原文をそのまま。要約や書き換えはしない）

### 返信の下書き

（そのまま送れる文）

### 気をつけること

- 料金は canon.ts の正本どおり
- 送るのはJIN。AIは送っていない
```

### 8-2. ローカル

```text
state/reply_drafts/YYYY-MM-DD/<id>.json   ← 下書きの本体
logs/reply_drafts/YYYY-MM-DD.md           ← 実行ログ（何件・何を飛ばしたか）
```

Obsidianが開けない・書けないときも、ローカルには必ず残す（記録を落とさない）。

## 9. LINE通知（JIN宛）

| 項目 | 決めごと |
| --- | --- |
| 送り先 | JINのみ。既存の `src/line_bot/notifier.ts` を使う（他の相手には実装上送れない） |
| 送る中身 | 件数、相手の種類、優先度、下書き本文（長い場合は先頭のみ）、保存先パス |
| タイミング | 下書きを作った時点。ただし静音時間（既定 22:00〜翌7:00）は翌朝7:00にまとめて1通 |
| 上限 | 1回の実行で最大5件まで。超えた分は「ほか◯件」とだけ書く（通知で埋まらないようにする） |
| 二重送信 | 既存の `src/scheduler/run_lock.ts` で止める |
| 伏字 | 電話番号・メール・LINE IDは伏字。氏名は姓＋イニシャル（`src/privacy/rules.ts`） |

通知の見た目（案）:

```text
【返信の下書き】2026-09-01 09:12
新着 2件（Gmail 1 / LINE 1）

① Gmail / 体験の問い合わせ / 優先度A
「小学3年の子どもでも通えますか？」
下書き:
はじめまして。FLATUPの…（そのまま送れる文）

② LINE / 見学の希望 / 優先度B
…

全文: 30_INBOX/openqlow/reply_drafts/2026-09-01.md
※ AIは送っていません。送るのはJINです。
```

## 10. ルーティン（いつ動くか）

| 経路 | 間隔 | 理由 |
| --- | --- | --- |
| Gmail | 15分ごと（8:00〜21:00） | メールは即時性が要らない。夜中は動かさない |
| LINE公式 | webhookで受けた時点＋5分ごとの取りこぼし確認 | 返信の速さが体験予約に直結する |
| 日次まとめ | 毎朝7:00 | 前日ぶんの未対応を1通で出す |

動かし方は既存に合わせる。Mac は `deploy/launchd/`、VPS は `deploy/systemd/`。
新しい仕組みは持ち込まない。

## 11. 安全装置

| 装置 | 既定 | 何を守るか |
| --- | --- | --- |
| `OPENQLOW_REPLY_DRAFT_ENABLED` | `false` | 入れるまで1件も動かない |
| `OPENQLOW_DRY_RUN` | `true` | 保存も通知もせず、画面に出すだけ |
| `OPENQLOW_LINE_DRY_RUN` | 既存に従う | LINE通知を止める |
| 自動送信の禁止 | 実装で固定 | `src/safety/forbidden_actions.ts` の `send_to_customer_directly` を通す |
| 会員への返信 | 既定オフ | `src/line_bot/member_reply_gate.ts` をそのまま使う |
| 緊急停止 | `OPENQLOW_REPLY_DRAFT_DISABLED=true` | 何かおかしいときに即止める |

**「送信」の経路をコードに作らない。** 作らなければ、事故で送ることもない。

## 12. 環境変数（新しく増やすもの）

| 変数 | 既定 | 意味 |
| --- | --- | --- |
| `OPENQLOW_REPLY_DRAFT_ENABLED` | `false` | ルーティン全体のスイッチ |
| `OPENQLOW_REPLY_DRAFT_DISABLED` | `false` | 緊急停止 |
| `OPENQLOW_REPLY_DRAFT_SOURCES` | `line` | `gmail,line` のように使う受信元を書く |
| `OPENQLOW_GMAIL_QUERY` | `is:unread newer_than:2d` | Gmailの検索条件 |
| `OPENQLOW_GMAIL_EXCLUDE` | （空） | 除外する語（カンマ区切り） |
| `OPENQLOW_REPLY_DRAFT_MAX_PER_RUN` | `5` | 1回で作る下書きの上限 |
| `OPENQLOW_REPLY_DRAFT_QUIET_HOURS` | `22-7` | 通知しない時間帯 |
| `OPENQLOW_REPLY_DRAFT_VAULT_DIR` | `30_INBOX/openqlow/reply_drafts` | Obsidianの保存先 |

`true` ちょうどのときだけ有効にする（`1` や `yes` では動かさない）。ゴミ収集クリーンシステムと同じ作法。

## 13. 受け入れ条件（これができたら完成）

- [ ] スイッチを入れないと1件も動かない
- [ ] Gmailを読んでも、既読・ラベル・アーカイブが変わらない
- [ ] お客様へ1通も届かない（送信経路がコードに存在しない）
- [ ] 同じメール・同じLINEから二重に下書きを作らない
- [ ] 同じ日に2回実行しても、JINへの通知は1通
- [ ] Obsidianが書けないときも、ローカルには残る
- [ ] 通知とファイルに電話番号・メールがそのまま出ない
- [ ] 料金・時間・クラス名が `src/shared/canon.ts` と一致する
- [ ] クレーム・健康・未成年の相談は下書きを作らず「JIN確認」と出る
- [ ] Gmail未接続でもエラーで止まらず、LINEぶんだけ動く
- [ ] 上の各項目にテストがある（`npm test` に載る）

## 14. 作る順番

| 段階 | 中身 | 目安 |
| --- | --- | --- |
| Phase 1 | LINE公式のみ。下書き作成＋ローカル保存＋LINE通知 | 最初にここまで |
| Phase 2 | Obsidian保存、日次まとめ、静音時間 | Phase 1が数日安定してから |
| Phase 3 | Gmail読み取りを追加 | 対象アカウントと検索条件をJINが決めてから |
| Phase 4 | Gmailの下書き保存（送信はしない） | JINが必要と判断したら |

一度に全部作らない。段階ごとにJINが見て、納得してから次へ進む。

## 14-2. Phase 1 の実装状況（2026-09-02）

Phase 1（LINE公式のみ）を実装した。**既定では1件も動かない。**

| ファイル | 役割 |
| --- | --- |
| `src/reply_draft/config.ts` | スイッチの読み取り。既定は全部オフ |
| `src/reply_draft/triage.ts` | クレーム・健康・未成年・お金・退会・法律を先に分ける |
| `src/reply_draft/draft.ts` | 既存資産を通して下書きを1件組み立てる |
| `src/reply_draft/store.ts` | 受信の待ち行列と下書きの保存（同じ受信からは1つだけ） |
| `src/reply_draft/notify.ts` | LINE本文と記録の組み立て |
| `src/reply_draft/intake.ts` | webhook の受け口。記録するだけで返信はしない |
| `src/reply_draft/run.ts` | 入口（`npm run reply-draft`） |
| `deploy/launchd/com.flatup.openqlow.reply-draft.plist` | 5分ごとの自動実行（既定はオフ） |

- Obsidianへの保存も入れた（Vaultが見つからない日はローカルだけに残す）。当初Phase 2に置いていたが、記録が残らない期間を作らないため前倒しした。
- 静音時間もこの段階で入れた（夜に作った下書きは翌朝まとめて1通）。
- **送信する関数はこの配下に1つも無い。** LINEへのpushは既存の `notifier.ts` 経由でJIN宛のみ。

詰まらせない・取りこぼさないための作り:

- 1回に作る下書きは `OPENQLOW_REPLY_DRAFT_MAX_PER_RUN` まで。あふれた分は待ち行列に残し、次の実行で作る。
- 実行を始めるとき、待ち行列を切り離してから処理する。実行中にwebhookが受け取ったメッセージは新しい待ち行列に入り、消えない。
- 実行が途中で落ちても、処理中だった受信は次の実行で拾う。
- 1件の下書きが作れなくても実行は止めない。その1件は「JIN確認」として記録し、残りは作る。

有効にする順番:

```bash
# 1. まず様子を見る（保存も通知もしない）
OPENQLOW_REPLY_DRAFT_ENABLED=true npm run reply-draft

# 2. 納得したら保存と通知を有効にする
OPENQLOW_REPLY_DRAFT_ENABLED=true OPENQLOW_DRY_RUN=false npm run reply-draft
```

残りは Phase 2 の日次まとめ、Phase 3 の Gmail、Phase 4 の Gmail下書き保存。

## 15. JINに決めてほしいこと

1. **Gmailはどのアカウントか。** 対象にするラベル・検索条件は？
2. **通知は1件ずつか、まとめてか。** 上の案は「作った時点で即時、夜は翌朝まとめ」。
3. **静音時間は 22:00〜7:00 でよいか。**
4. **下書きの言い回しは誰基準か。** 既存のAIKA基準（`src/aika/receptionist.ts`）でよいか。
5. **Phase 4（Gmailの下書き保存）まで行くか。** ローカルとObsidianだけで足りるか。

この5つが決まればPhase 1から着手できる。決まらない項目があっても、Phase 1（LINE公式のみ）は先に進められる。

## 16. 参照

- `AGENTS.md` — 送信は人間承認後、AIは下書きまで
- `docs/ai-os/canon/approval_matrix.md` — 承認が要る操作の一覧
- `docs/ai-os/workflows/inquiry_to_trial.md` — 問い合わせから体験までの流れ
- `docs/ai-os/integrations/MCP_SETUP.md` — Gmail・LINE公式の接続方針
- `src/shared/canon.ts` — 料金・時間・クラスの正本
- `docs/CLEANUP_SYSTEM.md` — 同じ作法で作った先行例（既定オフ、段階的に有効化）
