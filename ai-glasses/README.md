# AIスマートグラス コンパニオンアプリ（開発中）

Mingtown製AIスマートグラスで撮った**写真と動画を、確実に・かんたんに・ワイヤレスで携帯へ**送るアプリです。
公式アプリ（HeyCyan）が使いにくいので、老若男女、特に高齢者でも迷わず使えるものを作ります。

## いまの状態（一言で）

**まだ1行も作れていません。** 今日やったのは「何を、どの順番で、いくらで作るか」を決める調査です。
アプリの中身（接続・転送・画面）はこれから作ります。

## 採点

**総合 1点 / 100点**（2026-08-28 時点）

くわしくは [`docs/PHASE0_REPORT.md`](docs/PHASE0_REPORT.md) を見てください。

## いちばん大事な発見

参考にする予定だった2つのGitHubリポジトリは、**コードをコピーして使えません**（ライセンスが無い／独占ソフト）。
なので「**仕様は参考にする。コードは自分で書く**」方針で進めます。
くわしくは [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md)。

## 次の一手

`ai-glasses/core/` に、**実機がなくてもテストできる転送の心臓部**（ファイル一覧の読み取り、重複防止、途中再開、エラー分類）を作ります。
費用0円。この開発環境で今日から検証できることを確認済みです。

## 書類の地図

| ファイル | 中身 |
|---|---|
| [`docs/PHASE0_REPORT.md`](docs/PHASE0_REPORT.md) | 採点、完了・作業中・残作業、費用、次の一手 |
| [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md) | 参照OSSのライセンス調査（最重要リスク） |
| [`docs/ADR-0001-STACK.md`](docs/ADR-0001-STACK.md) | どの技術で作るか、その理由 |
| [`docs/TRANSFER_SPEC.md`](docs/TRANSFER_SPEC.md) | 転送のしくみの設計図（未確認事項つき） |
| [`docs/PHASE1_TASKS.md`](docs/PHASE1_TASKS.md) | Must / Should / Later の残作業一覧 |

## この場所について

このフォルダは `openqlow` リポジトリの中にありますが、**中身は完全に独立**しています。
openqlow本体（FLATUP GYMの経営支援AI）のコードには一切触れていません。
将来 `git subtree split` で単独リポジトリへ切り出せる形にしてあります。
