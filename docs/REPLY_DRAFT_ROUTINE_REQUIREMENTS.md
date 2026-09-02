# 返信下書きルーティン 要件定義（正本）

- 作成日: 2026-09-02
- Owner: JIN
- 状態: Phase 1 実装済み（LINE公式のみ）
- 実装: `src/reply_drafts/`

## 0. 一言で

問い合わせを受信したら、AIが安全な返信案だけを作ってJINへ届ける。
お客様への送信は行わない。送るか、直すか、返さないかを決めるのは常にJIN。

## 1. 最上位原則

> AIは「考える」。JINが「決める」。JINが「送る」。

顧客への送信は設定でオフにするのではなく、**送るためのコードを実装しない**。
事故防止を運用ルールに頼らず、構造として送れないようにする。
検査は `src/reply_drafts/no_customer_send.test.ts` が自動で行う。

## 2. 絶対にやらないこと

- Gmail の送信・返信、LINE公式からお客様への返信・自動返信
- 予約確定、入会・退会・休会・返金・値引きの確定
- 医療・ケガ・法律・クレーム・未成年のセンシティブ案件についての判断

`sendCustomerReply()` / `replyGmail()` / `sendLineMessageToCustomer()` / `autoReply()` のような
顧客向け送信関数は作らない。JINへの通知だけが例外で、既存の
`src/line_bot/notifier.ts`（承認済み宛先以外へは例外で止まる）を使う。

## 3. 未成年の扱い

「未成年だから全部止める」はしない。止めるのは **未成年 かつ 慎重な判断が要る話** だけ。

| 下書きを作る | JIN確認へ回す |
| --- | --- |
| 小学3年生でも通えますか / 何歳から / キッズは何曜日 / 体験できますか / 持ち物 / キッズの料金 | ケガ・病気・発達・健康相談・いじめ・暴力・学校や保護者のトラブル・契約や料金のトラブル・クレーム・特別な配慮 |

## 4. 処理の流れ

```
受信 → 正規化 → 個人情報マスキング → 重複判定 → 分類 → 危険判定
     → 返信下書き生成 → reply_gate → receptionist → safety/check → 正本の金額チェック
     → ローカル保存 → JINへ通知
```

顧客への送信処理はこの流れに存在しない。

使う既存部品（新しいAIロジックを増やさない）:

| 部品 | 役割 |
| --- | --- |
| `src/privacy/rules.ts` | 電話・メール等を伏字にする |
| `src/generators/inquiry_reply.ts` | 正本ベースの返信候補を作る |
| `src/generators/reply_gate.ts` | 返信候補を4観点で採点する |
| `src/aika/receptionist.ts` | 正本・口調のゲート。却下級は安全文へ差し替え |
| `src/safety/check.ts` | 誇張・断定・医療表現・危険表現・不適切表現の検出 |
| `src/shared/canon.ts` | 料金・時間・住所の唯一の正本 |
| `src/line_bot/notifier.ts` | JINだけへ届くLINE通知 |

## 5. 分類と優先度

分類: 体験 / 見学 / 料金 / 入会 / キッズ / レディース / クラス / 営業時間 / 持ち物 /
アクセス / 駐車場 / 会員からの質問 / その他。

| 優先度 | 対象 |
| --- | --- |
| A | 体験・見学・入会 |
| B | 料金・クラス・営業時間・キッズ・レディース |
| C | その他の一般質問 |
| ESCALATE | JIN判断が必須（返信本文を作らない） |

### JIN確認になる条件

クレーム / 医療・持病 / ケガ / 法律 / 金銭トラブル / 返金 / 退会・休会 / 暴力・いじめ /
事故 / 安全上の配慮 / 未成年のセンシティブ案件 / 特例の要望 / 情報不足 /
正本にない内容（パーソナル・出張・貸切・法人・物販・取材など） /
安全チェックの指摘 / 正本にない金額が混ざった場合。

このとき AI は返信本文を作らず、「JIN確認」とだけ伝える。推測で答えない。

## 6. 重複の扱い

- 完全な Exactly Once は狙わず、**何度受けても結果が1件**（Idempotent）にする。
- 鍵は LINE の `webhookEventId`（無ければ `messageId`、それも無ければ
  「送信元＋送信者＋1分バケット＋正規化本文」の SHA-256 指紋）。
- 台帳は `state/reply_drafts/line_seen.json`。保持は30日で自動的に間引く。
- 抑制の単位は **問い合わせイベント**。同じ日でも別の問い合わせは必ず別通知。

## 7. 保存

| 場所 | 内容 |
| --- | --- |
| `state/reply_drafts/YYYY-MM-DD/<id>.json` | 本体。ここが書けなければ成功扱いにしない |
| `state/reply_drafts/reply-drafts.jsonl` | 将来の集計用。失敗しても本体は残る |
| `logs/reply_drafts/YYYY-MM-DD.md` | 実行ログ（件数・重複・保存エラー・通知エラー） |

