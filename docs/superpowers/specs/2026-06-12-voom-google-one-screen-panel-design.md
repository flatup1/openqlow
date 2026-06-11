# VOOM Google One Screen Panel Design

## Goal

LINE VOOM と Google Business Profile の半自動投稿を、JINが迷わない1画面にまとめる。

## Decision

完全自動投稿はまだしない。既存の `browser_panel` を強化し、本文・画像・次の操作を1画面に出す。

## Behavior

- 本文は媒体別カードでコピーできる。
- 画像がある場合、画像一覧を画面上部に出す。
- 公開URLに変換できる画像は「画像URLをコピー」として出す。
- ローカル画像は「ファイルをアップロード」としてパスを出す。
- Google Business は公開URLを優先する。
- LINE VOOM はローカルファイルアップロードでも進められる。
- 投稿ボタンはJINが押す。Codexは押さない。

## Safety

- 自動投稿しない。
- 投稿できていないのに成功扱いしない。
- トークン、Cookie、画像バイナリを表示しない。
- 画像はJINが目視確認してから投稿する。

