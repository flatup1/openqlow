# Volume 1 — Vision Book

Version: 1.0.0-design
Status: Proposed design baseline
Owner: JIN
Architect: Codex
Implementer: Claude Code

## 1. Mission

世界一初心者に優しい格闘技ジムの思想を守りながら、人の感情を動かすコンテンツを最短・最速・最低工数・最安コストで生み出し、実際の反応から学び続けるBrand Growth OSを構築する。

動画生成は目的ではない。動画、静止画、文章、Web、LINEは、顧客が安心して最初の一歩を選ぶための手段である。

## 2. North Star

最上位成果は体験予約と入会である。

ただし、短期転換のためにブランド、信頼、安全、子どもの尊厳を損なってはならない。成果は次の二条件を同時に満たした時だけ成功とする。

1. 視聴者が安心、希望、勇気、共感、所属感のいずれかを受け取った。
2. その結果としてプロフィール訪問、LINE追加、相談、体験予約、入会のいずれかが前進した。

## 3. 顧客が主人公

FLATUP GYMは主人公ではない。

- 主人公: 挑戦したいが怖い人、子ども、保護者、初心者
- FLATUPの役割: 安全な場所、ガイド、仲間、挑戦の舞台
- 敵: 他ジムではなく、怖さ、孤立、比較、自己否定
- 変化: 強く見せることではなく、自分にもできると思えること

## 4. Emotional Architecture

### Story

視聴者の現在、迷い、小さな一歩、支援、Hero Moment、余韻を描く。ジムの設備説明から始めない。

### Psychology

使用してよい主なトリガー:

- 安心
- 自己効力感
- 共感
- 所属感
- 成長
- 好奇心
- 達成感
- 愛情
- 親子の絆

使用しないトリガー:

- 恐怖
- 罪悪感
- 体型否定
- 社会的不安
- 排除
- 期限による焦り
- 子どもの搾取

### Worldview

- 格闘技は怖い人だけのものではない。
- 初心者でも、運動が苦手でもいい。
- 強さは人を傷つける力ではない。
- 強い人ほど優しくなれる。
- 一歩踏み出した人を誰も笑わない。

## 5. 二層構造

Kids関連では必須とする。

| 層 | 受け取る価値 |
| --- | --- |
| 子ども | 面白い、かわいい、冒険、動き、真似したい、次が気になる |
| 保護者 | 安心、礼儀、成長、自信、仲間、否定しない教育、未来への投資 |

二層を説明文で詰め込まず、子どもには表の出来事、親には視線、距離、姿勢、声掛け、見守る動作で伝える。

## 6. Hero Moment

すべてのコンテンツは記憶に残す一場面を一つだけ持つ。

Hero Momentは派手な技とは限らない。緊張していた人が笑う、コーチが子どもの目線まで膝をつく、親子がグローブを合わせる、仲間が拍手する等、感情が視覚化された瞬間を選ぶ。

## 7. User Value

オーナーは次の程度の入力だけでよい。

    女性向け。この写真。15秒。体験につなげたい。

OSは残りを補う。

- Target
- Objective
- Emotional Goal
- Story
- Hero Moment
- Camera
- Motion
- Lighting
- Sound
- Preservation
- Negative
- CTA
- Platform format
- Provider-ready Prompt

分からない項目を毎回質問しない。安全や費用に影響しない項目は、過去データと既定値から補完し、assumptionsとして表示する。

## 8. Success Metrics

KPI Tree:

    入会
      ↑
    体験参加
      ↑
    体験予約
      ↑
    LINE追加 / DM / Web訪問
      ↑
    プロフィール訪問
      ↑
    保存 / シェア / コメント
      ↑
    視聴完了
      ↑
    視聴維持
      ↑
    3秒フック
      ↑
    インプレッション

再生数は診断値であり、最終成果ではない。

## 9. Happiness / Emotional Score

AIの事前評価は10軸、各0〜10点、合計100点とする。

- 安心感
- 楽しさ
- 共感
- 希望
- ブランドらしさ
- 記憶性
- 行動したくなる力
- 子どもの視聴継続性
- 親の安心
- 体験意欲

この値はpredicted scoreであり、実測SNS指標ではない。実測値と同じグラフや平均へ混ぜない。AIスコアの妥当性自体も、後から実測との相関で検証する。

## 10. Core Principles

1. Human first: 映像より先に人と感情を見る。
2. Brand before growth: ブランドを損なう成長は失敗。
3. Minimal input: オーナーの入力負担を増やさない。
4. Selective context: 必要なKnowledgeだけを読む。
5. Provider independence: CoreへProvider固有仕様を入れない。
6. Effective cost: 表示単価ではなく採用1本の実質コストを見る。
7. One variable: 実験で同時に多数を変えない。
8. Evidence before truth: 1回の成功を正解にしない。
9. Teach: 学びを次回が読める形にする。
10. Human approval: 根幹変更と外部実行は人間が決める。
11. Reuse first: 一素材を媒体・尺・Hook・CTAへ再利用する。
12. Observable: Prompt、Version、Provider、費用、結果を追跡する。

## 11. Non-goals

- AIKAを作り直すこと
- openQLOWとは別の巨大OSを作ること
- 投稿やLINE送信を無承認で自動化すること
- 全Knowledgeを毎回読むこと
- Provider選定を永久固定すること
- バズだけを目的にすること
- 子どもや初心者の弱さを演出素材として消費すること
- 自律エージェント数を増やすこと
- 既存動画プロジェクトを一括移行すること
- 自動的にBrand Constitutionを変更すること

## 12. Governance

### AIが自動でよい

- 分類
- Brief作成
- Prompt合成
- 品質の事前評価
- コスト試算
- 指標集計
- 仮説・改善案
- Learning candidate作成
- Weekly review draft

### Human Approvalが必要

- 有料生成バッチの開始
- 公開、送信、予約、入会処理
- 料金、規約、法的表現、安全基準
- Brand ConstitutionとAIKA人格
- 主要KPI変更
- Validated Learningへの昇格
- Providerの本番有効化
- 大規模Schema migration
- 本番・VPS・Git mainへの反映

## 13. Think → Create → Measure → Learn → Update → Teach → Repeat

- Think: 対象、悩み、感情、仮説を決める。
- Create: BriefとPromptから素材を作る。
- Measure: 実測と費用を記録する。
- Learn: 何が効いたか、何が不明かを分ける。
- Update: 次回仮説と候補ルールを作る。
- Teach: evidence付きKnowledgeとして残す。
- Repeat: 次の制作は前回より賢い状態から始める。
