# 参照OSSのライセンス調査

調査日: 2026-08-28 / 調査: Claude Code

---

## 結論（先に）

**要件書§5に挙がっている2つのリポジトリは、どちらもコードをコピーして使えません。**

- 片方は「独占ソフト（proprietary）」と明記されている
- もう片方はライセンス表示が無い → 法律上は「**全権利留保**」= 作者以外は使えない

さらに、出回っているベンダー製バイナリ（`glasses_sdk_20250723_v01.aar` / `QCSDK.framework`）は
**出所不明**で、再配布もセキュリティ検証もできません。

これは要件書§3「既存SDKを最大限活用する」と正面からぶつかります。
そこで、次の方針を**明示的な仮定**として採用します。

> **仕様（プロトコル）は参考にする。コードは自分で書く。**（クリーンルーム実装）

---

## 調べたこと

### 1. FerSaiyan / Alternative-HeyCyan-App-and-SDK（通称 CyanBridge）

- URL: https://github.com/FerSaiyan/Alternative-HeyCyan-App-and-SDK
- 言語: Kotlin / Java（Android）、Swift（iOS）、Kotlin Multiplatform の共有コード
- 内容: BLE接続、Wi-Fi Directでのメディア転送、ローカル/リモートAIチャット、議事録要約
- 実体: `android/CyanBridge/` にAndroidアプリ本体
- スター数: 73
- **ライセンス: 表示なし（未検出）**

**判定: コードのコピー・改変・同梱は不可。**
GitHubの利用規約上、LICENSEファイルが無いリポジトリは著作権が全て作者に留保されます。
公開されていて「見る」ことはできますが、「使う」許可は出ていません。

### 2. ebowwa / HeyCyanSmartGlassesSDK

- URL: https://github.com/ebowwa/HeyCyanSmartGlassesSDK
- 言語: Objective-C（iOS主）、Swift、Kotlin
- 対応: iOS 11.0以上、Android
- 内容: BLEでの写真撮影・動画・音声・AI画像生成の制御。`WIFI_TRANSFER_ARCHITECTURE.md` あり
- スター数: 78 / フォーク: 40
- **ライセンス: READMEに "This SDK is proprietary software. Contact HeyCyan for licensing information." と明記**

**判定: コードのコピー・改変・同梱は不可。** 独占ソフトと自ら宣言しています。

### 3. ベンダー製バイナリ

- `glasses_sdk_20250723_v01.aar`（Android）
- `QCSDK.framework`（iOS）

**判定: 使用しない。** 理由は3つです。

1. **出所不明** — 誰が作ったどのバージョンか検証できない。要件書§3「SDKやバイナリを利用する前に、ライセンス、出所、対応OS、セキュリティを確認する」を満たせない
2. **再配布不可** — ライセンスが無いので、アプリに同梱して配布できない
3. **セキュリティ** — 中身の見えないバイナリが写真・動画・Wi-Fiパスワードを扱うのは危険。要件書§16「秘密情報を平文で残さない」を保証できない

### 調査の限界（未確認）

- GitHub APIへの直接アクセスは 403 で拒否されたため、確認はWeb画面の内容に基づきます
- 各リポジトリの**全ファイルは未走査**です。LICENSEファイルが目立たない場所にある可能性は残ります
- → **Phase 1-A 着手前に、リポジトリをクローンして `LICENSE` `NOTICE` `COPYING` を直接確認する**タスクを `PHASE1_TASKS.md` に入れました

---

## それでも合法にできること

著作権が守るのは「**書き方（コードの表現）**」であって、「**事実や仕組み**」ではありません。
次のものは公開情報として参照して構いません。

| 参照してよいもの | 例 |
|---|---|
| プロトコルの事実 | BLE Service UUID `7905FFF0-B5CE-4E99-A40F-4B1E122D00D0` |
| 通信の手順 | BLE接続 → 転送モード起動 → Wi-Fi接続 → `media.config` 取得 → ダウンロード |
| エンドポイントのパス | `http://<グラスIP>/files/media.config` |
| OS APIの使い方 | `NEHotspotConfiguration`、Wi-Fi Direct（これはApple/Googleの公式仕様） |
| README等の説明文の**内容** | iOSはWi-Fi Directが使えない、という事実 |

## やってはいけないこと

- ソースコードのコピー＆ペースト（一部でも）
- ファイルをそのまま持ち込む
- ベンダーAAR / framework の同梱
- 変数名・関数構成までそっくりな写経

---

## この方針が費用と工数に与える影響

- **工数**: 増えます。BLEとWi-Fi転送を自前で書くぶん、Phase 1-B / 1-C が伸びます（見積もりに反映済み）
- **費用**: 増えません。0円のまま
- **リスク**: **大幅に下がります**。ライセンス違反でアプリを取り下げる事態を避けられます
- **代替案**: どうしても再利用したい場合は、各リポジトリの作者へ連絡してライセンス許諾を得る道があります（JINさんの判断事項）
