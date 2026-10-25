# FLAT UP 調達AI — 海外調達プレイブック

大会備品・販促物を「高品質・最安・納期厳守」で仕入れるための手順書。
メダル専用ではない。Tシャツ、トロフィー、バンテージ、グローブ、ジムの販促物にも同じ手順を使う。

## 結論から

- AIがやるのは **調査・逆算・比較・下書き** まで。
- **発注・支払い・問い合わせの送信は人間**。AIは一切実行しない。
- 納期は「発送日」ではなく **日本の届け先への到着日** で判断する。
- 価格は単価で比べない。**総額（TOTAL LANDED COST）と実質単価** で比べる。

## 使うもの

| 何を | どこ |
|---|---|
| 計算・採点・下書き生成 | `src/sourcing/` |
| CLI | `npm run sourcing -- <コマンド>` |
| 案件ファイル | `docs/sourcing/cases/<案件名>.json` |

```bash
npm run sourcing -- plan      --case docs/sourcing/cases/2026-09-medal.json
npm run sourcing -- keywords  --case docs/sourcing/cases/2026-09-medal.json
npm run sourcing -- template
npm run sourcing -- rfq       --case docs/sourcing/cases/2026-09-medal.json
npm run sourcing -- negotiate --case docs/sourcing/cases/2026-09-medal.json --round 1
npm run sourcing -- confirm   --case docs/sourcing/cases/2026-09-medal.json
npm run sourcing -- compare   --case docs/sourcing/cases/2026-09-medal.json
```

## 手順

### 0. 逆算する（ここを飛ばすと全部無駄になる）

`npm run sourcing -- plan` を最初に回す。
出るのは **最終発注期限**。この日を過ぎていたら、その所要日数では間に合わない。

```
製作日数 ＋ 国際輸送日数 ＋ 通関バッファ ＋ 国内配送バッファ ＋ 安全バッファ
```

判定が「不可能」なら、打つ手は3つしかない。

1. 製作日数の短い業者（rush production 対応）を探す
2. 数量・仕様を落として製作日数を縮める
3. 国内業者に切り替える

「たぶん間に合う」で進めない。

### 1. 調べる（SEARCH / 10社）

`npm run sourcing -- keywords` で英語の検索語を出し、Alibaba を先に見る。
Alibaba で十分な候補が出たら、他サイトは回らない（工数の無駄）。

見るサイトの優先順:
Alibaba → Made-in-China → AliExpress → 1688 → DHgate → 国内OEM

商品ページごとに `npm run sourcing -- template` の形へ写す。
**分からない項目は `null` のまま残す。埋めない。**
未確認は採点で0点になるので、勝手な推測で埋めると順位が壊れる。

### 2. 落とす（FILTER / 5社）

`npm run sourcing -- compare` が自動で足切りする。除外は次の場合だけ。

- MOQ が必要数を超える
- 到着保証日が必着日を過ぎている
- 「保証」ではなく「見込み」の回答
- DHL / FedEx / UPS のいずれも使えない

評価が低い・レビューが少ない・Trade Assurance なし・見積の内訳を出さない、は**除外ではなく減点**として残る。

### 3. 聞く（QUOTE / 3社）

`npm run sourcing -- rfq` で問い合わせ文の下書きを作る。

> **下書きは自動で送られない。送信はオーナーが行う。**

回答が曖昧なら `npm run sourcing -- confirm` で納期だけを再確認する。
値下げは `npm run sourcing -- negotiate --round 1|2|3`（5% → 10% → 15%）。
**納期を犠牲にする値下げは受けない。** 安くて遅いのは失敗。

### 4. 決める（BEST BUY / 1社）

`npm run sourcing -- compare` が100点満点で並べる。

| 項目 | 配点 |
|---|---:|
| 納期確実性 | 35 |
| 品質 | 25 |
| 総額 | 20 |
| デザイン再現性 | 10 |
| 業者信頼度 | 10 |

納期点は必着日からの余裕日数で決まる（4日以上前=35点 / 当日午前=23点 / 遅れ=0点 / 保証なし=0点）。

レポートには 🥇 BEST BUY と 🥈🥉 の控えが出る。1位でも未確認が残っていればそれを書く。
そのうえで **オーナーが発注可否を判断する**。

## ブラウザで調べるときの決まり

- ログイン、支払い情報、カード情報の入力はしない。
- 業者への送信ボタンは押さない（文面は下書きのまま人間へ渡す）。
- 商品ページのURLは案件ファイルに残す。あとで見積と突き合わせるため。
- 参考デザイン画像のアップロードは可。顧客情報・会員情報は載せない。
- スクレイピングは各サイトの利用規約の範囲で行う。大量・高速な自動巡回はしない。

## 数字の扱い

- 為替（`fxRateToJpy`）は **見積を受け取った日のレート** に更新する。
- 関税率（`dutyRatePercent`）は品目の HS コードで変わる。調べた値を入れる。0 のままだと過小に見積もる。
- 関税・消費税の計算は**概算**であって確定額ではない。最終額は通関業者・税関が決める。
- 実質単価は切り上げる。予算内に見せるための切り捨てはしない。

## やらないこと（AGENTS.md の承認ゲート）

- 勝手に購入しない
- 勝手に決済しない
- カード情報を入力しない
- 確認なしで契約しない
- 問い合わせの送信は、オーナーの明示的な許可があるときだけ

判断材料を作るところまでがAIの仕事。実行はオーナーが行う。
