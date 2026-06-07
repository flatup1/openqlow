# Browser Post Adapters

GoogleビジネスとLINE VOOMに投稿するための、サイト別ブラウザ投稿アダプタです。

これは「半自動」アダプタです。画面を開いて本文をクリップボードに用意するところまでが自動で、
投稿ボタンを押すのとその確認はJINが行います。投稿できていないのに成功扱いにすることはありません。

## 今できること

- 投稿先の画面をChromeで開く
- 投稿本文をクリップボードに入れる
- 投稿ボタンを押すのはJIN（アダプタは押しません）
- JINが「投稿した」を押した時だけ成功扱いにする
- 「まだ」を押した場合は成功扱いにしない
- 迷ったら止まる。止まった時は成功扱いにならない（fail closed）

## まだやらないこと

- 完全自動で投稿ボタンを押すこと
- Cookie、トークン、パスワードを見ること
- 投稿できていないのに成功扱いにすること

> ⚠️ 下のコマンドの `OPENQLOW_BROWSER_AUTO_CLICK=true` は「アダプタを呼び出すスイッチ」です。
> 投稿ボタンを自動で押すわけではありません。最後はJINが画面で投稿します。

## Googleビジネス

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
OPENQLOW_BROWSER_AUTO_CLICK_CMD="node scripts/adapters/google_business.mjs" \
node scripts/mac-browser-poster.mjs /path/to/google-job.json
```

## LINE VOOM

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
OPENQLOW_BROWSER_AUTO_CLICK_CMD="node scripts/adapters/line_voom.mjs" \
node scripts/mac-browser-poster.mjs /path/to/voom-job.json
```

## 使い方

1. コマンドを実行します。
2. Chromeで投稿先が開きます。
3. 本文はクリップボードに入っています。
4. 画面で本文を貼り付け、内容を確認します。
5. 投稿まで終わったら、確認ダイアログで「投稿した」を押します。
6. 投稿していない場合は「まだ」を押します。

## 結果の出方

結果は「成功」か「途中で停止」の2択です。

- 「投稿した」を押す → 成功
- 「まだ」を押す、または途中で止まる → 停止（成功扱いにはならない）

迷った時に「たぶん成功」を返すことはありません。確認が取れない時は止まります。

## 安全設計

このアダプタは、JINの目視確認を成功条件にしています。

完全自動フラグは、現時点では安全のため停止します。

```bash
OPENQLOW_FORCE_FULL_AUTO=true
```

この状態で実行すると、以下のエラーで止まります。

```text
完全自動投稿はまだ有効化していません。JIN確認ありの半自動モードで実行してください。
```

## テスト

```bash
npm run test:browser-post-adapters
npm run test:mac-browser-poster
```
