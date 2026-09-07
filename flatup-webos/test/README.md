# test

WebOSのテストは2本立て。**日常の見張りは `flow.test.cjs`、公開前の最終確認は `smoke.cjs`。**

## 1. flow.test.cjs — 毎回CIで走る（依存ゼロ）

```bash
npm run test:webos-flow
```

小さな擬似DOMの上で `app/js/*.js` をそのまま動かし、フローを自動で確かめる。
ブラウザもPlaywrightも要らないので、**GitHub Actionsで毎回走る**（`core` グループ）。

確認内容:

| # | 確認していること |
|---|---|
| 1 | ようこそ画面に見出し（h1）・開始ボタン・写真枠がある |
| 2 | 成人・キッズ・相談・家族の4ルートが結果画面まで進む |
| 3 | 画面内の「← 戻る」とスマホの戻るボタンが同じ動きをする |
| 4 | 戻って選び直したら、前の回答が結果画面に残らない |
| 5 | 「答えずに進む」「最初からやり直す」が動く |
| 6 | LINE引き継ぎ成功時にCTAが引き継ぎリンクへ変わる |
| 7 | 引き継ぎに失敗しても従来のLINEリンクのままで壊れない |
| 8 | 送信データにもURLにも、個人情報や回答の中身が出ない |
| 9 | 同じ回答で結果画面を開き直しても二重送信しない |
| 10 | 本番ドメイン以外では回答を送信しない |

**画面の見た目（色・崩れ・写真）は見ていない。** そこは `smoke.cjs` と実機の担当。

## 2. smoke.cjs — 公開前に人が1回まわす（Playwright必要）

```bash
npm install playwright   # 未インストールの場合
node flatup-webos/test/smoke.cjs
```

本物のChromiumで全ルートを操作し、コンソールエラーが出ないことまで確認する。
ブラウザのダウンロードが必要なため、CIには入れていない。

## 3. 正本との照合（別の場所）

```bash
npm run test:webos-canon-sync
```

WebOSに書かれた料金やLINE URLが `src/shared/canon.ts` とズレていないかを機械照合する。
実体は `src/shared/webos_canon_sync.test.ts`。
