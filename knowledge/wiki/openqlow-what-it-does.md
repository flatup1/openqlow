---
type: wiki
title: "OPENQLOW でできること（きのう一覧）"
tags: [openqlow, features]
created: 2026-06-24
updated: 2026-06-24
sources:
  - "[[../sources/20260624-openqlow-repo-snapshot]]"
---

# OPENQLOW でできること（きのう一覧）

できることを、にた仕事ごとに**6つのグループ**に分けました。
（カッコの中は、それを動かすときの“呪文”＝コマンドです）

## 1. 📝 ネタ・文章を考える
SNSの投稿ネタや、広告の文を作ってくれます。
- 毎日のアイデアを3つ作る （`npm run daily`）
- 広告の文を作る（女性初心者・キッズ・40代男性 など対象別）（`npm run ad-copy`）
- 作る部品は `src/generators/` にあります → [[openqlow-parts-map]]

## 2. 💬 お客さんへの返事の下書きを書く
LINEやDMに来た質問に、やさしい「AIKA」という口調で返事の下書きを作ります。
- 問い合わせへの返信案 （`npm run inquiry`）
- 体験に来た人へのフォロー4文（お礼／翌日／入会案内／口コミおねがい）（`npm run trial-followup`）
- ※あくまで**下書き**。送るのは人間。

## 3. 🗂️ お客さんの名簿（CRM）を整理する
見込み客（入会しそうな人）を“台帳”に記録して、連絡もれを防ぎます。
- 名簿に登録・一覧・検索・状態の更新 （`npm run crm`）
- 「そろそろ追いかけて連絡したほうがいい人」を見える化
- 1日のまとめ（日報）を作る
- くわしい部品は `src/crm/` → [[openqlow-parts-map]]

## 4. 🌐 ホームページをチェックする
ジムの公式サイトの文章をわたすと、「初心者の女性や、子どもの保護者から見て分かりやすいか」を6つの目線でチェックします。
- サイト改善チェック （`npm run site-audit`）
- ※インターネットから勝手に取りには行かず、保存した文章を見ます。

## 5. ⏰ 決まった時間にじどうで動く
毎朝のあいさつ準備や、リマインド（思い出させ）を自動でやります。
- 朝のブリーフィング （`npm run morning`）／リマインダー （`npm run reminder`）
- 毎日の自動チェック （`npm run daily:check`）
- これらを“目覚まし時計”のように動かす設定が `deploy/systemd/` にあります。

## 6. 🛡️ あぶないことをしないか見張る
ルール違反の投稿や、個人情報のもれを防ぐ見張り役です。
- 安全チェック（`src/safety/`）／個人情報ルール（`src/privacy/`）
- くわしくは → [[openqlow-safety-rules]]

## 関連
- [[openqlow-overview]] — ぜんたい地図
- [[openqlow-parts-map]] — どの部品がどれを担当？
- [[openqlow-safety-rules]] — まもるルール

## 出典
- [[../sources/20260624-openqlow-repo-snapshot]]
