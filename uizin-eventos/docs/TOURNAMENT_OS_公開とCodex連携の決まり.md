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
- **このコマンドは、事前に、全部の検証が合格したコミットでだけ使います。** 検証したあとで中身が変わっていると、画面に「⚠ 検証していない」と出て、`yes-unverified` と打たないと進みません（4を見る）。全部の検証に合格した中身は、リポジトリのいちばん上の `uizin-eventos-verified-trees.txt`（検証ずみの一覧）に記録されます。この一覧にある中身なら、Mac でも「✓」と出て、ふつうの `yes` で進みます。
- ③の画面に、公開する `.gs` の **build**（プログラムの版の番号。いまは `3.20261024.2`）が出ます。コピー元のシート（ひな形）の Apps Script の上から2行目と**同じ番号**か見くらべてから、`yes` と打ちます。ちがうと、配った先のシートに、クラスの行・花道の追加情報の行が入りません（手順：[クラス区分_設定の入れ方.md](クラス区分_設定の入れ方.md) の「ひな形シートを新しくする」）。

### オーナーの Mac から公開する（`scripts/owner-deploy.sh`）

Mac のターミナルで、この1行を動かします。

```
bash ~/openqlow-a3/uizin-eventos/scripts/owner-deploy.sh
```

- 決めた枝（ブランチ）を `~/openqlow-a3` に取ってきて、`npm ci`（決まった部品だけを入れる）と `npm run deploy:private` をします。前の `~/a3deploy.sh` と同じ仕事です。
- いつもの枝の名前は、`scripts/owner-deploy.sh` の `DEFAULT_BRANCH` の1行だけに書いてあります。ちがう枝のときは、うしろに枝の名前を付けます（例：`bash ~/openqlow-a3/uizin-eventos/scripts/owner-deploy.sh 枝の名前`）。AIが枝を変えたときは、その1回だけ、枝の名前を付けて動かします。
- 置きかえは1回だけ：いつもの `bash ~/a3deploy.sh` で1回公開すると、Mac にもこのファイルが入ります。そのあと `echo 'bash ~/openqlow-a3/uizin-eventos/scripts/owner-deploy.sh "$@"' > ~/a3deploy.sh` を1回動かします。次からも `bash ~/a3deploy.sh` だけです。
- AIは、全部の検証（4を見る）に合格したら、検証ずみの一覧をコミットして push します。その一覧にある中身だけが「✓」になります。

## 3. 壊れないための自動チェック（`scripts/check-private-build.mjs`）

`npm run build:private` の最後に、自動で動きます。1つでも駄目なら、公開に進めません。ただし1つだけ例外があります：TypeScript が使えない環境（公開用の取り出し先など）では、「古いSafari向けの文法の検査」（下の9番の、クラスの `static` ブロックと正規表現の後読み）だけを省いて、先へ進みます。省いたときは、その環境では古いSafari向けの検査をしていません。
`build:private` は、作業場所で組み立ててから、公開用フォルダ（`out-private-pages/`）を丸ごと入れかえます。前に置いた余分なファイルは、残りません。

