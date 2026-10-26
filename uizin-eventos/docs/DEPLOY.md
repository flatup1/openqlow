# 公開手順（Cloudflare）

> **Tournament OS は、ここから読む**：申込ページ・準備画面（`tournament-os-v3`）の公開は `npm run deploy:private` だけです（[公開の決まり](TOURNAMENT_OS_公開とCodex連携の決まり.md)）。短い申込URLは「[6. 短い申込URL](#6-短い申込url)」の手順だけを使います。
> 1〜5 は、古い UIZIN EventOS v1 の手順です（`npm run go-live` は止めてあります）。

バックエンドは **Cloudflare Workers**、画面は **Cloudflare Pages** です。**費用はかかりません。**

---

## いちばん速いやり方：コマンド1つ

```bash
cd uizin-eventos
npm run go-live
```

これだけで、次を全部やります。

1. Node.js と部品がそろっているか確認
2. Cloudflare にログイン（していなければブラウザが開きます）
3. 進行表のシートIDを設定（聞かれたら貼る。設定済みならそのまま使う）
4. 操作キーを自動で作って登録（**画面に1回だけ出るので、その場で控える**）
5. 裏側（Worker）を公開
6. 5つの画面（Pages）を公開
7. 他サイトから触れないように締めて、動作確認
8. スタッフに配る5つのURLを表示

途中で失敗しても、**何が悪くて何をすればいいか日本語で出ます**。
何度実行しても安全です（同じところに上書きするだけ）。

シートIDが分かっているなら、聞かれずに済ませることもできます。

```bash
npm run go-live -- <進行表のシートID>
```

> **配るURLについて**
> スタッフに渡すのは `https://uizin-eventos.pages.dev` です。
> 公開のたびに変わる `https://<英数字>.uizin-eventos.pages.dev` を配ると、
> 次に公開し直したときに開けなくなります。スクリプトは固定のほうを表示します。

公開したあとにやることは、この文書のいちばん下「[公開後にやること](#3-公開後にやること)」を見てください。

---

## 手で1つずつやる場合

うまくいかないとき、または何が起きているか確かめたいときは、以下を順に実行します。

---

## 1. バックエンド（Worker + Durable Object）

> **先に読む**: 繋いでよいのは、個人情報を含まない**進行表スプレッドシート**だけです。
> 申込の原本（連絡先メール・電話番号・保護者氏名を含む）は絶対に公開しないでください。
> 理由は [SPREADSHEET_TEMPLATE.md](SPREADSHEET_TEMPLATE.md) の冒頭。

```bash
cd uizin-eventos
npm install

# 1) 進行表スプレッドシートのIDを入れる（申込の原本のIDではない）
#    worker/wrangler.toml の [vars] SHEET_ID を書き換える
#    （公開リポジトリに実IDを置きたくない場合は、デプロイ直前に書き換えて戻す運用にする）

# 2) 操作キーを入れる（これが無いと誰も書き換えられません）
npx wrangler secret put OPERATOR_KEY --config worker/wrangler.toml

# 3) 公開
npm run worker:deploy
```

公開されたURL（例 `https://uizin-eventos-api.<account>.workers.dev`）を控えます。

動作確認:

```bash
curl https://uizin-eventos-api.<account>.workers.dev/api/health
# => {"ok":true,"serverNow":...,"eventId":"uizin-2026","hasSheet":true}
```

### 短い申込URLは、この Worker（`uizin-eventos-api`）では作りません

短い申込URL（`/a/<コード>`）は、新しい Worker（`tournament-os-api`）だけで作ります。手順は、下の「[6. 短い申込URL](#6-短い申込url)」を見てください。
`worker/wrangler.toml` にも同じ箱（`SHORT_LINKS`）が入っていますが、短いURLには使いません（短いURLを作る鍵 `SHORT_LINK_KEY` を入れないので、ここでは作れません）。

### 設定できるもの（`worker/wrangler.toml` の `[vars]`）

| 名前 | 既定 | 意味 |
|---|---|---|
| `EVENT_ID` | `uizin-2026` | 大会ごとの部屋名。**変えると状態が完全に分かれます**（前大会の状態を持ち越さない） |
| `SHEET_ID` | （空） | Google スプレッドシートのID |
| `SHEET_EVENT` / `SHEET_MATCHES` / `SHEET_MUSIC` | `event` / `matches` / `music` | シート名 |
| `ALLOWED_ORIGINS` | `*` | 画面を置くオリジン。公開後は Pages のURLに絞る |
| `OPERATOR_KEY` | （secret） | 操作者の合言葉。**必ず `wrangler secret put` で入れる** |

---

## 2. 画面（Cloudflare Pages）

```bash
# Worker のURLを埋め込んでビルド
NEXT_PUBLIC_EVENTOS_API=https://uizin-eventos-api.<account>.workers.dev npm run build

# out/ を Pages に上げる
npm run pages:deploy
```

GitHub 連携で Pages を使う場合の設定:

| 項目 | 値 |
|---|---|
| Root directory | `uizin-eventos` |
| Build command | `npm run build` |
| Build output directory | `out` |
| 環境変数 | `NEXT_PUBLIC_EVENTOS_API` = Worker のURL |

---

## 3. 公開後にやること

1. `ALLOWED_ORIGINS` を Pages のURLに絞って `npm run worker:deploy` し直す
2. ダッシュボード（`/op/`）を開き、「接続設定」で **操作キー** を入れる
3. 「取り込み直す」を押して番組表が入ることを確認する
4. `/mc/` `/screen/` `/mix/` を別の端末で開き、右上が緑の「同期中」になることを確認する
5. 「次へ」を1回押して、3画面すべてが同時に変わることを確認する

> **MC・表示画面・Event Mix の端末には、操作キーを入れないでください。**
> キーが無ければ、その端末からは1つも書き換えられません（サーバー側で拒否します）。

---

## 4. 大会ごとの初期化

前の大会の状態を持ち越したくないときは、`EVENT_ID` を新しい名前に変えて `worker:deploy` します。
（`reset_event` で戻すこともできますが、`EVENT_ID` を分ける方が事故がありません）

---

## 5. ローカルで通しの確認

```bash
# ターミナル1: バックエンド
npm run worker:dev

# ターミナル2: 3端末同期・停止・復元・元に戻す のスモークテスト
node scripts/rehearsal.mjs

# ターミナル3: 画面
npm run build && npx serve out    # または npm run dev
# http://localhost:3000/op/?api=http://127.0.0.1:8787&key=local-dev-key
```

`worker/.dev.vars` にローカル用の `OPERATOR_KEY` を書いておくと `wrangler dev` で使われます
（このファイルは `.gitignore` の対象です。本番のキーは絶対に書かないでください）。
短いURLを手元で試すときは、`SHORT_LINK_KEY` も書きます（見本：`worker/.dev.vars.example`）。

---

## 6. 短い申込URL

短い申込URL（`https://tournament-os-api.<account>.workers.dev/a/<コード>`）は、**新しい Worker（`tournament-os-api`。設定は `worker/wrangler.tournament.toml`）だけ**で作ります。
古い Worker（`uizin-eventos-api`・`npm run worker:deploy`）は使いません（[公開の決まり](TOURNAMENT_OS_公開とCodex連携の決まり.md) の「古い `uizin-eventos`・旧Worker は使わない」のとおり）。

- 短いURLの箱（`SHORT_LINKS`）は、大会の状態（`EVENT_ROOM`）とは別の箱です。大会の状態は変わりません。
- 申込ページ（`tournament-os-v3`）の公開（`npm run deploy:private`）とは、別の作業です。申込ページは、この Worker を呼びません。

### 6-1. 公開する

```bash
cd uizin-eventos
npm install

# 1) 公開（短いURLの箱 SHORT_LINKS と、その移行 v2 も入ります）
npm run worker:deploy:tournament

# 2) 短いURLを作る鍵を入れる（聞かれたら、新しい鍵を打つ。当日の進行の「操作キー」とは、別の文字にする）
npx wrangler secret put SHORT_LINK_KEY --config worker/wrangler.tournament.toml
```

- 鍵（`SHORT_LINK_KEY`）は、入れるとすぐに使えます（公開し直さなくてよい）。鍵を変えたいときも、2) をもう一度します。
- 鍵は、短いURLを作る人だけが持ちます。進行の端末（`/op/`）やLINEには、入れないでください。
- 当日の進行の操作キー（`OPERATOR_KEY`）では、短いURLは作れません。鍵を入れていないとき・鍵が操作キーと同じ文字のときは、作る画面に理由が出て、作れません。
- `ALLOWED_ORIGINS` は、短いURLのために変えなくてよいです（作る画面は、この Worker 自身が配り、同じ場所だけを呼びます。`/a/<コード>` は、ふつうのページの移動です）。
- 前に `tournament-os-api` を公開したことがあるときは、同じ Worker が新しくなります（`[vars]` は、このファイルの値になります。秘密の鍵は、そのまま残ります）。

### 6-2. 短いURLを作る

1. `https://tournament-os-api.<account>.workers.dev/short-link` を開きます（`<account>` は、1) で出たURLのとおり）。
2. 「選手の受付をつくる」の画面で「完成：選手へ渡すURLをコピー」した長いURLを貼ります。
3. 「短いURLを作る鍵」に `SHORT_LINK_KEY` を入れて、「短いURLを作る」を押します。
4. できた `…/a/<コード>` を、LINEで送ります。

- どの大会の、本番かテストかは、貼った長いURLの中身（大会IDと `mode`）で決まります。画面に大会IDを入れる欄はありません。
  - 同じ大会・同じ「本番／テスト」なら、作り直しても短いURLは同じままです（行き先だけが新しくなります）。
  - 「テスト用の申し込みページを開く」のURLを貼ると、テスト用の短いURLになります（本番の短いURLとは別のコードです。本番の短いURLの行き先は変わりません）。画面に、赤い文で「これはテスト用です。選手には送らないでください。」と出ます。
  - 途中で切れたURL（最後の `end=1` が無いもの）や、申込ページのURLではないものからは、作りません。
- 短いURLの英字は、大文字で打たれても開きます。
- 今までの長いURL（`…/apply/#…`）は、そのまま使えます。
- 準備画面（Pages）は、Googleとだけ通信する決まりのままです。鍵は、この `/short-link` の画面だけで使います。鍵は、このタブを閉じるまでだけ覚えます（端末には残りません。Workerが「通した」と答えたあとだけ覚えます）。

### 6-3. 公開したあとの確かめ（2つ）

```bash
# ① 作った短いURLを開くと、申込ページへ移る（302 と、行き先の location が出る）
curl -si https://tournament-os-api.<account>.workers.dev/a/<コード>
# => HTTP/2 302
# => location: https://tournament-os-v3.pages.dev/apply/#…

# ② 鍵なしでは、作れない（401）
curl -si -X POST https://tournament-os-api.<account>.workers.dev/api/short-links -H 'content-type: application/json' -d '{}'
# => HTTP/2 401
# => {"ok":false,"reason":"短いURLを作る鍵が違います…"}
```

- ① は、スマホで `…/a/<コード>` を押して、申込ページが開くことでも確かめられます（`curl -I` は使いません。`/a/` は、ふつうの開き方〔GET〕にだけ答えます）。
- ② で `503` と「…まだ入っていません」が出たら、鍵が入っていません。6-1 の 2) をします。
- 知らないコード（例：`…/a/zzzzzzzz`）は、404「この短い申込URLは見つかりません。運営に、新しいURLを聞いてください。」です。
- Cloudflare の調子が少しの間わるいときは、503「いま開けません。少し待ってから、もう一度押してください。」が出ます（URLは正しいままです。少し待って、もう一度開きます）。
