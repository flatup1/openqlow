# Volume 4 — Operations Book

Version: 1.0.0-design
Audience: JIN, operator, future Claude Code maintainer

## 1. Operating Model

通常運用はスマホ中心とし、JINは一行入力、確認、採否、投稿、最低限の実績入力だけを行う。

OSが引き受ける:

- Target推定
- 感情と物語
- Prompt
- Negative
- Provider適合
- 品質チェック
- 再利用案
- metrics集計
- 仮説と次回案

JINが保持する:

- 有料実行の承認
- 人物・子ども素材の利用判断
- 採用
- 公開
- 料金、規約、安全、ブランド根幹
- Learning昇格

## 2. Daily

### Start

1. 今日のイベント、季節、素材を確認する。
2. Strategic BrainのTOP3候補を見る。
3. 1本だけ選ぶか、短い自由入力を送る。

理想入力:

    女性向け。この写真。15秒。体験につなげたい。

OS response:

- inferred target
- objective
- one emotional goal
- Hero Moment
- assumptions
- cost estimate
- Prompt preview
- approval requirements

### Generate

1. 無料のBrief / Prompt previewを確認。
2. 人物・未成年同意を確認。
3. batch countと予算上限を確認。
4. 有料生成を承認。
5. 出力ごとに採用、却下、保留。
6. 却下理由を1つ以上選ぶ。

却下理由:

- identity
- anatomy
- motion
- temporal
- environment
- logo_text
- brand
- story
- technical
- other

## 3. Before Posting

Checklist:

- Targetが第一項目にある
- Emotional Goalが一つ
- Hero Momentが一つ
- 顧客が主人公
- CTA policyが正しい
- 料金・時間等はcanon由来
- 顔、人数、服装、背景が保たれる
- 子どもの尊厳と同意
- AI生成表示等のplatform要件
- owner approval

## 4. Posting

Creative OSは公開しない。

1. platform variantを作る。
2. existing openQLOW draft adapterへ渡す。
3. JINが最終確認。
4. 既存publish workflowまたはplatform appで公開。
5. PublicationRecordへ実際のposted stateを記録。

draft savedとpostedを必ず分ける。

## 5. After Posting

Metrics windows:

- 24 hours: hookと初期反応
- 72 hours: completion、save、share
- 7 days: profile、LINE、trial
- 28 days: delayed trial、enrollment

入力できない指標はnullのままにする。

最低限:

- views
- 3-second retentionまたは相当値
- average watch
- completion
- saves
- shares
- profile visits
- LINE adds
- trial bookings

体験予約・入会の紐付けが直接できない場合、attribution confidenceをlowとして記録する。

## 6. Weekly AI Coach

実行日: 原則月曜
通知: owner-only

Report:

1. 今週最も成果が良かったもの
2. 最も悪かったもの
3. 共通点
4. 感情面
5. Hook
6. Target
7. 体験予約との関係
8. 学んだこと
9. 次週仮説
10. 次に作るTOP3

さらに必ず表示:

- data completeness
- unknown metrics
- cost per usable
- active experiments
- owner approvals pending

数字が不足している週は、推測でwinnerを決めず、入力すべき数字を最初に示す。

## 7. Monthly Review

1. Target coverage
2. Platform mix
3. Content fatigue
4. effective cost trend
5. trial / enrollment contribution
6. validated learning candidates
7. failed hypotheses
8. stale Knowledge
9. Provider quality / cost
10. next month experiment plan

月次で変える大きな項目は一つまで。Brand Constitution変更は別承認。

## 8. Knowledge Write-back

Write-back先:

- observation
- hypothesis
- validated_learning
- failed_hypothesis
- best_practice
- anti_pattern
- experiment
- prompt_performance
- target_insight

Rules:

- chat本文をそのまま保存しない
- evidence IDを付ける
- PIIを除く
- confidenceとlimitationsを書く
- 1回成功はobservation
- 3回再現と承認でvalidated
- contradictory evidenceでreview_due

## 9. Prompt Maintenance

- Promptを直接大量複製しない。
- Masterまたはmoduleを修正。
- major behavior changeはversion bump。
- old versionを削除せず再現可能にする。
- 成果の悪いPromptはinactiveにするが、実験履歴は残す。

## 10. Provider Operations

Before enable:

- verified capabilities
- current API documentation
- dry-run
- sandbox test
- price estimate
- timeout
- cancellation
- balance/auth error handling
- owner approval

During batch:

- sequential or limited concurrency
- budget cap
- stop on auth/balance
- retry only retryable errors
- every retry is a new attempt

After:

- provider cost
- usable count
- rejection reason
- effective cost

## 11. Human Approval

Approval request format:

    対象:
    実行内容:
    理由:
    費用:
    リスク:
    変更範囲:
    戻し方:

Approvalはscope hashに紐付く。Prompt、batch count、provider、cost上限が変わったら再承認。

## 12. Backup

Repository:

- clean branch
- commit history
- no media binary
- no secret

Runtime metadata:

- append-only event store
- daily local backup
- retention policy
- restore test monthly

Media:

- original assetを保護
- generated assetはcontent IDで紐付け
- duplicate hash
- retention class
- consent removal request対応

Vault:

- 自動大量書込をしない
- approved weekly summaryだけ
- current dirty stateを解消するまではwrite disabled

## 13. Failure Handling

### Provider failure

- categoryを記録
- balance/authはbatch stop
- timeoutは上限内でretry
- outputなしでも費用が発生した場合はcostを残す

### Bad output

- rejectedとして保存
- 原因カテゴリ
- 同じPromptの無限retry禁止
- 2回同原因ならPromptまたはProviderを見直す

### Metrics missing

- 0を入れない
- reportにmissing表示
- causal learningを作らない

### Knowledge conflict

- 両方をPromptへ入れない
- conflict record
- owner decision

### AIKA boundary incident

- Brand Growth job停止
- customer send有無を確認
- AIKA/VPSへ追加変更しない
- JINへ報告

### Secret incident

1. 出力・処理を止める。
2. 値を再表示しない。
3. 対象Provider / serviceを特定。
4. credentialをrotate。
5. logsとhistoryを調査。
6. secret scan。
7. incident ADRまたはrunbook。

## 14. Content Reuse

Master assetから:

- Reel
- TikTok
- Shorts
- Website
- LINE
- Ad
- Thumbnail
- still
- duration variant
- hook variant
- CTA variant

Reuseでも新PublicationRecordを作り、master contentへ紐付ける。同一素材の異なるHookは同一実験内で比較可能。

## 15. Owner Workload Budget

通常1本あたりのJIN操作目標:

1. 一行入力
2. Brief承認
3. paid batch承認
4. clip採否
5. post承認

metricsは週1回まとめて入力できる。詳細設定を毎回開かない。

## 16. Cadence Summary

| Cadence | Task |
| --- | --- |
| daily | one-line request、generate、approve |
| per post | safety、publish approval、record ID |
| 24h / 72h / 7d | metric snapshot |
| weekly | coach、one hypothesis、TOP3 |
| monthly | Knowledge、Provider、cost、fatigue |
| quarterly | Constitution review proposal、schema health、retention |
