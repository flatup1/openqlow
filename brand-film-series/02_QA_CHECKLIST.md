# シリーズ共通 生成QA・破綻防止チェックリスト（EP09–EP13）

AI生成物は「同じキャラに見えないこと」が最大のリスク。本ファイルは合否判定の基準を数値で定める。

---

## 1. 一貫性アンカー（全プロンプトに必ず含める）

各話の `04_IMAGE_PROMPTS.md` / `05_VIDEO_PROMPTS.md` のプロンプトには、以下 5 要素を**毎回貼る**。省略すると別人になる。

```
1. 頭身      : 2.5 head chibi character
2. 画風      : anime style illustration, flat illustration, Studio Ghibli-like aesthetic
3. 足元      : barefoot
4. グローブ  : red boxing gloves
5. 話別ウェア: <話ごとのカラーブロック指定>
```

### 話別ウェア（変更禁止）

| 話 | キャラ | ウェア |
|---|---|---|
| EP09 | レン | red and white color-block shirt |
| EP09 | ユズキ | navy and yellow color-block shirt |
| EP10 | ハルナ | pink and purple color-block shirt |
| EP10 | コウ | light purple and gray color-block shirt |
| EP11 | ユウ | green and yellow color-block shirt |
| EP11 | ダイ | gray and blue color-block shirt |
| EP12 | レイ | purple and blue color-block shirt |
| EP13 | ミオ | blue and purple color-block shirt |
| EP13 | ノア | yellow and white color-block shirt |

---

## 2. 合否判定基準（数値）

| 項目 | 合格ライン | 測り方 |
|---|---|---|
| 髪型の一致 | 全カットで同一 | 目視 + 基準画像との並置比較 |
| ウェア色のブレ | RGB 各チャンネル **±15 以内** | スポイトで 3 点測定 |
| グローブの赤 | RGB **±10 以内** | 同上 |
| 顔の比率 | 頭身 2.5 ±0.2 | 頭頂〜顎 / 全身高 で計測 |
| 目の大きさ | 顔幅比 ±10% | 目視 + 基準画像比較 |
| 解像度 | 1024×1024 以上（静止画） | ファイル情報 |
| 動画の尺 | 指定尺 **±0.1 秒** | 編集ソフト上で確認 |

**1 つでも外れたら再生成**。手作業のレタッチで合わせようとしない（次カットで再発するため）。

---

## 3. 生成リトライ規則

| 症状 | 対処（この順で試す） |
|---|---|
| 顔が別人 | ① seed 固定 → ② 基準画像を img2img 参照に追加 → ③ 顔の記述語を増やす |
| 靴を履いている | ネガティブに `wearing shoes, sneakers, socks` を追加 |
| 指が多い/歪む | 手を画面外か背後に置く構図へ変更。無理に直さない |
| 3D・実写っぽい | ネガティブに `3D, CGI, photorealistic, octane render` を追加 |
| 大人に見える | ポジティブに `8 years old, child proportions` を明示 |
| 動きが速すぎる | i2v の `animation intensity` を 1 段下げる |
| ループが繋がらない | 始点と終点の表情・光量を同一指定に書き換える |
| 表情が読めない | カメラを 1 段寄せる（wide → medium → close-up） |

**リトライ上限**: 1 カット 5 回。超えたらプロンプトではなく**構図を変える**。

---

## 4. ネガティブプロンプト（全カット共通・省略禁止）

```
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult,
wearing shoes, wearing socks, wearing earrings, long gloves with fingers,
CGI, octane render, illustration inconsistency, low quality,
watermark, text, signature, extra fingers, deformed hands,
violence, aggressive expression, scary atmosphere
```

`violence` 系を必ず入れる理由: 格闘技題材のため、放置すると攻撃的な絵が出る。ブランドと真逆になる。

---

## 5. カット別チェック（生成直後に実施）

### 静止画

- [ ] 一貫性アンカー 5 要素がすべて反映されている
- [ ] ウェア色が話別指定どおり（RGB 実測）
- [ ] 裸足になっている
- [ ] グローブが赤（両手とも）
- [ ] 星型フロアが見える（ジムのシーンのみ）
- [ ] 表情が指定の感情と一致している
- [ ] 文字・ウォーターマークが写り込んでいない
- [ ] 攻撃的・怖い印象になっていない

### 動画（i2v）

- [ ] 静止画からキャラの顔が変わっていない
- [ ] 指定の動作量（intensity）と一致している
- [ ] 照明遷移が心理変化と対応している
- [ ] 尺が指定 ±0.1 秒以内
- [ ] ループ指定カットが seamless（始点＝終点）
- [ ] 手足の破綻フレームがない（コマ送りで確認）

---

## 6. 話別・重点チェック

| 話 | 特に注意する点 |
|---|---|
| EP09 | ユズキの「見えない痛み」が笑顔と同一フレームで両立しているか。核 C06-B が「怒り」でなく「静かな決意」か |
| EP10 | コウの疲労が S1 で最大、S6 で回復している段階差が見えるか。ミット保持の腕の震え |
| EP11 | ダイが「かわいそうな子」になっていないか。ユウの躊躇が「冷たさ」に見えていないか |
| EP12 | **C09 で着地を絶対に描かない**。成功・失敗が判別できるフレームが 1 枚もないこと |
| EP13 | ノアが「嫌味な天才」に見えていないか。C01（ぎこちない）と C07（滑らか）の差が視認できるか |

---

## 7. シリーズ横断チェック（全話生成後）

- [ ] 5 話を連続再生して、同一シリーズに見えるか
- [ ] マスコット（フラットちゃん・サンドバッグ・ミット）の姿が全話で同一か
- [ ] ジムの内装（星型フロア・ロゴ位置・窓）が全話で同一か
- [ ] 夜のジムの月光の色が全話で揃っているか
- [ ] エンドカードの体裁が全話同一か（最終行の固定文言含む）
- [ ] 各話の核ショットが「その話にしかない光」を持っているか

---

## 8. 公開前の最終ゲート（人間承認）

以下すべてに ✅ が付くまで公開しない。

- [ ] 禁止表現リスト（`00_SERIES_MASTER_CONTEXT.md` §3）に抵触していない
- [ ] 料金・持ち物が映像内に出ていない
- [ ] タグライン表記が `canon.ts` と一致
- [ ] 実在の会員・子どもが写っていない
- [ ] 保護者が見て不安を煽られないか、第三者 1 名の確認済み
- [ ] オーナー（JIN）承認

---

*不合格の素材も削除せず保管する。次話・HP転用の素材になる。*
