# UIZIN Event OS（道具）

**イベントの難しい機械を、全部やさしい日本語にするOS。**
スタッフは画面の「今」「次」を読んで、大きいボタンを押すだけ。OBS の場面切替・テロップ・録画・カメラの見張りは裏で動きます。

設計・仕様・受入テストは [`docs/uizin-event-os/`](../../docs/uizin-event-os/README.md)。

> **状態：ソフトは Phase 1〜6 まで実装済み・自動テスト合格。本物の OBS・iPhone・YouTube での確認（実機テスト）はまだです。**
> 本番の大会で使う前に、[`docs/uizin-event-os/RUNBOOK.md`](../../docs/uizin-event-os/RUNBOOK.md) のリハーサルを必ず行ってください。

---

## 1. まず体験する（OBS なしで5分）

```bash
node tools/uizin-event-os/src/server/main.mjs --demo
```

- 偽物の OBS で動く「体験モード」。ブラウザで `http://localhost:8787/` を開きます。
- ターミナルに出る **運営PIN** で「🔑 運営モード」に入り、`tools/uizin-event-os/samples/demo_card.csv`（架空の選手）を読み込むと、大会を最後まで練習できます。
- 管理PIN で入り「🧪 練習モード」にすると、「OBSが落ちる」「録画が止まる」などをわざと起こせます。

必要なもの：**Node.js 22 以上**だけ。`npm install` は不要です。

---

## 2. 本番の準備（初回だけ）

### 2.1 設定ファイル

```bash
mkdir -p ~/UIZIN-EventOS
cp tools/uizin-event-os/config.example.json ~/UIZIN-EventOS/config.json
```

`~/UIZIN-EventOS/secrets.env` を作り、次を書きます（**このファイルは誰にも送らない・コミットしない**）。

```text
EVENT_OS_OBS_PASSWORD=（OBSの「WebSocketサーバー設定」に出ているパスワード）
EVENT_OS_OPERATOR_PIN=（運営PIN：4〜8桁の数字）
EVENT_OS_ADMIN_PIN=（管理PIN：4〜8桁の数字、運営PINと別）
```

大会データ（操作記録・試合データ・書き出し）は `~/UIZIN-EventOS/data/` に保存されます。リポジトリの中には保存できないようにしてあります（選手の表示名を含むため）。

### 2.2 OBS 側（ARCHITECTURE.md §5〜§8）

1. OBS 28 以上。**ツール → WebSocketサーバー設定 → 「WebSocketサーバーを有効にする」にチェック**（最初は OFF です）。認証は ON のまま。
2. シーンを作る：`WAIT` `FIGHTER` `FIGHT` `WINNER` `SAFE` と、補助の `CAM`。
3. `CAM` の中に、カメラの部品 `MAIN`（下）と `SUB`（上・ふだんは非表示）。`WAIT` `FIGHTER` `FIGHT` `WINNER` には `CAM` をシーンとして入れる。`SAFE` には `MAIN` を直接入れる。
4. テロップの文字部品（テキスト）を作る：`EOS_BOUT_NO` `EOS_RED_NAME` `EOS_BLUE_NAME` `EOS_WINNER_NAME` `EOS_INFO`。見た目は OBS で自由に。中身は Event OS が書き換えます。
5. 録画形式は **Hybrid MP4**（落ちても壊れにくく、チャプターも入る）。`mp4` / `mov` は落ちると録画が全部失われるので使わない。
6. 設定 → 一般の「配信時に自動で録画」は OFF（ON にするなら「配信停止時も録画を続ける」も ON）。
7. 自動更新を OFF。本番1週間前からは OBS を更新しない。

足りない部品は、画面の「開始前チェック」が名前つきで教えてくれます。

### 2.3 起動

- Finder で `tools/uizin-event-os/start.command` をダブルクリック、またはターミナルで `node tools/uizin-event-os/src/server/main.mjs`。
- iPad で操作するときは、ターミナルに出る「iPad等で開く」URL を開きます（合言葉つき。1回開けば覚えます）。

---

## 3. 試合データ（CSV）

Google Sheets で作り、**ファイル → ダウンロード → CSV** で保存して、運営モードで読み込みます。
「ウェブに公開」は使わない（未成年の名前が誰でも見られる状態になるため）。

| 列 | 必須 | 中身 |
|---|---|---|
| 試合番号 | ○ | 1以上の整数（重複不可） |
| 赤_表示名 / 青_表示名 | ○ | テロップに出る名前（未成年は保護者の同意の範囲で。決めるのは JIN） |
| 赤_配信 / 青_配信 | ○ | `OK` / `録画のみ` / `NG` |
| 赤_所属 / 青_所属・区分・赤_入場曲 / 青_入場曲 | | 任意 |

本名・年齢・学校・連絡先などの列があると、読み込みを止めます（必要のない個人情報は持たない）。

---

## 4. 困ったとき

| こんなとき | すること |
|---|---|
| 何かおかしい | 画面右上の **🛟 安全運転** を押す（メインカメラだけ・録画は続ける・配信には触らない） |
| OBS が落ちた | OBS を起動し直す。「正しく終了しませんでした。セーフモードで実行しますか？」と聞かれたら **通常モード（英語表示では Run in Normal Mode）** を選ぶ（セーフモードだと Event OS から操作できない） |
| 「✋ 手動モード」と出た | OBS を直接さわった印。落ち着いたら「🔁 自動に戻す」 |
| 「❌ 録画が止まっています」 | 「● 録画を始める」を押す |
| iPad がつながらない | Mac 本体の画面（`http://localhost:8787/`）で続ける |
| Event OS が止まった | OBS の映像と録画はそのまま続いています。起動し直せば、記録から同じ状態に戻ります |

---

## 5. 開発者向け

```bash
npm run test:uizin-event-os      # 自動テスト（100本・約2秒）
```

| 場所 | 中身 |
|---|---|
| `src/core/` | 純ロジック（進行・次の一手・あるべき姿・開始前チェック・書き出し）。時計・通信・ファイル無し |
| `src/obs/` | OBS とつなぐ部分。`allowlist.mjs` に無い命令は送れない。`fake_obs.mjs` はテストと体験用の偽物 |
| `src/server/` | 本体・保存（追記だけ）・画面サーバー |
| `src/ui/` | 画面（HTML 1枚＋素の JavaScript） |
| `test/` | 自動テスト（選手名はすべて架空） |
