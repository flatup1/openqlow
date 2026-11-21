# AIスマートグラス コンパニオンアプリ（開発中）

Mingtown製AIスマートグラスで撮った**写真と動画を、確実に・かんたんに・ワイヤレスで携帯へ**送るアプリです。
公式アプリ（HeyCyan）が使いにくいので、老若男女、特に高齢者でも迷わず使えるものを作ります。

## いまの状態（一言で）

**アプリの「頭脳」ができました。「手足」はこれからです。**

写真を二重に保存しない、途中で切れても続きから再開する、エラーを分かりやすく伝える ──
こういう**考える部分**は完成して、57個のテストが全部通っています。
まだできていないのは、実際にメガネとつないで通信する部分です。ここは**実機が無いと作れません**。

## 採点

**総合 12点 / 100点**（前回 1点 → +11点）

最新の採点と根拠は [`docs/SCORECARD.md`](docs/SCORECARD.md) にあります。ここが常に最新です。

## 次の一手

**JINさんへ**: GitHubで空のリポジトリを1つ作ってください（30秒）。手順は [`docs/MOVE_TO_NEW_REPO.md`](docs/MOVE_TO_NEW_REPO.md)。

**私（Claude Code）**: リポジトリができ次第そこへ移し、次は「転送の司令塔」を作ります。これも実機なしでテストできます。

## 作ったもの

### `core/` — 転送の心臓部（完成・テスト済み）

Androidの機能を一切使っていません。だから**実機が無くてもテストできます**。
iOS版でも同じ仕組みをそのまま移せます。

| ファイル | 何をするもの |
|---|---|
| `MediaItem.kt` | メガネの中の写真・動画1つ分の情報 |
| `TransferQueue.kt` | **心臓部**。どれが完了・転送中・保留・失敗かを覚えておく係 |
| `Dedup.kt` | 同じ写真を二重に保存しない仕組み |
| `TransferError.kt` | エラーを8種類に分け、それぞれに「次にすること」を用意 |
| `Progress.kt` | 「10件中3件完了」の計算。残り時間は正確に出せるときだけ |
| `PartFile.kt` | 壊れた写真を残さないための一時ファイルの決まり |
| `SafeLog.kt` | Wi-Fiパスワードや写真の実名をログに残さない |
| `ManifestParser.kt` | メガネが返すファイル一覧の読み取り（形式は実機で確定させる） |

### テストの動かし方

```bash
cd ai-glasses
gradle :core:test
```

結果（2026-08-29 実行）:

```text
BUILD SUCCESSFUL
TOTAL 57 tests, 0 failed, 0 skipped
```

**特に大事なテスト**（要件書の必須項目を守れているかの確認）

- 通信が切れても、**完了済みのデータは消えない**
- id が変わっても、**同じ写真は二重に取り込まない**
- 大きさが合わなければ、**壊れたファイルを正式なファイルにしない**
- 空き容量不足のように**やり直しても無駄なもの**は、自動リトライしない
- エラー文に**専門用語（HTTP、BLE、null など）が混ざらない**
- ログに**Wi-Fiパスワードや実際のファイル名が出ない**

## いちばん大事な発見

参考にする予定だった2つのGitHubリポジトリは、**コードをコピーして使えません**（ライセンスが無い／独占ソフト）。
なので「**仕様は参考にする。コードは自分で書く**」方針で進めています。
くわしくは [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md)。

## 書類の地図

| ファイル | 中身 |
|---|---|
| [`docs/SCORECARD.md`](docs/SCORECARD.md) | **最新の採点・残作業・次の一手（ここを見れば分かる）** |
| [`docs/MOVE_TO_NEW_REPO.md`](docs/MOVE_TO_NEW_REPO.md) | 別リポジトリへ移す手順 |
| [`docs/PHASE1_TASKS.md`](docs/PHASE1_TASKS.md) | Must / Should / Later の残作業一覧 |
| [`docs/TRANSFER_SPEC.md`](docs/TRANSFER_SPEC.md) | 転送のしくみの設計図（未確認事項つき） |
| [`docs/ADR-0001-STACK.md`](docs/ADR-0001-STACK.md) | どの技術で作るか、その理由 |
| [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md) | 参照OSSのライセンス調査 |
| [`docs/PHASE0_REPORT.md`](docs/PHASE0_REPORT.md) | Phase 0 の記録（2026-08-28 時点） |

## この場所について

このフォルダは今 `openqlow` リポジトリの中にありますが、**中身は完全に独立**しています。
openqlow本体（FLATUP GYMの経営支援AI）のコードには一切触れていません。
JINさんの判断で、別リポジトリへ移す予定です（[`docs/MOVE_TO_NEW_REPO.md`](docs/MOVE_TO_NEW_REPO.md)）。