1. 置いてよいファイルだけ（許可リスト）。置けるのは、画面（html）・プログラム（js）・見た目（css）・書き出し（txt）・設定（json）・ひな形（.gs・.xlsx）・フォント（woff2）・図（svg）。名簿のCSV・ZIP・バックアップ（.enc）・ソースマップ・写真・`.env`・隠しファイルは、1つでもあれば止まる
2. 公開用フォルダの画面は、`/private/` と `/apply/` だけ（クラウド管理などが混ざらない）
3. 名簿を読む部品（ZIP・Excel）が、本当に入っている（抜けると、公開後に取り込みが動かない）
4. HTML・JSが指しているファイルが、すべて存在する
5. 付属ファイル：`_headers`・ひな形のプログラム・`template-link.json`。`template-link.json` は、空か、`https://docs.google.com/spreadsheets/d/…/copy` の形だけ
6. 安全のための設定（`_headers`）の中身：6つの道すじ（`/private/`・`/private/entry/*`・`/private/live/*`・`/private/setup/*`・`/private/sheet/*`・`/apply/*`）すべてに、`default-src 'self'`・`object-src 'none'`・`frame-src 'none'`・`base-uri 'none'`・`frame-ancestors 'none'`・`Referrer-Policy: no-referrer`・`nosniff`・`DENY`・`X-Robots-Tag: noindex`。許す宛先は「自分・none・data:・blob:・Googleの2つ」だけ。`/apply/*` は `connect-src 'none'`、送れる先は Google の2つだけ
7. 外のスクリプト・フォント・画像・CSSを読み込む書き方が無い（文章の中のリンクは数えない）。外へ通信する書き方（`fetch("https://…")` など）も止める
8. 鍵・秘密・個人情報らしき文字が入っていない（Google・AWS・GitHub・Slack の鍵、JWT、`sk-…`、`password: "…"` の形、本物らしい電話番号とメールアドレス。見本の `name@example.com`・`090-1234-5678` の形は許す）。大きさ・種類に関わらず、文字のファイルは全部読む
9. 古い Safari で動かない書き方が無い（クラスの `static` ブロック、正規表現の後読み）
10. CSS に `@layer` が残っていない。Tailwind v4 は、規則を `@layer` の中に入れて出す。Safari 15.0〜15.3 は `@layer` を知らず、その塊を捨てて、レイアウトが全部消える。`postcss.config.mjs` の小さな部品が、`@layer` を取りのぞく（手書きの規則には、強さを保つ `:not(#\#)` を足す）。Safari 15.4 以降は、どちらでも同じ見た目
11. 古い「別の方法で受付をつくる」画面（`private/google-setup`）は、公開用フォルダに入っていない。主催者のメールと合言葉（setupKey）をブラウザに残し、プライバシーの決まりに合わないため。入っていたら止まる（画面の置き場所・`tournament-google-setup:` の書き込み・`_headers` の古い設定・その画面だけが使う古い版のGoogleのプログラム `templates/Tournament_OS_Google受付.gs`）。ソースのファイルは消さず、`scripts/build-private-pages.sh` の `LEGACY_ROUTES` と `LEGACY_FILES` で外している。使える道は `/private/setup/`（v3）だけ
12. 長く覚えさせる設定（`Cache-Control: public, max-age=31536000, immutable`）は、名前に中身の印が入った部品（`/_next/static/*`）だけにある。スマホは2回目から、その部品をサーバーに聞き直さない。画面（HTML）など、ほかの道すじに長く覚えさせる設定があると止まる（公開し直しても、古い画面が出つづけるため）

手で動かす場合：`npm run verify:private-build`

## 4. 公開してよい条件（上のコマンドの前に、必ず）

型チェック・単体テスト・マニュアルの文字のロボット（`scripts/check-manual-labels.mjs`）・画面の確認（`scripts/test-*.mjs` の**すべて**）・`validate-ai-os`・git の見張りが、**すべて**合格すること。

一度に全部やるコマンド（`uizin-eventos/` で）：

```
npm run verify:all          （中身は bash scripts/verify-private-all.sh）
npm run verify:all -- --fast   （いちばん長い mistake-proof（およそ16分）だけをとばす。公開の前には使わない）
```

