# FLATUPGYM / OPENQLOW / LINE BOT 引き継ぎ正本

> このドキュメントは、Jin が OPENQLOW / FLATUP GYM AI について伝えてきた思想・要件・設計判断・実装状態を整理したものです。
> 次に引き継ぐ AI は、これを正本として読んでください。
>
> 重要: 「思想」「実装済み」「未実装/次にやること」を混ぜないこと。

---

## 1. プロジェクトの目的

Jin は、FLATUP GYM のために **OPENQLOW** を設計・構築したい。

- 既存の FLATUP AI OS / AIKA = 守りのAI
- OPENQLOW = 攻めのAI

OPENQLOW は営業マンではない。FLATUP GYM の理念と空気を、SNS上で自然に伝えるAIである。

---

## 2. FLATUP GYM の中心思想

FLATUP GYM は、千葉県成田市の **世界一優しい格闘技ジム**。

強い人を作るためだけのジムではない。弱い自分と向き合うためのジム。

大切にする価値観:

- 怒鳴らない
- 威圧しない
- 勝ち負けより、挑戦する勇気を大切にする
- 初心者・女性・子ども・保護者が安心できる
- 強い人が偉い世界にしない
- 格闘技を怖いものにしない
- 弱い自分でも、ここならいていいと思える空気を作る

---

## 3. 攻めのAI: OPENQLOW

OPENQLOW は、FLATUP GYM の理念と空気を外の世界に伝えるAI。

やること:

- YouTube Shorts
- Instagram Reels
- TikTok
- Threads
- X
- SNS投稿企画
- ショート動画台本
- 字幕案
- キャプション
- 発信テーマ
- 投稿候補の作成
- 素材の見せ方
- ブランドの空気づくり

やらないこと:

- 強引な営業
- DM営業
- 「体験に来てください」
- 「LINE登録してください」
- 「今だけ」「無料」「限定」
- コンプレックスを煽る投稿
- 強さ自慢
- 根性論
- 怖い格闘技ジム感を出す投稿

見た人に感じてほしいこと:

```text
なんかこのジム、怖くなさそう。
ここにいる人たち、幸せそう。
格闘技って、強い人だけのものじゃないんだ。
弱い自分でも、ここならいていい気がする。
この空気、ちょっと好きかも。
```

---

## 4. 守りのAI: FLATUP LINE BOT / AIKA

既存の FLATUP LINE BOT は守りのAI。

役割:

- SNSを見てLINEに来た人を丁寧に受ける
- 不安を減らす
- 初心者でも大丈夫だと伝える
- 体験の流れを説明する
- 質問に答える
- 必要なら人間に引き継ぐ
- 体験予約へ自然に誘導する

全体構造:

```text
SNS / Shorts / Threads / TikTok / Instagram / YouTube
        ↓
OPENQLOW が理念と空気を伝える
        ↓
興味を持った人が自発的に LINE へ来る
        ↓
FLATUP LINE BOT が丁寧に受ける
        ↓
体験 / 見学 / 相談へつなぐ
```

---

## 5. 自動化と承認モデル

基本方針:

```text
安全領域は自動。
危険領域は人間承認。
```

OPENQLOW は、SNSに直接投稿しない。

Jin に LINE で確認し、承認されたものだけ次へ進める。承認後も原則は **下書き保存まで**。

承認文法:

```text
OK FG-20260518-001
修正 FG-20260518-001: コメント
× FG-20260518-001
やめる FG-20260518-001
```

---

## 6. LINE連携

OPENQLOW は LINE とつなげる。LINE は OPENQLOW の中核。

既存の FLATUP公式LINEとは分け、OPENQLOW専用LINE公式アカウントを作る。

OPENQLOW専用LINEで扱うもの:

- 承認依頼
- 修正指示
- 却下
- 下書き保存の実行指示

---

## 7. プラットフォーム方針

| 領域 | 方針 |
|---|---|
| 体験 → 予約ループ | 既存システム完成済み。OPENQLOWでは触らない |
| X | Typefully経由で下書き保存 |
| Instagram | 下書きDB保存。公開は手動 |
| Threads | 下書きDB保存 |
| YouTube | 直接投稿しない。タイトル・概要欄・Shortsメタデータ下書きまで |
| TikTok | MVPではやらない。Phase 3以降 |
| LINE VOOM | MVPではやらない。Phase 3以降 |
| 試合動画切り抜き | Phase 2で実装 |
| MMAネタ自動生成 | 1日3ネタ |
| 自動投稿API | 使わない |
| Typefully schedule API | 呼ばない。draftのみ |

