# standalone — 当日用の一体型進行画面

**公開先: https://uizin-card.pages.dev/**（対戦カード一覧は `/list.html`）

48試合ぶんのデータを `index.html` に焼き込んだ 1 枚のページ。
Worker も操作キーも要らないので、**URL を配れば誰でも同じ画面が開く**。
一度開けば回線が切れても動く。

EventOS 本体（`app/live/`）とは別物で、互いに影響しない。
本体は Worker 経由でデータを取りに行くが、本番の Worker は正しい操作キーを持つ端末
でしか「取り込み直す」を押せず、体重・写真が古いまま止まっていた。その回避として作った。

## 画面

- 上: 大会名 / 部 / 第N試合 全48試合
- 中: 赤コーナー｜VS＋契約体重｜青コーナー
  - 各コーナー = 顔写真・名前・所属/戦績・意気込み・入場曲ボタン
  - 写真が無い人は人型（シルエット）
- 下: ← 前の試合 ／ 試合番号 ／ 次の試合 →

入場曲は YouTube ならその場で再生（■ 止める で停止）、Apple Music はアプリが開く。
Apple Music は `<a target="_blank">` で開く。`window.open` はポップアップ禁止の端末で
無言で失敗し、当日それに気づけないため使わない。

## 顔写真

外部3ホスト（workers.dev / chatgpt.site / Google ドライブ）から**取り込んで縮小し、
サイト内 `/p/<sha1の先頭10桁>.jpg` と `.webp` の両方を置く**。外部ホットリンクは 0 件。

- 長辺800px。JPEG は品質62、WebP は品質74（`cwebp -q 74 -m 6`）
- 端末が WebP を読めるかを起動時に1回だけ判定し、読めれば `.webp`、駄目なら `.jpg`
- `_headers` で `/p/*` に1年キャッシュ。2回目からは端末に残る
- 開いて1.2秒後から全48試合ぶんを先読みし、`img.decode()` で絵への変換まで済ませる

結果: 配信量 17.4MB → **2.5MB**、1枚あたり 0.85秒 → **0.11秒**、
試合の切り替え **33ミリ秒**（写真は読み込み・変換ずみ）。

写真はリポジトリに入れない（`.gitignore`）。作り直すときは下記の手順で取り直す。

## 作り直しかた

対戦カード・名前・曲・写真が変わったら焼き込みを作り直す。

1. スプレッドシートの `matches` / `music` を CSV で落とす
2. `data/live_data.json` を作り直す（選手名は大会原簿の登録名に合わせる）
3. 写真を取り込んで縮小: `sips -Z 800 -s format jpeg -s formatOptions 62 <元> --out p/<hash>.jpg`
4. `index.html` の `<script id="data">` の中身を差し替える
5. デプロイ:

```
npx wrangler pages deploy <公開ディレクトリ> --project-name uizin-card --branch main --commit-dirty=true
```

公開ディレクトリの中身は `index.html` / `list.html` / `_headers` / `p/*.jpg`。
