# ADR-0001: 技術選定

状態: 採用 / 日付: 2026-08-28 / 決定: Claude Code（JIN承認待ち）

---

## 決定

**Androidネイティブ（Kotlin）を先行させる。転送の心臓部は、Androidに依存しない純Kotlinモジュールに切り出す。**

```
ai-glasses/
  core/      ← 純Kotlin（JVM）。Android非依存。実機なしでテストできる
  android/   ← Androidアプリ。coreを呼ぶ
  ios/       ← 後から。Swiftでcoreと同じ仕様を実装
  docs/      ← 仕様書
```

---

## なぜそうするか

### 1. 要件書がAndroid先行を指示している

> iOSとAndroidを同時に完璧に作ることで遅れる場合は、既存実装が充実しているAndroidで通信仕様を固め、共通化できる部分を整理してからiOSへ展開する（§3）

### 2. どのみち最下層は分かれる

Wi-Fi Direct は Android にしかありません。iOSは `NEHotspotConfiguration` で別方式です。
つまり「1つのコードで両方」は、**一番難しい部分では最初から不可能**です。
共通化できるのは、その上のロジック（一覧解析・重複防止・再開・進捗計算）だけです。

### 3. 純Kotlinモジュールなら、今日からテストできる

この開発環境で実測済みです。

```
java -version   → openjdk 21.0.10
gradle --version → Gradle 8.14.3 / Kotlin 2.0.21
adb             → なし
Android SDK     → なし
swift           → なし
```

Android SDK が無いのでアプリ本体はビルドできませんが、
**Androidに依存しないKotlinコードなら Gradle で単体テストが回ります。**
実機とグラスが手元に来るまでの待ち時間を、ムダにしません。

### 4. 転送の一番こわい部分を先に潰せる

要件書§17の成功指標のうち、次の3つは**実機がなくても検証できます**。

- 同じメディアが意図せず重複保存されない
- 転送中断後も取得済みデータが壊れない
- 転送失敗後にユーザーが迷わず再試行できる（エラー分類の正しさ）

これらは全部 `core` のロジックの話です。実機で試すのは「通信が通るか」だけに絞れます。

---

## 検討して却下した案

### React Native / Flutter（クロスプラットフォーム）

**却下。** 一見「1回書けば両方動く」ので工数が減りそうに見えますが、実際は逆です。

- BLE、Wi-Fi Direct、`NEHotspotConfiguration` は**すべてネイティブ実装が必要**。難所は1つも減りません
- そのうえで「ネイティブとJSの橋渡し」という層が増えます。大きな動画ファイルをこの橋を通すと、メモリ不足の原因になります（要件書§16「ストリーミング方式を使う」に反する）
- 参考にできる情報（CyanBridge）が Kotlin なので、仕様を読み解く手間も増えます

### Kotlin Multiplatform（KMP）で最初から両対応

**却下（ただし将来の選択肢として残す）。**
CyanBridge は KMP を使っているようですが、今の段階では設定の複雑さが工数を押し上げます。
`core` を「Android APIを一切使わない純Kotlin」で書いておけば、**後からKMP化するのは容易**です。
今はその余地だけ残して、先に進みます。

### iOSを先に作る

**却下。** Apple Developer Program が年間約15,000円かかり、MVPが動く前に費用が発生します。
また iOS は Wi-Fi 接続方式が未確認（要件書§5）で、リスクが高い側です。

---

## 具体的な選定

| 層 | 選定 | 理由 |
|---|---|---|
| core 言語 | Kotlin 2.0（JVM） | Android と同じ言語。この環境でテスト可能 |
| core テスト | kotlin.test（Gradle標準） | 追加費用・追加依存なし |
| core の依存 | **原則ゼロ**（JSON解析のみ最小限） | 依存が増えるほどライセンスとメンテのリスクが増える |
| Android UI | Jetpack Compose | 文字サイズ4段階・TalkBack対応が標準機能で作りやすい（要件書§7） |
| Android 最低API | API 29（Android 10） | 要件書§16 |
| HTTP | OkHttp（Apache-2.0） | ストリーミングとRange対応が確実。ライセンスが明確 |
| ローカル保存 | Room または DataStore | 転送キューの永続化。Google公式 |
| iOS | Swift / SwiftUI、iOS 15以上 | 要件書§10・§16 |
| サーバー | **なし** | 要件書§3「不要なサーバーを作らない」 |

**依存ライブラリを選ぶ基準**: Apache-2.0 / MIT / BSD のみ採用。ライセンス不明のものは使いません（`LICENSE_AUDIT.md` の方針）。

---

## 置き場所について（openqlow の中でよいか）

**今は openqlow リポジトリ内の `ai-glasses/` に置きます。** 指定された作業ブランチがこのリポジトリのためです。

ただし、これは本来**別プロジェクト**です（openqlow は FLATUP GYM の経営支援AI）。
そのため次の条件を守っています。

- `ai-glasses/` の外のファイルは、`COORDINATION.md` の担当表への1行追記以外、一切変更しない
- openqlow のコード・テスト・`package.json` に依存しない
- 将来 `git subtree split --prefix=ai-glasses` で単独リポジトリへ切り出せる状態を保つ

**JINさんへの確認事項**: 別リポジトリに分けたい場合はお知らせください。上記の作りなので、いつでも分離できます。
