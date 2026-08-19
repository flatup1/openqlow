# DEPLOY — Phase 1 公開手順（XServer・最小安全手順）

目的: 完成度を上げることではなく、**実際のユーザーがどこで迷い、どこで離脱し、
どのルートからLINE・体験予約へ進むかを確認すること**。

## 公開するもの

`flatup-webos/app/` の中身だけ（index.html / styles.css / js/ の5ファイル）。
ビルド不要・依存ゼロ・サーバー処理なし。docs/ と test/ はアップロードしない。

## XServerへの最小安全手順

1. PR #100 をマージし、mainの `flatup-webos/app/` を手元に用意する。
2. XServerのファイルマネージャー（またはFTP）で、公開ドメイン直下に
   **新しいサブディレクトリ**を作る（例: `public_html/webos/`）。
   **既存サイトのファイルには一切触らない。上書き・削除をしない。**
3. `app/` の中身（index.html, styles.css, js/ フォルダ）をそのままアップロードする。
4. `https://<ドメイン>/webos/` をiPhoneの実機Safariで開き、下の公開後チェックを実施する。
5. 問題があれば、そのディレクトリを消すだけで元どおり（既存サイトは無傷）。

## 公開前の注意点

- **計測はまだどこにも送信されない。** 現状のイベントはブラウザ内の `dataLayer` に
  貯まるだけで、サーバー送信ゼロ（プライバシー的には最安全）。
  実ユーザーのデータを集めるには、公開時に **GTM（Googleタグマネージャー）の
  標準スニペットを index.html の `<head>` に貼る**のが最小手順。
  `track()` は dataLayer 互換なので、GTM側で「カスタムイベント」トリガーを
  作るだけで webos_started 等をGA4へ送れる（コード変更不要）。
  GTM/GA4のIDはJINが管理。**IDをリポジトリへコミットしない。**
- 個人情報はAnalyticsへ送らない（イベント名と選択カテゴリのみ。現実装は準拠済み）。
- LINEリンクは正本 `https://lin.ee/cTSDajPz`（flatup-lp と同一）を使用済み。
- 既存LP・既存サイトとURLが競合しないこと（/webos/ など専用パスに置く）。

## 公開後チェックリスト

- [ ] iPhone Safari 実機: ようこそ画面 → Q1 → 成人ルート全問 → 結果 → CTAでLINEが開く
- [ ] キッズルート・相談ルートも同様に最後まで進める
- [ ] 「← 戻る」「答えずに進む」「最初からやり直す」が動く
- [ ] ダークモードで文字が読める
- [ ] Android Chrome でも1周する
- [ ] 表示が一瞬で出る（重い・白い時間がないこと）
- [ ] 誤字・不自然な文言がない
- [ ] （GTM接続後）webos_started / audience_selected / 各質問回答 /
      personalized_view / booking_clicked / line_clicked がGA4に届く

## データが集まったら見ること（削る判断はデータで）

- Q1の回答率（webos_started → audience_selected）
- 各質問の通過率と、どの質問で離脱が増えるか（**Q5時間帯の要否をここで判断**）
- 性別質問のスキップ率と、回答がパーソナライズに効いているか（**性別質問の要否**）
- ルート別（成人/キッズ/家族/相談）の personalized_view → booking_clicked / line_clicked 率