---

## 8. リスク最小化設計

### 第1層: 危ない行為をしない

- SNSに直接投稿しない
- Typefully schedule APIを呼ばない
- Instagram / Threads APIは最初使わない
- YouTubeも投稿しない

### 第2層: 失敗前に確認する

```text
生成
  ↓
自動安全チェック
  ↓
LINE通知
  ↓
Jin承認
  ↓
下書き保存
```

### 第3層: 壊れた時の被害最小化

- logs と Obsidian に記録
- 投稿IDを付ける
- 二重処理を避ける
- 承認は冪等にする

---

## 9. ブランド禁止ルール

OPENQLOW は以下を禁止する。

- 弱さを笑いものにしない
- 会員を素材扱いしない
- 体型コンプレックスを煽らない
- 格闘技の恐怖で釣らない
- 「変われない人」扱いしない
- 努力不足を責めない
- 強さ自慢に寄せすぎない
- 医療・治療効果を断定しない
- ビフォーアフター煽りにしない
- 「本気の人だけ来い」系にしない
- 営業CTAを使わない

---

## 10. 優しさスコア

5軸、各0〜5点、合計25点。

| 軸 | 内容 |
|---|---|
| notScary | 怖く見えないか |
| beginnerFriendly | 初心者が入りやすいか |
| noShameOrPressure | 人を傷つけないか |
| memberDignity | 会員の尊厳を守っているか |
| flatupLike | FLATUPらしいか |

判定:

| 点数 | 判定 |
|---|---|
| 22〜25 | strong |
| 18〜21 | revise_lightly |
| 12〜17 | revise_before_showing |
| 〜11 | reject |

---

## 11. MMAネタ方針

MMAネタはやる。ただし、単なる格闘技ニュース速報にはしない。

必ずFLATUPの価値観に接続する。

- 初心者に何を伝えるか
- 女性に何を伝えるか
- 子ども・保護者に何を伝えるか
- FLATUPの安全思想にどうつながるか
- 挑戦する勇気にどうつながるか
- 世界一優しい格闘技ジムにどうつながるか

---

## 12. 実装済み状態(2026-05-19 時点)

### コード上で確認できるもの

- `openqlow/` 新規プロジェクト(TypeScript, ES Modules)
- 毎朝3ネタ生成(`src/scheduler/daily.ts` → `runDaily()`)
- MMA/value-driven topic generation(`src/generators/mma_topic.ts`)
- X / Instagram / Threads への下書き展開(`src/distribution/expand.ts`)
- 3層安全チェック(`src/safety/check.ts`)
- 優しさスコア5軸採点(`src/safety/check.ts` の `calculateKindnessScore`)
- 投稿ID `FG-YYYYMMDD-NNN` 採番
- LINE承認メッセージ形式(`src/approval/message.ts`)
- 承認・却下・修正のCLIコマンド(`approve` / `reject` / `revise`)
- 承認後の動作:
  - X / Instagram / Threads のローカル下書き保存
  - Obsidian Vault へのミラー(`src/adapters/vault_mirror.ts`)
  - 承認ログ追記(`src/adapters/vault_log.ts` → `logApproval` / `logRejection` / `logRevision`)
  - Vault 登録イベント(`src/adapters/vault_register.ts` → `registerApprovalEvent` / `registerDraftSave` / `registerPerformancePlaceholder`)
- `30_INBOX/openqlow/` からの生ネタ読み込み(`src/sources/obsidian_inbox.ts`)
- `flatup-ai-os/src/data/` のブランド知識読み込み(`src/sources/brand_knowledge.ts`)
- 正本マップ読み取り(`src/sources/canon_map.ts` → `parseCanonMap` / `selectCanonReferences` / `resolveCanonPath`)
- LINE Push 通知の本番結線(`src/line_bot/notifier.ts` → `pushLineMessage` / `pushApprovalNotification` / `pushAlert`)
- 死活監視(`src/monitor/healthcheck.ts` → OpenRouter / LINE webhook / ngrok / launchd の4チェック並列、異常時 LINE Alert)
- launchd plist 3種(daily / serve / monitor)
- `npm run test` テスト全通過(typecheck + safety + approval + state + canon + vault_register)
- `state/<record-id>.json` 状態保存
- 状態遷移: `pending_approval` → `approved` / `rejected` / `needs_revision` / `saved`

