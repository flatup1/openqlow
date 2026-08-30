# 広告専用LINE 境界仕様

## 結論

広告から来た見込み客を受けるLINEと、既存会員を対応するAIKAを完全に分ける。

選定済み広告アカウントは `@817nsdhr`（現在の表示名「会員200人目標」）。既存会員AIKAは `@jfl0054o`。

```text
Instagram / Meta広告
        ↓
広告専用LINE
        ↓
広告反応・体験希望だけを記録

既存会員
        ↓
既存AIKA / 会員対応LINE
        ↓
休会・退会・契約・支払い・クレーム対応
```

広告LINEとAIKAは、アカウント、Messaging APIチャネル、secret、token、Webhook URL、データ保存先を共有しない。
ただし `@817nsdhr` は新規アカウントではなく、旧openQLOWで使っていた同じLINEアカウントを広告専用へ役割変更する。旧 `LINE_*` の資格情報は本番移行時に `AD_LINE_*` へ安全に移し、AIKAの資格情報は使わない。

## 本番接続状況（2026-08-30）

広告専用アカウント `@817nsdhr` は、受信専用ドライランとして本番接続済み。

- LINE DevelopersのWebhookは `https://line.flatupnarita.jp/openqlow/ad-line/webhook`。
- `openqlow-ad-line.service` は既存openQLOW VPSで稼働中。
- `AD_LINE_DRY_RUN=true`。有効なLINE署名だけを受け付ける。
- 受信内容を振り分けるが、ドライラン中はイベントをファイルへ保存しない。
- 顧客への返信、予約、広告変更、AIKA書き込みを行わない。
- 広告日報タイマーとLINE日報送信は無効。
- 既存openQLOWサービスと朝6時通知は稼働を維持。
- AIKAは別アカウント・別VPSのまま変更していない。
- 切替前の環境設定、Nginx設定、Webhook URLはVPS内のroot専用バックアップへ保存済み。

LINE公式のWebhook検証、正しい署名のローカル検証、署名なし外部アクセスの401拒否を確認済み。ドライラン用保存先のファイル数は0件。

## 役割

| レーン | 対象 | してよいこと | してはいけないこと |
|---|---|---|---|
| 広告専用LINE | 広告から来た新規見込み客 | 広告コード取得、体験意向の受付、広告成果の計測 | 退会、休会、契約変更、支払い、既存会員対応 |
| 既存AIKA | 既存会員・通常の顧客対応 | 会員対応の下書き、体験・予約案内 | 広告運用コマンド、広告データの保存 |
| オーナー | 広告管理 | 広告集計、承認、停止判断 | 顧客への無承認自動送信 |

## 必須分離

- 広告LINEは `AD_LINE_*` だけを使う。
- 既存LINEの `LINE_CHANNEL_SECRET` と `LINE_CHANNEL_ACCESS_TOKEN` をフォールバック利用しない。
- Webhookは `/openqlow/ad-line/webhook` だけを使う。
- 広告データは `AD_LINE_DATA_DIR` へ保存し、既存会員データと同じディレクトリを使わない。
- LINE userIdと受信本文はGrowthデータへ生保存しない。ハッシュ、広告コード、時刻、振り分け結果だけを残す。
- 本番接続、顧客返信、予約確定は人間承認後。初期値は `AD_LINE_DRY_RUN=true`。
- 広告受信プロセスは既存VPS内の `127.0.0.1:8788` を使い、新しいVPSや有料DBを増やさない。
- LINE Messaging APIのWebhook URLは1チャネルにつき1つなので、本番切替時に `@817nsdhr` の旧openQLOW受信を広告専用URLへ置き換える。
- 旧openQLOWの日次報告は広告ではないため、本番切替前に停止または別のオーナー通知先へ移す。

## 自動振り分け

| 入力 | 振り分け | 処理 |
|---|---|---|
| オーナーから `/広告集計` | `owner_ad_ops` | 広告管理レーン |
| `IG01 広告を見て体験したい` | `ad_lead_intake` | 広告見込み客として最小記録 |
| `会員になりたい／月会費を知りたい` | `ad_lead_intake` | 新規の質問なので広告側で受付 |
| `会員です。休会したい` | `member_support_handoff` | 広告側で処理せず、会員対応への引き渡し対象として記録 |
| userIdまたは本文がない | `ignored` | 保存しない |

