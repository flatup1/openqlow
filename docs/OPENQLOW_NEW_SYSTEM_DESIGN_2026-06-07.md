# openQLOW New System Design 2026-06-07

> この文書は、openQLOWを「毎朝のLINE日報」「投稿承認」「VPS監視」を中心に作り直すための正本です。
> 他AIは、まずこの文書を読んでから実装・提案してください。

---

## 1. 結論

openQLOWは、FLATUP GYMオーナー向けの「攻めの記録・投稿・経営補佐AI」です。

新システムでは、難しいコマンドや一問一答を減らし、以下の3つだけで毎日使える状態を目指します。

```text
日報
投稿
ok
```

一番大切な考え方はこれです。

```text
Jinが雑に送っても、openQLOWが整理する。
危ない操作だけ、人間確認で止める。
VPSはMonitorが見張る。
```

---

## 2. なぜ作り直すのか

旧openQLOWには、次の問題がありました。

```text
質問が多すぎる
返信方法に毎回迷う
一問一答が面倒
okだけで通らない場面がある
No approval command found が出て不安になる
日報保存だけしたいのに投稿候補が勝手に出る
VPSが落ちた時に人間が気づくまで止まる
```

Jinが本当にやりたいことは、もっとシンプルです。

```text
単純に業務日報を一番簡単に残したい
必要な時だけ投稿候補を作りたい
VPSが落ちたら自動で戻ってほしい
```

---

## 3. 新システムの全体像

```text
LINE
  ↓
openQLOW webhook
  ↓
Command Router
  ↓
Daily Report / Post Candidate / Approval
  ↓
Obsidian + state files

VPS Monitor
  ↓
systemd self-heal
  ↓
openqlow-webhook.service を復旧
```

役割分担は以下です。

| 役割 | 担当 |
|---|---|
| お客様対応 | AIKA |
| オーナーの日報記録 | openQLOW |
| SNS投稿候補作成 | openQLOW |
| 最終投稿判断 | Jin |
| VPS監視 | openQLOW Monitor |
| 危険操作の承認 | Jin |

---

## 4. LINE日報の新仕様

### 4.1 Jinが送る言葉

```text
日報
```

または、いきなり日報本文を送ってもよい。

```text
体験ひかりちゃん1名 入会予定あり 今日やること 広告を打つ
```

### 4.2 openQLOWが返す文

```text
おはようございます。
昨日のFLATUPを1通で送ってください。

例：
体験 ひかりちゃん1名
入会予定あり
気になる会員 森田さん
口コミ レディースと全会員
今日やること 広告を打つ

「なし」だけでもOKです。
```

### 4.3 保存後の返信

```text
保存しました。

（新規ファイル）

今日やること:
1. 今日のタスク: 広告を打つ
2. 口コミ依頼: レディースと全会員
3. 気になる会員ケア: 森田さん

投稿候補を作るなら「投稿」
修正するなら「修正: 内容」
```

### 4.4 重要ルール

日報を保存しただけでは、投稿候補を自動生成しません。

投稿候補を作りたい時だけ、Jinがこう送ります。

```text
投稿
```

---

## 5. 日報パーサーの考え方

Jinはきれいなフォーマットで送らなくてよい。

対応する入力例:

```text
なし
```

```text
体験なし 入会なし 今日やること システム完成
```

```text
ok 体験ひかりちゃん1名 入会予定あり 今日やること 広告を打つ
```

```text
1. 昨日の体験： ひかりちゃん2. 入会： 1 3. 入会迷ってる人： バク4. 返信・フォローが必要な人：
```

保存項目は以下です。

| key | 意味 |
|---|---|
| `trial_yesterday` | 昨日の体験 |
| `enrollment_yesterday` | 入会 |
| `enrollment_considering` | 入会迷い |
| `followup_needed` | 返信・フォロー |
| `review_request_candidate` | 口コミ候補 |
| `retention_risk` | 休みがち・退会リスク |
| `concerning_member` | 気になる会員 |
| `today_top_task` | 今日やること |

---

## 6. 投稿候補の新仕様

### 6.1 Jinが送る

```text
投稿
```

### 6.2 openQLOWが返す

```text
投稿候補です。

{{投稿本文}}

投稿準備するなら「ok」
やめるなら「やめる」
```

### 6.3 Jinが承認する

```text
ok
```

### 6.4 安全ルール

`ok` は投稿準備の承認です。

以下は勝手に実行しません。

```text
最終投稿ボタン
お客様へのLINE送信
料金判断
返金判断
退会処理
ファイル削除
DB操作
課金操作
```

---

## 7. No approval command found の扱い

旧システムでは、日報っぽい文章を送っても承認コマンドとして読めないと、以下が出ていました。

```text
No approval command found
```

新システムでは、これをユーザーに出さない方向にします。