### 環境設定で確認済み(コード外)

- macOS sleep 抑止(`pmset -a sleep 0` 等、Amphetamine セッション)
- LINE Official Account Manager(MOLTBOT @817nsdhr)
  - チャット ON / あいさつメッセージ OFF / Webhook ON
  - 応答時間内 = 手動チャット(競合する自動応答なし)
- LINE Developers Messaging API
  - 応答メッセージ「無効」/ あいさつメッセージ「無効」

### 検証コマンド

```bash
cd "/Users/jin/Desktop/OPENQLOW HelMES/openqlow"
npm run test
npm run daily
npm run dev -- approve FG-20260518-001 "OK FG-20260518-001"
npm run dev -- reject  FG-20260518-002 "今日は出さない"
npm run dev -- revise  FG-20260518-003 "もっと初心者向けに"
npm run monitor
```

---

## 13. 未実装 / 次にやること

### Jin の手で必要(コード側は完成)

- LINE Developers の **Webhook URL** に OPENQLOW の外部公開URL(ngrok / Cloudflare Tunnel)を入れる
- **チャネルアクセストークン(長期)** を発行して `.env` の `LINE_CHANNEL_ACCESS_TOKEN` にコピー
- Jin の LINE userId を `.env` の `JIN_LINE_USER_ID` にコピー
- launchd plist 3種を `~/Library/LaunchAgents/` にインストール + `launchctl load`

これらが揃った時点で、毎朝8:00に Push通知が飛び、LINE 上で承認/修正/却下が動く。

### 別セッションで扱う(本番影響あり)

- 守りのAI(既存 FLATUP LINE BOT)の応答方針プロンプト固定
- `line_webhook.py` / `closed_mode.py` の差分整理

### Phase 2(これから設計)

- 試合動画切り抜きエンジン(yt-dlp + ffmpeg + 区切り検出 + 解説生成)
- 媒体別差別化(Shorts / TikTok / Instagram / Threads の特性を反映)
- 素材管理台帳 + 使用許可チェック

### Phase 3(運用してから)

- 反応分析(30投稿たまったら)
- 改善ループ
- Instagram Graph API
- TikTok
- LINE VOOM
- ClawX / Codex 常駐エージェント強化
- YouTube メタデータ自動下書き強化

### 観察期(まず1〜2週間)

- 優しさスコア 18 以上で通過しているか
- 営業CTAの混入が0件か
- 朝の承認 1分以内で終わるか
- 誤投稿/規約違反/BANが0件か

---

## 14. Phase 2

試合動画切り抜きエンジン。

```text
1. YouTube動画ダウンロード
2. 試合区切り検出
3. 1試合ずつ切り出し
4. SNS用素材化
5. LINE承認
6. 公開素材として保存
```

使用候補:

- yt-dlp
- ffmpeg
- YouTube Live archive
- LINE承認
- AIKAボイス風の解説文

---

## 15. Phase 3

- 反応分析
- 30投稿後の改善ループ
- Instagram Graph API
- TikTok
- LINE VOOM
- ClawX / Codex 常駐エージェント強化
- YouTubeメタデータ自動下書き強化

---

## 16. コード配置

```text
/Users/jin/Desktop/OPENQLOW HelMES/
├── flatup-ai-os/
│   └── 既存AIKA下書きエンジン
│
└── openqlow/
    ├── README.md
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── config.ts
    │   ├── types.ts
    │   ├── scheduler/daily.ts
    │   ├── generators/
    │   ├── sources/
    │   ├── distribution/
    │   ├── safety/
    │   ├── approval/
    │   ├── adapters/
    │   ├── state/
    │   ├── line_bot/
    │   ├── monitor/
    │   └── utils/
    ├── drafts/
    ├── state/
    └── logs/
```

---

## 17. 最終定義

OPENQLOWとは、

> FLATUP GYM の理念と空気を外の世界に伝えるAI。

営業しない。押し売りしない。怖くしない。弱さを笑わない。会員を素材扱いしない。

ただ、最高に楽しくて優しくて、通っているみんなが幸せそうなジムの姿を考え抜いて発信する。

最終目標:

> FLATUP GYM の「世界一優しい格闘技ジム」という思想を、SNS上で自然に伝わる状態にする。
