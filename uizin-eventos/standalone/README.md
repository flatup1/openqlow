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

外部3ホット（workers.dev / chatgpt.site / Google ドライブ）から**取り込んで縮小し、
サイト内 `/p/<sha1の先頭10桁>.jpg` に置く**。外部ホットリンクは 0 件。
1枚あたり平均 0.85 秒 → 0.34 秒、合計 17.4MB → 6.2MB になった。
`_headers` で `/p/*` に1年キャッシュを付け、開いて1.5秒後から全48試合ぶんを先読みする。

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
