# ゴミ収集クリーンシステム

朝起きたときに、デスクトップが片づいている状態を作る仕組み。

毎朝6:20に1回だけ走り、次の4つをまとめて行う。

1. デスクトップとダウンロードのファイルを、種類ごとに整頓する
2. システムの残骸（`.DS_Store` など）や空ファイルを「ゴミ箱待ち」へ移す
3. 整頓したものを外付けドライブへコピーする
4. 30日たった「ゴミ箱待ち」を完全に消す

結果はLINEで1通だけ届く。

## いちばん大事な約束

**いきなり消えるファイルは1つもない。**

捨てる判断をしたファイルは、まず `99_ゴミ箱待ち` へ移すだけ。
そこから30日たって初めて消える。気づいた時点で戻せる。

さらに、次の4つが実装で守られている（`src/cleanup/safety.ts`）。

- ホーム直下、`/`、`/System`、`/Applications`、`.git`、`.ssh` などは対象にできない
- 完全削除は「ゴミ箱待ち」の中のファイルだけ。1件ずつ確認して消す
- 完全削除の対象にできる**場所**も、`99_ゴミ箱待ち` と名前が `.Trash` のフォルダだけ。
  設定を書き間違えて `~/Documents` を指定しても、そこは消さずに理由をLINEで知らせる
- フォルダごとの再帰削除はしない

### 30日はいつから数えるか

**ゴミ箱待ちへ入れた日から**数える。ファイルの更新日時ではない。

「去年作った書類」を今日ゴミ箱待ちへ入れた場合、消えるのは30日後であって今日ではない。
入れた日は日付フォルダ（`99_ゴミ箱待ち/2026-09-03/`）に残っており、
それとファイル自体の状態の、**遅いほう**を採る。バックアップから戻したときも消えない。

## 何も設定しないとどうなるか

**お試し実行**になる。計画は作るがファイルは1件も動かない。
LINEには「お試し実行です。ファイルはまだ動かしていません。」と出る。

まずこの状態で数日ようすを見て、届く内容に納得してから本番に切り替える。

## 手で試す

```bash
cd "/Users/jin/Desktop/OPENQLOW HelMES/openqlow"
npm run cleanup            # お試し実行（何も動かない）
npm run cleanup:apply      # 本番実行（実際に整頓する）
```

実行するとログが残る。

```text
logs/cleanup/YYYY-MM-DD.md
```

どのファイルがどこへ行ったかが1件ずつ書いてある。

## 自動実行の入れ方（Mac）

```bash
cp deploy/launchd/com.flatup.openqlow.cleanup.plist ~/Library/LaunchAgents/
OPENQLOW_LAUNCHD_LABEL=com.flatup.openqlow.cleanup bash scripts/install-launchd.sh
```

状態を見る / 手で1回動かす / 止める:

```bash
OPENQLOW_LAUNCHD_LABEL=com.flatup.openqlow.cleanup bash scripts/install-launchd.sh status
OPENQLOW_LAUNCHD_LABEL=com.flatup.openqlow.cleanup bash scripts/install-launchd.sh trigger
OPENQLOW_LAUNCHD_LABEL=com.flatup.openqlow.cleanup bash scripts/install-launchd.sh uninstall
```

## 本番に切り替える順番

一度に全部を有効にしない。1つ変えたら数日ようすを見る。

| 順番 | 設定 | 何が起きるか |
| --- | --- | --- |
| 1 | `OPENQLOW_CLEANUP_APPLY=true` | 整頓と「ゴミ箱待ち」への移動が実際に行われる |
| 2 | `OPENQLOW_CLEANUP_BACKUP_ROOT=/Volumes/ドライブ名` | 外付けドライブへコピーする |
| 3 | `OPENQLOW_CLEANUP_PURGE=true` | 30日を過ぎた「ゴミ箱待ち」を完全に消す |
| 4 | `OPENQLOW_CLEANUP_EMPTY_TRASH=true` | Macのゴミ箱の古いファイルも消す |

3と4はファイルが本当に消える。オーナー（JIN）が納得してから有効にする。

## 設定一覧