順番：型チェック(tsc) → 単体テスト(`npm test`) → `build:private` → マニュアルの文字のロボット（`check-manual-labels.mjs --no-suggest`。マニュアルの「…」が、作った画面に本当にあるか） → 手元の静かなサーバー → 画面の確認（`scripts/test-*.mjs` の名前が合うもの全部。足したものも自動で入る） → `validate-ai-os` → git の見張り（`next-stale-cache*/`・名簿のCSV・ZIP・`.env` などが、追跡していない形で混ざっていないか）。
1つ失敗しても、ほかは最後まで動かします。最後に「手順・合否・秒」の表を出し、1つでも失敗なら、終わりの番号が0以外になります。
**全部合格したときだけ**、`.verify-ok`（コミットと中身の指紋）を書きます。`npm run deploy:private` は、公開の前に、この指紋といまの中身を見くらべます。ちがうときは「⚠ 検証していない」と出て、`yes` ではなく `yes-unverified` と打たないと公開されません。
さらに、はじめから終わりまで `uizin-eventos/` がコミットずみ（変更も、まだ追跡していないファイルも無い）なら、このフォルダの中身の番号（`git rev-parse HEAD:uizin-eventos`）を、リポジトリのいちばん上の `uizin-eventos-verified-trees.txt` に1行足します。**この一覧は、コミットして push します**（フォルダの外にあるので、コミットしても中身の番号は変わりません）。`.verify-ok` の無い Mac でも、公開のコマンドは、この一覧で「全部合格した中身か」を見分けます。
全部の確認は、およそ30分かかります（2026-10-12 の実測の目安：browser 18秒・setup 7秒・v3-safety 12秒・glance 22秒・live-list 2.5分・class-ab 2.3分・resilience 5分・mistake-proof 16分）。

環境変数：`TOS_CHROME_PATH`（Chrome の場所。無ければ、パソコンの Chrome）・`TOS_PLAYWRIGHT_MODULE`（既定は `playwright`）・`TOS_PORT`（既定 4990）・`TOS_SKIP_BUILD=1`・`TOS_ONLY="test-class-ab test-polish-misc"`（その確認だけ）。

画面の確認の一覧（**今ある `scripts/test-*.mjs` の全部**）：

- `scripts/test-private-browser.mjs`（準備と当日の基本の流れ）
- `scripts/test-setup-v3-browser.mjs`（選手の受付をつくる画面）
- `scripts/test-private-resilience.mjs`（壊れ方・戻し方）
- `scripts/test-private-v3-safety.mjs`（安全：外へ送らない・個人情報）
- `scripts/test-private-glance.mjs`（ひと目で分かる見た目）
- `scripts/test-private-live-list.mjs`（当日の一覧）
- `scripts/test-private-mistake-proof.mjs`（まちがえやすい操作を、1つずつ試す）
- `scripts/test-class-ab.mjs`（A／Bクラス）
- `scripts/test-weight-class.mjs`（階級分け：区分→階級・赤い注意・ロゴ）
- `scripts/test-record-detail-apply.mjs`（くわしい戦績：キック・他の格闘技・タイトルの入力と、赤い注意）
- `scripts/test-private-record-fold.mjs`（準備の画面の「くわしい戦績」：320／390／1280px・試合数と勝ちだけ・取り込みの知らせ）
- `scripts/test-private-card-widths.mjs`（試合のカード：16の画面の幅で、写真と名前の列がつぶれない）
- `scripts/test-bout-sheet.mjs`（A3対戦一覧表：プレビュー・ページ分け・本物のPDF・個人情報が出ない・欠場・写真なし・並べ替えのあとの出しなおし）
- `scripts/test-bout-flow.mjs`（黄色の「次はここ」だけで、対戦カードを3つ作る）
- `scripts/test-polish-private.mjs`（準備の画面の仕上げ：ZIP・戻す・失敗の帯・取り込み・クラス）
- `scripts/test-polish-apply.mjs`（申し込みページの仕上げ）
- `scripts/test-polish-setup.mjs`（選手の受付をつくる画面の仕上げ）
- `scripts/test-polish-misc.mjs`（公開用の CSS・最初の画面・検索に出さない・フォルダの中身）
- `scripts/test-polish-live.mjs`（当日の画面の仕上げ：くっつく帯・1試合だけの大会・キーボード・失敗の帯・クラスの言葉・準備画面の帯）
- `scripts/test-hanamichi-apply.mjs`（花道の追加の質問：申し込みページに出る・出ない、必須、区分を変えると消える、生年月日の3つの欄、リンク、個人情報がどこにも残らない）
- `scripts/test-pledge-apply.mjs`（誓約書：申し込みページの最後のカード、□に✔を入れないと先へ進めない、保護者とジム責任者の欄、確認画面、リンクが切れたとき、外へ通信しない。黄色の札（👉）が文にかぶらない・🔒の理由が17px・電話の直しの言い方・確認されていないリンクのボタンのそばの赤✕・保護者の欄の一言・覚える物の正直な文も確かめる）
- `scripts/test-pledge-setup.mjs`（誓約書：設定の画面の診断の1行〔済み＝緑の✓／まだ＝赤い✕〕、リンクの6つの鍵、「なし」のとき誓約書の言葉がどこにも出ない、手順1の説明、文が読めない・リンクが長すぎる・設定の直しもの。ping は本物の受付プログラムをハーネスで動かした答え）
- `scripts/test-apply-deadline.mjs`（申し込みページの小さな直し：締切を過ぎた本番は欄と送信が🔒灰＋理由で止まる・テスト用は止まらない、確認画面のメールの折り返し、身長 1.70m が 170 になる、「用意するもの…入力は全部で◯個」、使い道の文、セットアップ画面の約30分）
- `scripts/test-apply-draft.mjs`（申し込みページの2つの短い記憶（R9）：入力の途中保存（下書き：選手の欄12個だけ・0.5秒でまとめて書く・戻す／消す・12時間）と、次の人のためのジム名・連絡先（60分・送信の直前に書く・変える）。sessionStorage だけ・入れてよい物だけ（保存された値を全部読んで、電話・メール・写真・生年月日・花道の答え・誓約書の✔が無いことを確かめる）・別の大会／モード／期限切れ／形がちがう物は読まない・storage が使えなくても申し込める・「別の人を申し込む（選手の入力だけ消す）」・黄色の「次はここ」は状態ごとに1つ・外へ通信しない）
- `scripts/test-hanamichi-class.mjs`（花道ではクラス（A/B）を選ばせない：花道の区分を選ぶとクラスの欄が消えて、花道のルールの1行が出る・ふつうの区分では今までどおりクラスが必須・hr の無い昔のリンクは今までどおり、送る内容にクラスが付かない、セットアップ画面の黄色の1行）

