# Codex／Claude Code用 Tournament OS 再現プロンプト

以下を作業指示として扱ってください。

## 目的

GitHub上の既存UIZIN EventOSを基に、別の格闘技大会でも使えるTournament OSを、安全にローカル環境へ再現してください。

対象リポジトリ：

```text
https://github.com/flatup1/openqlow
```

対象ブランチ：

```text
codex/tournament-os-v1
```

対象ディレクトリ：

```text
uizin-eventos
```

汎用化仕様：

```text
uizin-eventos/docs/EASY_SETUP_GUIDE.md の「現在の版」
```

## 最優先ルール

1. 既存UIZIN本番版を壊さない。
2. 既存の未コミット変更を上書き・削除しない。
3. 最初はローカル確認まで行う。
4. ユーザーが明示的に許可するまで、commit、push、Cloudflare公開を行わない。
5. PR #144をmergeしない。
6. force pushを行わない。
7. 電話番号、メールアドレス、住所、保護者氏名、決済情報をコードや公開データへ入れない。
8. 操作キー、パスワード、APIトークンを表示・保存・commitしない。

## 作業開始時

次を順番に確認してください。

```bash
pwd
git status --short
git branch --show-current
git remote -v
node --version
npm --version
```

対象リポジトリがない場合は、新しい安全なフォルダへ対象ブランチをcloneしてください。

```bash
git clone --branch codex/tournament-os-v1 --single-branch https://github.com/flatup1/openqlow.git
cd openqlow/uizin-eventos
```

すでにリポジトリがあり、未コミット変更がある場合は、その変更を捨てたり混ぜたりせず、別worktreeまたは別cloneを使用してください。

## ローカル再現

次を実行してください。

```bash
# リポジトリ直下にいる場合だけ実行
cd uizin-eventos
npm install
npm test
npm run typecheck
npm run build:private
```

すでに `uizin-eventos` フォルダ内にいる場合は、`cd uizin-eventos` を繰り返さず、そこで `npm install` から始めてください。

失敗した場合は、原因を特定して最小限の修正を行い、もう一度 `npm run verify` を実行してください。同じ修正を意味なく繰り返さないでください。

確認用画面を起動してください。

```bash
npm run dev
```

起動後、ブラウザで表示できるローカルURLをユーザーへ示してください。公開環境へのデプロイは行わないでください。

## 汎用化の実装方針

- UIZIN固有の大会名、ロゴ、色、日付、会場を大会設定へ分離する。
- 大会IDごとに番組表・現在試合・画像・音楽・操作状態を分離する。
- 会長画面 `/private/?event=<eventId>` と本番画面 `/private/live/?event=<eventId>` を使う。既存クラウド連携版を流用しない。
- 選手、試合、入場曲の共通データモデルを使用する。
- 本番画面と管理画面を分離する。
- 本番画面は写真、名前、所属、プロフィール、意気込み、契約体重、入場曲、前／次だけを中心にする。
- 受付は主催者本人の非公開Google Sheets/Driveへ直接保存する。Cloudflareへ選手情報を送るWorker/APIは作らない。
- Googleで連絡先なし名簿＋写真のZIPを作り、主催者PCだけに取り込む。初回設定・保存先照合・テストが終わるまでは選手用URLを渡さない。
- 画像を事前最適化し、失敗時はシルエットを表示する。
- 大会名簿はIndexedDBに保存する。別PCには自動同期しない。保存失敗時に成功表示や試合の進行をしない。
- 公開用データと申込原本を完全に分ける。

## 変更時の進め方

1. 100点の受け入れ条件を具体化する。
2. 既存実装と仕様の差分だけを確認する。
3. 影響範囲が小さい順に実装する。
4. 単体テストを追加する。
5. `npm run verify` を実行する。
6. ブラウザでPC・タブレット相当の表示を確認する。
7. 通信断、再読込、画像エラー、曲なしを確認する。
8. 個人情報や秘密が差分に含まれていないか確認する。

## ユーザーへ質問する場合

完成度を大きく左右する情報だけを、一度に最大3問まで質問してください。専門用語を避け、推奨案を最初に示してください。

大会を新規作成する場合に必要な情報は次のとおりです。

- 大会名
- 大会IDに使う短い英数字
- 開催日・会場
- ロゴ・テーマカラー
- 個人情報を除いた進行表

## ローカル完了時の報告

次の順に短く報告してください。

1. 完成したもの
2. 変更した主な箇所
3. テスト・ビルド結果
4. ローカル確認URL
5. 未確認事項
6. 公開前に必要なユーザー操作

公開、push、mergeは、ユーザーから対象と公開先を含む明示的な許可を受けた後だけ実行してください。