| 環境変数 | 既定 | 意味 |
| --- | --- | --- |
| `OPENQLOW_CLEANUP_TARGETS` | `~/Desktop,~/Downloads` | 片づける場所（カンマ区切り） |
| `OPENQLOW_CLEANUP_ORGANIZED_ROOT` | `~/Desktop/00_整理済み` | 整頓後の保存先 |
| `OPENQLOW_CLEANUP_QUARANTINE_ROOT` | `~/Desktop/99_ゴミ箱待ち` | 捨てる前の一時置き場 |
| `OPENQLOW_CLEANUP_BACKUP_ROOT` | 未設定 | 外付けドライブ。未接続なら自動でスキップ |
| `OPENQLOW_CLEANUP_BACKUP_FOLDER` | `FLATUP_CLEAN` | 外付けドライブ内の保存先フォルダ名 |
| `OPENQLOW_CLEANUP_IDLE_DAYS` | `1` | 何日触っていないファイルを片づけるか |
| `OPENQLOW_CLEANUP_RETENTION_DAYS` | `30` | ゴミ箱待ちの保管日数 |
| `OPENQLOW_CLEANUP_APPLY` | `false` | `true` で実際にファイルを動かす |
| `OPENQLOW_CLEANUP_PURGE` | `false` | `true` で保管日数を過ぎたものを完全削除 |
| `OPENQLOW_CLEANUP_EMPTY_TRASH` | `false` | `true` でMacのゴミ箱も対象にする |
| `OPENQLOW_CLEANUP_TRASH_ROOTS` | `~/.Trash` | Macのゴミ箱の場所（名前が `.Trash` の場所だけ有効） |
| `OPENQLOW_CLEANUP_INCLUDE_FOLDERS` | `false` | `true` でフォルダごと整頓する |
| `OPENQLOW_CLEANUP_DISABLED` | `false` | `true` で完全停止 |

`true` と書いたときだけ有効。`1` や `yes` では動かない（設定ミスで勝手に動かないため）。

## 整頓後のフォルダの形

更新日を基準に、年 / 月 / 種類 の順で入る。

```text
~/Desktop/00_整理済み/
  2026/
    08/
      画像/     写真.png
      書類/     資料.pdf
      表計算/   売上.xlsx
      動画/     体験.mp4
```

同じ名前のファイルがあっても上書きしない。`資料_1.pdf` のように名前を変えて両方残す。

## 触らないもの

- 今日さわったファイル（作業中の可能性がある）
- 隠しファイル（`.env` などの設定ファイル）。ただし `.DS_Store` のような残骸は除く
- エイリアス（リンク先を巻き込まないため）
- フォルダ（`OPENQLOW_CLEANUP_INCLUDE_FOLDERS=true` にしない限り）
- 自分が作った `00_整理済み` と `99_ゴミ箱待ち`

## 外付けドライブ

- **コピー**であって移動ではない。手元のファイルは消えない
- ドライブがつながっていない朝は、スキップしてLINEにそう書く。エラーにはしない
- 前回と同じ内容のファイルは飛ばすので、2回目以降は速い

## LINE通知

送り先は JIN のみ。お客様には絶対に届かない（`src/line_bot/notifier.ts` が実装で止めている）。

同じ日に2回走っても、届くのは1通だけ（`src/scheduler/run_lock.ts`）。

届く内容の例:

```text
【ゴミ収集クリーン】2026-09-01

整頓 12件 / ゴミ箱待ちへ 3件
内訳: 画像7 / 書類4 / その他1
外付け保存 12件（5.0MB）
完全削除 なし

整頓先: /Users/jin/Desktop/00_整理済み
戻したいとき: /Users/jin/Desktop/99_ゴミ箱待ち（30日は消えません）
```

ファイル名に電話番号やメールアドレスが入っていても、通知とログでは伏字になる
（`src/privacy/rules.ts` の `sanitiseFreeText` を通す）。

## 元に戻したいとき

1. `~/Desktop/99_ゴミ箱待ち/日付/` を開く
2. 戻したいファイルをデスクトップへドラッグする

整頓されたファイルを探すときは `~/Desktop/00_整理済み/` の年・月・種類をたどる。
ログ（`logs/cleanup/YYYY-MM-DD.md`）にも移動先が1件ずつ書いてある。

## 中身の場所

| ファイル | 役割 |
| --- | --- |
| `src/cleanup/config.ts` | 設定の読み取り。既定値は全部「安全側」 |
| `src/cleanup/classify.ts` | 1件ごとの判定（整頓 / ゴミ箱待ち / 触らない） |
| `src/cleanup/safety.ts` | 触ってはいけない場所を実装で止める |
| `src/cleanup/plan.ts` | 計画を作る。ここではまだ動かさない |
| `src/cleanup/apply.ts` | 唯一ファイルを動かす場所 |
| `src/cleanup/report.ts` | LINE本文とログの組み立て |
| `src/cleanup/run.ts` | 入口。launchd から呼ばれる |

テスト:

```bash
npm run test:cleanup-classify
npm run test:cleanup-safety
npm run test:cleanup-plan
npm run test:cleanup-apply
npm run test:cleanup-report
npm run test:cleanup-run
```

## 関連

- `docs/ai-os/workflows/file_cleanup.md` — 人が行うファイル健診（こちらは削除・移動をしない）
- `docs/ai-os/canon/approval_matrix.md` — 承認が要る操作の一覧