## 中学生向けの例

学校の「新入生受付」と「在校生の相談室」を分けるのと同じ。

- 広告専用LINE = 新入生受付
- 既存AIKA = 在校生の相談室
- オーナー = 先生

新入生受付へ在校生が「休学したい」と来た場合、新入生受付で勝手に処理せず、相談室へ渡す対象として分ける。実際の案内返信は、内容を確認してから次の段階で追加する。

## 実装済み

- `src/line_bot/ad_channel_boundary.ts`: 設定の混線検知、振り分け、個人情報を除いたイベント作成
- `src/line_bot/ad_webhook_handler.ts`: LINE Webhook payloadの広告専用振り分け
- `src/line_bot/ad_webhook_server.ts`: 署名検証、容量制限、広告専用ポート、匿名化イベント保存
- `src/line_bot/ad_channel_boundary.test.ts`: secret/token/ID/経路/データの混線防止テスト
- `src/line_bot/ad_webhook_server.test.ts`: HTTP・署名・容量・プライバシーの受入テスト
- `src/scheduler/ad_daily_report.ts`: 前日の広告反応を広告別にまとめるドライラン日報
- `src/scheduler/ad_daily_report.test.ts`: 集計、費用対効果、個人情報非表示、本番送信拒否のテスト
- `deploy/systemd/openqlow-ad-daily-report.timer`: 06:10 JSTに日報ファイルを作る任意タイマー（自動有効化しない）

## 広告日報で今できること

```text
広告コード付きのLINE問い合わせ
          ＋
広告管理画面から転記した費用・表示・クリック・予約
          ↓
広告別に集計
          ↓
問い合わせ単価・予約単価・次の一手を表示
```

- 無料の既存VPS内で動き、新しいDBやサーバーを増やさない。
- 広告ごとのLINE問い合わせ数と実人数を数える。
- 広告費を入力すれば「問い合わせ1件に何円かかったか」を計算する。
- 体験予約数を入力すれば「予約1件に何円かかったか」を計算する。
- データ不足と壊れた記録を隠さず、信頼度を `low / medium / high` で示す。
- 生成した日報は `AD_LINE_DATA_DIR/reports/YYYY-MM-DD.md` に保存する。
- 現段階はドライランだけで、LINE送信、広告変更、AIKA更新をしない。

広告管理画面の数値は、当面 `AD_LINE_DATA_DIR/campaign_metrics.ndjson` へ1広告・1日につき1行入力する。
本物の氏名、LINE userId、tokenは入れない。

```json
{"date":"2026-08-30","campaignCode":"IG-KIDS-01","spendYen":3000,"impressions":10000,"clicks":40,"lineAdds":8,"trialBookings":1,"enrollments":0}
```

この手入力方式をPhase 1にする理由は、Meta広告API連携より早く、追加料金なしで、数字の意味を確認しながら始められるため。

## まだ自動では測れないこと

- Meta / Instagram広告の費用、表示数、クリック数の自動取得
- LINEの友だち追加イベントと広告コードの自動ひも付け
- 体験予約、来店、入会まで同じ広告コードを引き継ぐ処理
- 作成した日報をオーナーのLINEへ送る処理

そのため、現時点で「広告効果が全部自動で分かる」とは扱わない。まず問い合わせ計測と手入力の費用対効果を安全に検証し、数字が正しいと確認できた後だけ自動連携を足す。

## ドライラン段階ではまだ行わないこと

- 自動返信
- 既存AIKAの設定変更
- 旧openQLOW日次通知の停止・移動
- 広告日報タイマーの有効化
- 広告日報のLINE送信

これらは人間承認と本番前テストの後に別作業で行う。

## 次の実装例

広告投稿に `IG01`、`META02` のようなコードを1つ付ける。

```text
広告文:
プロフィールの広告専用LINEから
「IG01 体験」と送ってください。
```

保存する内容:

```json
{
  "route": "ad_lead_intake",
  "campaignCode": "IG01",
  "occurredAt": "2026-08-30T00:00:00.000Z"
}
```

氏名、本文、生のLINE userIdは保存しない。