読めない入力には、こう返します。

```text
受け取りました。
日報として残すなら、体験・入会・口コミ・今日やることを1通で送ってください。
例: 体験ひかりちゃん1名 入会予定 今日やること広告
投稿候補を作るなら「投稿」と送ってください。
```

---

## 8. VPS Monitor の新仕様

### 8.1 目的

VPSでopenQLOWが落ちた時、人間が気づく前にMonitorが復旧する。

### 8.2 対象

現在の対象はこれだけです。

```text
openqlow-webhook.service
```

### 8.3 流れ

```text
openqlow-monitor.timer
↓
openqlow-monitor.service
↓
npm run monitor
↓
openqlow-webhook.service の状態を見る
↓
落ちていたら restart
↓
LINE webhook が HTTP 200 になるまで待つ
↓
ALL GREEN
```

### 8.4 実機確認ログ

```text
✅ ALL GREEN
✅ openrouter models endpoint 200
✅ systemd_self_heal openqlow-webhook.service: restart (restarted and active)
✅ line_webhook webhook 200 after 5/8
```

---

## 9. Monitor の安全設計

自動再起動できるサービス名は、以下に限定します。

```text
openqlow-*.service
```

コード上の制限:

```ts
/^openqlow-[a-z0-9-]+\.service$/
```

以下は自動操作しません。

```text
mysql.service
nginx.service
docker.service
DB
投稿ボタン
ファイル削除
課金
他システム
```

---

## 10. systemd 設定

`deploy/systemd/openqlow-monitor.service` は root で実行します。

理由:

```text
systemctl restart openqlow-webhook.service
```

を実行するため。

ただし、コード側で `openqlow-*.service` 以外はブロックします。

設定:

```ini
Environment=OPENQLOW_MONITOR_SYSTEMD=true
Environment=OPENQLOW_MONITOR_SELF_HEAL=true
Environment=OPENQLOW_MONITOR_SERVICES=openqlow-webhook.service
```

---

## 11. 現在のコミット

```text
f7e38b8 feat: simplify LINE daily report flow
3c97962 feat: add VPS self-healing monitor
```

---

## 12. 検証済みコマンド

ローカル:

```bash
npm test
```

VPS:

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'cd /opt/openqlow && npm run typecheck && npm run test:monitor-self-heal && npm run test:monitor-healthcheck-plan'
```

VPS状態確認:

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'systemctl is-active openqlow-webhook.service; systemctl is-active openqlow-monitor.timer'
```

---

## 13. 今後の再構築方針

新システムとして作り直すなら、以下の順番にしてください。

```text
Phase 1: Core Router
LINE入力を「日報」「投稿」「ok」「やめる」「修正」に集約する。

Phase 2: Daily Report
1通自由文をObsidianに保存する。
質問は増やさない。

Phase 3: Post Candidate
投稿と言われた時だけ候補を1つ作る。
okで投稿準備。
最終投稿は人間確認。

Phase 4: Monitor
VPSのwebhookを見張る。
落ちたら安全範囲だけ自動復旧。

Phase 5: Review Loop
日報ログから週次で「体験・入会・口コミ・離脱リスク」をまとめる。
```

---

## 14. やらないこと

新システムでは、最初から以下を入れない。

```text
完全自動投稿
お客様への自動LINE送信
GitHub Issuesの自動変更
大量の選択肢
毎朝3件の巨大投稿候補
一問一答の強制
```

---

## 15. 中学生向けの使い方

毎朝はこれだけ。

```text
日報
```

または、いきなりこれ。

```text
体験なし 入会なし 今日やること 広告を打つ
```

投稿したい時だけこれ。

```text
投稿
```

良ければこれ。

```text
ok
```

やめる時はこれ。

```text
やめる
```

---

## 16. 他AIへの注意

このシステムの目的は「AIが何でも勝手にやること」ではありません。

目的はこれです。

```text
Jinの入力を楽にする。
記録漏れを減らす。
投稿準備を速くする。
VPS停止を自動復旧する。
危険操作だけ止める。
```

`go`、`RUN`、`ok` は、危険操作の無制限許可ではありません。

本番投稿、顧客送信、削除、DB、課金、料金、退会、返金は必ず人間確認してください。

---

## 17. 残っている別作業

以下はこの設計とは別で整理してください。

```text
reminder系
launchd系
brand_knowledge / canon_2026.md
投稿生成ロジックの追加変更
package.jsonに残る別作業差分
```

これらは別コミットに分けること。

---

## 18. 最終定義

openQLOW新システムとは、

```text
JinがLINEで雑に送った日々の記録を、
FLATUP GYMの営業・投稿・経営改善につながる形に整理し、
VPS上で止まりにくく動く、
攻めの記録・投稿・経営補佐AI。
```

