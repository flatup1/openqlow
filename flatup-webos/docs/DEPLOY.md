# DEPLOY — Phase 1 公開手順（XServer・最小安全手順）

目的: 完成度を上げることではなく、**実際のユーザーがどこで迷い、どこで離脱し、
どのルートからLINE・体験予約へ進むかを確認すること**。

## 公開するもの

`flatup-webos/app/` の中身**全部**（8ファイル）。
ビルド不要・依存ゼロ・サーバー処理なし。docs/ と test/ はアップロードしない。

```
index.html
styles.css
hero.jpg          ← ようこそ画面の写真。忘れるとLINEのカード画像も出ない
js/analytics.js
js/app.js
js/concierge.js
js/questions.js
js/state.js
```

**一部だけ上げてはいけない。** `?v=` はキャッシュ破棄の合図であってファイル名ではないため、
`index.html` が `styles.css?v=14` を指していても、サーバーの `styles.css` が古ければ
古い見た目が出る。**毎回フォルダごと上書きする。**

## XServerへの最小安全手順

1. PR #100 をマージし、mainの `flatup-webos/app/` を手元に用意する。
2. XServerのファイルマネージャー（またはFTP）で、公開ドメイン直下に
   **新しいサブディレクトリ**を作る（例: `public_html/webos/`）。
   **既存サイトのファイルには一切触らない。上書き・削除をしない。**
3. `app/` の中身を**8ファイルすべて**アップロードする（index.html / styles.css / hero.jpg / js/ フォルダ）。
   更新時も同じ。一部だけ差し替えない。
4. `https://<ドメイン>/webos/` をiPhoneの実機Safariで開き、下の公開後チェックを実施する。
5. 問題があれば、そのディレクトリを消すだけで元どおり（既存サイトは無傷）。

## 公開前の注意点

- **自分の住所は「転送されない方」を書く。** 本番は `flatupnarita.jp` → `www.flatupnarita.jp`
  へ301で転送しているため、`canonical` / `og:url` / `og:image` は `www` 付きを指す
  （対応済み。`flatup-webos/test/flow.test.cjs` が3つとも www 付きであることを検査する）。
  ```html
  <link rel="canonical" href="https://www.flatupnarita.jp/webos/">
  <meta property="og:url"   content="https://www.flatupnarita.jp/webos/">
  <meta property="og:image" content="https://www.flatupnarita.jp/webos/hero.jpg?v=14">
  ```
  転送される住所を `og:image` に書くと、LINEがカード画像を取りに来たとき転送を追わない
  実装があり、**写真の出ないカード**になる。
- **JS・CSS・画像を更新したら `?v=` の数字を上げる。** 上げ忘れると、古いファイルが
  利用者のスマホに残り、新しい画面が出ない。
  番号は `index.html` と `app/js/*.js` の**全部を同じ数字に揃える**
  （画面に出る写真の指定は `js/app.js` にあり、ここだけ取り残された実績がある。
  `flow.test.cjs` がファイルをまたいでズレを検査する）。

- **v13から計測はAIKAへ送信する。** 外部の有料サービスは使わず、
  匿名セッションID・イベント名・選択カテゴリだけを保存する。
  氏名・電話・自由文・IPは計測DBへ保存しない。行動データは90日で自動削除する。
- 運用確認はAIKA VPSで
  `python3 /opt/flatup-aika/ops/webos_metrics.py --days 7` を実行する。
- 個人情報はAnalyticsへ送らない（イベント名と選択カテゴリのみ。現実装は準拠済み）。
- LINEリンクは正本 `https://lin.ee/cTSDajPz`（flatup-lp と同一）を使用済み。
- 既存LP・既存サイトとURLが競合しないこと（/webos/ など専用パスに置く）。

## 上げたあと、まず機械に聞く

```bash
cd ~/openqlow && npm run check
```

`--- 4. WebOSのページ ---` の行がこう出れば反映できている。

```
✅ … は公開されています（転送先 https://www.flatupnarita.jp/webos/ で表示）
✅ アップロード済みのページは手元と同じ版です（styles.css?v=14）
```

`❌ 公開中のページが古いです` なら、まだ届いていない。多いのは `js/` の入れ忘れ。

## 公開後チェックリスト

- [ ] iPhone Safari 実機: ようこそ画面 → Q1 → 成人ルート全問 → 結果 → CTAでLINEが開く
- [ ] キッズルート・相談ルートも同様に最後まで進める
- [ ] 「← 戻る」「答えずに進む」「最初からやり直す」が動く
- [ ] ダークモードで文字が読める
- [ ] Android Chrome でも1周する
- [ ] 表示が一瞬で出る（重い・白い時間がないこと）
- [ ] 誤字・不自然な文言がない
- [ ] AIKAの7日レポートに webos_started / personalized_view /
      booking_clicked / line_clicked / LINE引き継ぎ数が反映される

## データが集まったら見ること（削る判断はデータで）

- Q1の回答率（webos_started → audience_selected）
- 各質問の通過率と、どの質問で離脱が増えるか（**Q5時間帯の要否をここで判断**）
- 性別質問のスキップ率と、回答がパーソナライズに効いているか（**性別質問の要否**）
- ルート別（成人/キッズ/家族/相談）の personalized_view → booking_clicked / line_clicked 率
