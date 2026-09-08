# 公開手順（Cloudflare）

バックエンドは **Cloudflare Workers**、画面は **Cloudflare Pages** です。

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
