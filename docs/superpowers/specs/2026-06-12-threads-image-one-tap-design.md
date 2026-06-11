# Threads Image One Tap Design

## Goal

LINEで本文と画像を確認したあと、JINが `OK` を送るだけでThreadsへ画像付き投稿できる状態に近づける。

## Current State

- `src/publish/threads_api.ts` はThreadsのテキスト投稿APIだけを持つ。
- `src/publish/final_publish.ts` はThreadsに `mediaFiles` がある場合、API投稿せずブラウザ補助キューへ逃がす。
- 画像添付は既存の `mediaFiles` 経路で保存・キュー化できている。
- 外部公開操作はJINの `OK` 後だけ実行する。

## Decision

Threads画像投稿はAPI経由を優先する。ただし、Threads APIで画像投稿するには画像がHTTP/HTTPSで取得できる公開URLである必要がある前提で扱う。

そのため今回の実装は次の2分岐にする。

1. `mediaFiles` の先頭が `https://` または `http://` の画像URLなら、Threads APIで画像付き投稿する。
2. ローカルファイル、動画、未対応拡張子、複数メディアは既存のブラウザ補助へ逃がし、成功扱いにしない。

## User Flow

1. openQLOWが本文1案と画像候補をLINEに出す。
2. JINが `画像 1` またはLINE直送画像で画像を選ぶ。
3. openQLOWが本文と画像を再確認表示する。
4. JINが `OK` を送る。
5. 画像が公開URLならThreads APIで画像付き投稿する。
6. 画像がローカルファイルならブラウザ補助キューを作り、JIN確認に回す。

## Safety

- `OK` 前に外部投稿しない。
- APIが失敗したら `published` に入れない。
- ローカルファイルを勝手に公開URL化しない。
- トークン、Cookie、画像バイナリ、取得URLの中身はログに出さない。
- 投稿成功IDがThreads APIから返らない場合は失敗として扱う。

## Files

- Modify `src/publish/threads_api.ts`
  - `publishThreadsImage` を追加する。
- Modify `src/publish/threads_api.test.ts`
  - 画像投稿のAPI bodyを検証する。
- Modify `src/publish/final_publish.ts`
  - `mediaFiles[0]` が公開画像URLならAPI投稿する。
  - ローカル画像は既存どおりブラウザ補助に回す。
- Modify `src/publish/final_publish.test.ts`
  - 公開画像URLはThreads APIで投稿されることを検証する。
  - ローカル画像はブラウザ補助へ残ることを検証する。