`scripts/test-*.mjs` を足したら、この一覧にも足します。足し忘れは、`tests/polish-misc.test.ts` が見つけて、単体テストが落ちます。

**型チェックと単体テストだけでは、公開の壊れ方は見つかりません。**（Codexの統合ブランチで、実際にそうなりました）

## 5. Codexの統合ブランチ（`codex/mac-latest-20261009`、`e671b67`）の確認結果

2026-10-09 に、別の作業フォルダで検証した結果です。**過去の記録です**（いまの数ではありません。そのときの画面の確認は6本でした）。

| 項目 | 結果 |
|---|---|
| 型チェック | 合格 |
| 単体テスト | 384本 合格 |
| 設定画面56／安全44／見やすさ84／一覧表示1353 | 合格 |
| 準備画面86／保存・復元の確認 | **失敗**（名簿の取り込みで「○人分を読み込みました」が出ない） |
| 公開用フォルダの自動チェック | **失敗**（ZIP・Excelを読む部品が入らない） |

**原因：** `package.json` の `build` を `next build --webpack` に変えたため、動的に読み込む部品（`4.….js`・`981.….js`）が、`build-private-pages.sh` の部品コピーから漏れる。公開すると、名簿のZIP・xlsxの取り込みが404で動かない。

**直し方（どちらか）：** (a) `build` を元に戻し、既定のビルドで `build:private` を通す。(b) `build-private-pages.sh` が、webpackの部品の一覧も読んで、動的な部品もコピーする。

**条件：** `node scripts/check-private-build.mjs` が OK、画面の確認が**全部**（上の4の一覧）合格してから push する。

## 6. 2つのAIで作業するときの決まり

1. 土台は常に最新の `claude/tournament-os-v3`。古い `codex/tournament-os-*` には push しない。
2. 同じファイルを、同時に編集しない。編集前に `COORDINATION.md` の「作業中」に、ファイル名と日付を書く。
3. force push、mainへの直接push、公開、認証や権限の変更は、オーナーの個別の承認があるまでしない。
4. 個人情報・鍵・実名簿は、コミットしない。push の前に、必ず確認する。
5. 「テストが通った」と報告するときは、**どのテストを、どのコミットで動かしたか**を書く。
