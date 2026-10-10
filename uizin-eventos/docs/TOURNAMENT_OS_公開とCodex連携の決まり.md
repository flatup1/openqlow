# Tournament OS：公開の決まりと、Codexとの連携

作成：2026-10-09／対象：`claude/tournament-os-v3` を本線とする、会長向けの準備・設定・当日・申込の画面

## 1. 決定（オーナー）

| 項目 | 決定 |
|---|---|
| 本線 | `claude/tournament-os-v3`。個人情報は、会長本人のGoogleと、会長のパソコンの中だけ。Cloudflareには、空の画面と大会設定まで |
| Codex版のクラウド保存（名簿・写真・カードをCloudflareに保存） | **v3には入れない。** 別ブランチ `codex/mac-latest-20261009` のまま置く（案1） |
| 公開先 | `tournament-os-v3`（Cloudflare Pages）**だけ**。古い `uizin-eventos`・旧Worker・旧go-live・`pages:deploy` は使わない |

## 2. 公開は、1つのコマンドだけ

```
npm run deploy:private
```

順番：①作り直して自動チェック → ②ひな形のリンクを確かめる → ③公開する内容を表示 → ④`yes` と打ったときだけ公開。

- 公開先は、プログラムの中で `tournament-os-v3` に固定してあります。
- ひな形のコピー用リンクは、`~/template-link.backup.json`（Macだけにある控え）から入れます。無ければ、**公開しません。**（作り直すとリンクが消える事故を防ぐため）
- **このコマンドは、事前に、全部の検証が合格したコミットでだけ使います。**

## 3. 壊れないための自動チェック（`scripts/check-private-build.mjs`）

`npm run build:private` の最後に、自動で動きます。1つでも駄目なら、公開に進めません。

1. 公開用フォルダの画面は、`/private/` と `/apply/` だけ（クラウド管理などが混ざらない）
2. 名簿を読む部品（ZIP・Excel）が、本当に入っている（抜けると、公開後に取り込みが動かない）
3. HTML・JSが指しているファイルが、すべて存在する
4. 安全のための設定（`_headers`）、ひな形のプログラム、`template-link.json` がある
5. 鍵・秘密らしき文字が入っていない

手で動かす場合：`npm run verify:private-build`

## 4. 公開してよい条件（上のコマンドの前に、必ず）

型チェック・単体テスト・画面の確認6本が、**すべて**合格すること。

- `scripts/test-private-browser.mjs`
- `scripts/test-setup-v3-browser.mjs`
- `scripts/test-private-resilience.mjs`
- `scripts/test-private-v3-safety.mjs`
- `scripts/test-private-glance.mjs`
- `scripts/test-private-live-list.mjs`

**型チェックと単体テストだけでは、公開の壊れ方は見つかりません。**（Codexの統合ブランチで、実際にそうなりました）

## 5. Codexの統合ブランチ（`codex/mac-latest-20261009`、`e671b67`）の確認結果

2026-10-09 に、別の作業フォルダで検証した結果です。

| 項目 | 結果 |
|---|---|
| 型チェック | 合格 |
| 単体テスト | 384本 合格 |
| 設定画面56／安全44／見やすさ84／一覧表示1353 | 合格 |
| 準備画面86／保存・復元の確認 | **失敗**（名簿の取り込みで「○人分を読み込みました」が出ない） |
| 公開用フォルダの自動チェック | **失敗**（ZIP・Excelを読む部品が入らない） |

**原因：** `package.json` の `build` を `next build --webpack` に変えたため、動的に読み込む部品（`4.….js`・`981.….js`）が、`build-private-pages.sh` の部品コピーから漏れる。公開すると、名簿のZIP・xlsxの取り込みが404で動かない。

**直し方（どちらか）：** (a) `build` を元に戻し、既定のビルドで `build:private` を通す。(b) `build-private-pages.sh` が、webpackの部品の一覧も読んで、動的な部品もコピーする。

**条件：** `node scripts/check-private-build.mjs` が OK、画面の確認6本が合格してから push する。

## 6. 2つのAIで作業するときの決まり

1. 土台は常に最新の `claude/tournament-os-v3`。古い `codex/tournament-os-*` には push しない。
2. 同じファイルを、同時に編集しない。編集前に `COORDINATION.md` の「作業中」に、ファイル名と日付を書く。
3. force push、mainへの直接push、公開、認証や権限の変更は、オーナーの個別の承認があるまでしない。
4. 個人情報・鍵・実名簿は、コミットしない。push の前に、必ず確認する。
5. 「テストが通った」と報告するときは、**どのテストを、どのコミットで動かしたか**を書く。
