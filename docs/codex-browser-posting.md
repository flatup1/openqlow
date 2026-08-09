# CODEXブラウザで全投稿先に出す手順

Instagram はAPIで自動投稿される。それ以外（Threads / Googleビジネス / LINE VOOM）は
ブラウザでログインしないと投稿できないため、ブラウザを持つエージェント（CODEX等）が担当する。

この文書は、そのエージェントがVPS上で実行するコマンドと守るルールを定める。

## 前提

- VPSで `OPENQLOW_PUBLIC_MEDIA_DIR` と `OPENQLOW_PUBLIC_MEDIA_BASE_URL` が設定されていること。
  設定されていないと画像が公開URLに解決できず、テキストだけの投稿になる。
- 投稿先サイトにブラウザでログイン済みであること。

## 1. 投稿待ちを取り出す

```bash
npm run browser:jobs
```

JSONで欲しい場合:

```bash
npm run browser:jobs -- --json
```

出力される各ジョブは次を持つ。

- `url`: 開く投稿先
- `text`: 貼り付ける本文（多言語フッター込み）
- `mediaUrls`: **公開HTTPS URL**。ローカルパスではないので別マシンのブラウザからも取得できる
- `missingMediaCount`: 公開URLに解決できなかった画像の数

`missingMediaCount` が 0 より大きいジョブは、画像なしで投稿せず、先に公開URL設定を直すこと。

## 2. ブラウザで投稿する

1. `url` を開く。
2. `text` を本文に貼り付ける。
3. `mediaUrls` の画像をダウンロードして添付する。
4. 内容を確認してから投稿する。

## 3. 結果を書き戻す

投稿できたとき:

```bash
npm run browser:done -- <recordId> <destination> <投稿URLかID>
```

投稿できなかったとき:

```bash
npm run browser:done -- <recordId> <destination> --error "理由"
```

`destination` は `threads` / `google_business` / `line_voom` のいずれか。

## 守ること

- 実際に投稿できていないのに `browser:done` を成功として実行しない。
- ログイン情報、Cookie、トークンを読み出さない・保存しない・記録しない。
- 本文を書き換えない。直したい場合はLINEの修正フローで直してから出す。
- 二重投稿を避ける。`browser:jobs` に出てこないジョブは既に完了している。