保存されるのは **伏字にしたあとの本文** だけ。要約はしないが、電話番号・メール・
郵便番号・カード番号は伏字にする。LINE の userId は元に戻せない短いハッシュで保存する。

Obsidian への書き出しは Phase 2。Phase 1 はローカルだけで完結し、Obsidian が
止まっていても保存も通知も止まらない。

## 8. 通知

- 宛先はJINのみ（`JIN_LINE_USER_ID`）。コード側で顧客IDを宛先にできない。
- 1通知は最大5件。6件目以降は「ほか◯件」。**載らない件も必ず保存する**。
- 静音時間 22:00〜翌7:00 は即時通知しない。受信・下書き・保存は行い、通知は保留へ積む。
- 保留は7:00以降の最初の実行でまとめて1回だけ届く。届いたら保留は空になる。
  問い合わせが1件も来ない朝でも取りこぼさないよう、手で流す入口も用意している。

  ```bash
  npm run reply-drafts:flush
  ```

  これを定時実行（launchd / systemd）に載せるのは Phase 2。新しいスケジューラは足さない。
- 通知に失敗したときは保留へ戻す。下書きが消えることはない。

## 9. スイッチ

| 環境変数 | 既定 | 意味 |
| --- | --- | --- |
| `REPLY_DRAFT_DISABLED` | false | 非常停止。最優先で止まる |
| `REPLY_DRAFT_ENABLED` | false | 使う意思表示。true でなければ何もしない |
| `OPENQLOW_DRY_RUN` | true | `false` のときだけ本番。既定はお試し実行 |

値は **`true` ちょうど** のときだけ有効。`1` / `yes` / `TRUE` / `True` / `on` は無効。
お試し実行では、判定だけ行い、保存も通知も状態変更も一切しない。

優先順位: `REPLY_DRAFT_DISABLED` → `REPLY_DRAFT_ENABLED` → `OPENQLOW_DRY_RUN`。

## 10. 既存への影響

LINE Webhook では、**これまで誰も拾わずに捨てていたメッセージ** だけを受け取る。
承認者（JIN）の経路、退会受付、Brand Growth ルーティングには触れていない。
下書きの作成に失敗しても Webhook の応答は壊れない（例外を外へ出さない）。

## 11. フェーズ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 1 | LINE受信・分類・危険判定・下書き・ローカル保存・JIN通知・重複防止・静音時間・スイッチ・テスト | 実装済み |
| 2 | Obsidian書き出し・翌朝まとめの定時実行・Recovery Job・日次まとめ | 未実装 |
| 3 | Gmail 読み取り専用（対象アカウントと検索条件のJIN承認が前提） | 未実装 |
| 4 | Gmail 下書き保存（別途承認。送信機能は追加しない） | 未実装 |

要件書 §47 のフェーズ表では静音時間を Phase 2 に置いていたが、§56 で
「Phase 1 の運用条件として 22:00〜7:00」と確定しているため Phase 1 に含めた。
静音時間を入れる以上、保留した通知を翌朝届ける仕組みが無いと通知漏れになるため、
保留と再送（`flushPendingNotifications`）も Phase 1 に含む。定時に呼び出す
launchd / systemd 設定は Phase 2。

## 12. テスト

`npm run test:group:core` に含まれる。個別には次のとおり。

| テスト | 確かめること |
| --- | --- |
| `test:reply-draft-config` | OFFで動かない / true ちょうどだけ有効 / Kill Switch最優先 |
| `test:reply-draft-triage` | 分類・優先度 / 未成年の通常質問は止めない / 危ない話は止める |
| `test:reply-draft-build` | 正本外の金額を出さない / 伏字 / JIN確認では本文を作らない |
| `test:reply-draft-dedupe` | 鍵の安定性 / 同じ日の別件は別扱い / 30日で間引く |
| `test:reply-draft-notify` | JIN宛のみ / 静音時間 / 翌朝1回 / 最大5件 / 載らない件も保存 / 失敗しても消えない |
| `test:reply-draft-pipeline` | OFF・Kill Switch・お試し実行で副作用ゼロ / 保存失敗を成功にしない / 夜の保留が朝に1回だけ流れる |
| `test:reply-draft-isolation` | Obsidian・Gmailに依存しない / 保存先は state/ と logs/ だけ |
| `test:reply-draft-no-customer-send` | 顧客向け送信コードが存在しないことをソースで検査 |

## 13. 参照

- `AGENTS.md`
- `docs/ai-os/canon/approval_matrix.md`
- `src/shared/canon.ts`（事実の唯一の正本）
- `src/safety/forbidden_actions.ts`（顧客への直接送信の物理ロック）
