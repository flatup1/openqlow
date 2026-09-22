# OpenCut ローカル版（FLATUP用）

結論: **MacにDocker DesktopとBunを入れれば、3コマンドで自分専用の動画編集ソフトが立ち上がる。** 動画はネットに出ず、Macの中だけで扱える。

対象は `opencut-app/opencut-classic`（MITライセンス）。書き直し中の新リポジトリ `opencut-app/opencut` には編集機能がまだ無いので、そちらは使わない。

---

## 1. 何ができるか

- 素材の取り込み（動画・画像・音声）、タイムラインでの切り貼り、テキスト、書き出し（Export）
- 全部ローカル。素材はブラウザの中（IndexedDB と OPFS）に保存され、外部サーバーには送られない
- CapCutのような有料制限が無い

## 2. 何ができないか・注意点

- **本家はメンテ終了（archived）**。不具合が出ても本家の修正は来ない。直すなら自分たちで直す。
- **保存先はブラウザの中**。ブラウザのサイトデータを消すとプロジェクトも消える。大事なものは必ず Export して動画ファイルとして保存する。
- ログイン機能はあるが、ローカルで一人で使う分には不要。
- 書き出しの速さはMacの性能次第。長尺・4Kは重い。

## 3. 必要なもの

| 物 | 用途 | 入れ方 |
|---|---|---|
| Docker Desktop | データベースとRedisを動かす | https://docs.docker.com/desktop/ |
| Bun | 画面を動かす | `curl -fsSL https://bun.sh/install \| bash` |
| git | 本体の取得 | `xcode-select --install` |

ディスクは約4GB使う。

## 4. 手順

```sh
cd ~/Desktop/"OPENQLOW HelMES"      # openqlow を置いている場所
./opencut-studio/setup.sh           # 初回だけ。5〜15分かかる
./opencut-studio/start.sh           # 毎回の起動
```

起動したらブラウザで http://localhost:3000 を開く。

止めるときは、画面側は `Ctrl + C`、裏で動くデータベースは次で止める。

```sh
./opencut-studio/stop.sh
```

## 5. 使い方の流れ

1. 右上の「Projects」→「Create your first project」
2. 左上「Import」から素材を選ぶ（ドラッグ＆ドロップも可）
3. 素材にマウスを乗せると出る **「＋」ボタン**を押す。これでタイムラインに乗る
4. 下のタイムラインで切る・並べる。左端の「T」で文字を足す
5. 右上「Export」で形式と画質を選んで書き出す

**注意: ステップ3で素材をダブルクリックしてもタイムラインに乗らない。** マウスを乗せたときにサムネイル中央に出る「＋」を押すのが正解。ここで時間を溶かしやすい。

## 6. 確認済みのこと（このセッションで実際に動かした）

- `bun install` → 1951パッケージ導入、成功
- `bun run db:migrate` → テーブル5件（users / sessions / accounts / verifications / waitlist）作成、成功
- `bun dev:web` → http://localhost:3000 が HTTP 200、`/api/health` も 200
- プロジェクト新規作成 → `/editor/<ID>` に遷移し、編集画面（素材パネル・プレビュー・タイムライン・Export）が表示
- テスト用の動画ファイルを Import → 素材パネルにサムネイルと長さ「0:03」が出た
- 「＋」ボタンでタイムラインに配置 → プレビューに映像が表示され、尺が `00:00:03:04` になった
- **Export（WebM形式）→ 動画ファイルの書き出しに成功**。生成物は 3.16秒 / 640x360 / 76KB で、再生できることを確認した

## 7. 未確認のこと（正直に書く）

- **Dockerでの起動は未確認**。検証したコンテナではDockerイメージの取得が組織のネットワーク方針で拒否されたため、PostgreSQLとRedisはMacと同じ構成ではなく、そのコンテナに元から入っていたものを使った。Mac側でDocker Desktopを使う手順そのものは本家READMEの通りで、`setup.sh` は各段階で止まって理由を出すようにしてある。
- **MP4形式での書き出しは未確認**。検証環境のヘッドレスブラウザに H.264 のエンコード機能が無く失敗した。ブラウザ側の制約であり、OpenCutの不具合ではない。WebM形式では成功しているので、書き出し機能そのものは動く。
- **本番ビルド（`bun run build:web`）は未確認**。検証環境では Google Fonts への接続が遮断され、フォント取得の失敗だけでビルドが落ちた。通常のネット環境なら通るはずだが、断定はしない。普段使いは `start.sh`（開発モード）で足りる。

## 8. 既知の不具合と回避策

| 症状 | 原因 | 対処 |
|---|---|---|
| `bun run db:push:local` が `No schema files found` で失敗 | 本家 `drizzle.config.ts` のパス指定ミス（実体は `src/db/schema.ts`、設定は `src/lib/db/schema.ts`） | `bun run db:migrate` を使う。`setup.sh` はこちらを使っている |
| フォントが標準のものに見える | Google Fonts に繋がらなかった | 表示だけの問題。編集機能に影響なし |
| `docker compose up` で止まる | Docker Desktop が起動していない | Docker Desktop を起動してから再実行 |
| Export で `Export failed` と出て、`avc1...is not supported by this browser` と書かれている | そのブラウザに H.264（MP4用）のエンコード機能が無い | Export画面の「Format」を開いて **WebM (VP9)** を選ぶと書き出せる。検証環境ではこれで成功した。MacのChromeは通常H.264を持っているのでMP4で書き出せるはず |

## 9. ファイル

| ファイル | 中身 |
|---|---|
| `setup.sh` | 初回セットアップ（取得・環境設定・DB起動・依存導入・テーブル作成） |
| `start.sh` | 起動 |
| `stop.sh` | データベースとRedisの停止 |
| `opencut-classic/` | 本体。`setup.sh` が取得する。gitには含めない |

## 10. FLATUPでの想定用途

ブランドフィルムやSNS用の短尺を、外注せず社内で切る。素材が外に出ないので、会員が映る映像も扱える。ただし**会員が映る映像の撮影・利用は本人同意が前提**で、これはツールの話ではなく運用の話。公開前の確認はこれまで通りオーナー承認を通す。
