# Public Media URL Bridge Design

## Goal

LINE直送画像やMac内画像を、Threads APIが読める公開URLへ安全に橋渡しする。

## Decision

今回の実装では、画像をクラウドへアップロードしない。代わりに、すでに公開配信されているフォルダだけをURL化する。

使う環境変数:

- `OPENQLOW_PUBLIC_MEDIA_DIR`
  - 公開配信されているローカルフォルダの絶対パス。
- `OPENQLOW_PUBLIC_MEDIA_BASE_URL`
  - そのフォルダに対応する公開URL。

例:

```text
OPENQLOW_PUBLIC_MEDIA_DIR=/opt/openqlow/public/media
OPENQLOW_PUBLIC_MEDIA_BASE_URL=https://media.example.com/openqlow/
```

`/opt/openqlow/public/media/a/post.jpg` は `https://media.example.com/openqlow/a/post.jpg` に変換される。

## Safety

- `OPENQLOW_PUBLIC_MEDIA_DIR` の外側のファイルはURL化しない。
- ファイルが存在しない場合はURL化しない。
- URL化できない画像は、既存のブラウザ補助へ回す。
- 画像バイナリ、LINE取得URL、トークンはログに出さない。
- 外部投稿は既存通りJINの `OK` 後だけ。

## User Flow

1. JINがLINEに画像を送る、または `画像 1` で選ぶ。
2. openQLOWが `mediaFiles` に保存する。
3. JINが本文と画像を目視確認する。
4. JINが `OK` を送る。
5. 画像が公開フォルダ配下ならURL化してThreads APIへ送る。
6. URL化できなければブラウザ補助に回す。

## Files

- Create `src/publish/public_media.ts`
  - ローカルパスから公開URLを作る。
- Create `src/publish/public_media.test.ts`
  - フォルダ外、未設定、存在しないファイルを弾く。
- Modify `src/publish/final_publish.ts`
  - `mediaFiles[0]` を公開URLへ解決してからThreads画像APIへ渡す。
- Modify `src/publish/final_publish.test.ts`
  - 公開フォルダ配下のローカル画像がThreads API投稿へ進むことを確認する。
- Modify `package.json`
  - `test:public-media` を追加し、フルテストへ含める。

