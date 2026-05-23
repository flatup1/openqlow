# FLATUPGYM / OPENQLOW / LINE BOT — Jinが伝えてきたことの完全記録 (v3)

> このドキュメントは、Jin が OPENQLOW / FLATUP GYM AI の設計について伝えてきた発言・判断・評価を、漏らさず対話式に整理したものです。次に引き継ぐ AI はこれを正本として読んでください。
>
> 最終更新: 2026-05-19
>
> 注意:
> 思想・仕様・実装状態・運用確認状態を混同しないこと。特に「完了」は、コード実装完了・本番結線完了・運用確認完了を分けて扱うこと。

---

## 1. このプロジェクトで作りたいもの

**Q. ベースは何ですか?**

> 私が作ったFLATUP AIシステムを使って OPENqlow(を作る)

**Q. OPENQLOW で何をしたい?**

> OPENQLOWの設計/構築

**Q. OPENQLOWの正体は、最初から決まっていましたか?**

> まず話して決めたい

---

## 2. ジムの定義(全体の中心)

> 当ジムの定義は世界一優しい格闘技ジムです。
> 強い人を作るためのジムではなく、弱い自分と向き合うためのジムです。

FLATUP GYM は、強さを誇示する場所ではなく、弱い自分を責めずに向き合える場所。  
格闘技を怖いものではなく、自分を少し好きになるための体験として伝えたい。

### 価値観

- 怒鳴らない
- 威圧しない
- 勝ち負けより、挑戦する勇気を大切にする
- 初心者・女性・子ども・保護者が安心できる
- 強い人が偉い世界にしない
- 世界一やさしい格闘技ジム
- 体験希望者は公式LINEから連絡してもらう

### 使いたい基本投稿文(固定テンプレ)

```text
FLATUP GYMは、千葉県成田市の「世界一優しい格闘技ジム」です。

キックボクシング・柔術・キッズクラスを中心に、初心者・女性・お子さまでも安心して通えるジムを目指しています。

怒鳴らない。
威圧しない。
勝ち負けより、挑戦する勇気を大切にする。

体験をご希望の方は、公式LINEからお気軽にご連絡ください。

#成田市 #キックボクシング #格闘技 #キッズ習い事 #初心者歓迎 #女性も安心 #FLATUPGYM #UIZIN
```

補足: OPENQLOW v2以降の「攻めのAI」投稿では、営業CTAを原則入れない。上記テンプレはブランド定義・守り導線・公式紹介用として扱う。

---

## 3. 攻めのAI(OPENQLOW) — 役割定義

**Q. OPENQLOW を作る一番の動機は?**

> AIが勝手に稼ぐ仕組みを作る

ただし、その後の対話で重要な転換があった。

> 攻めのAIはただただ自分のジムの理念を最大限に伝えようとすることにのみ情熱を注いでください。
> 営業はしなくていいです。
> よかったら来てくださいとか言わないでいい。
> ただただうちのジムは最高に楽しくて優しくて通っているみんなが幸せそうな動画や宣伝を考えて設計してください。

つまり、攻めの AI は**営業マンではない**。**ブランド空気翻訳機**である。

### やること

- YouTube Shorts
- Instagram Reels
- TikTok
- Threads
- SNS投稿企画
- ショート動画台本
- 字幕案
- キャプション
- 発信テーマ
- 投稿候補の作成
- 素材の見せ方
- ブランドの空気づくり

### やらないこと

- 強引な営業
- DM営業
- 「体験に来てください」
- 「LINE登録してください」
- 「今だけ」「無料」「限定」
- コンプレックスを煽る投稿
- 強さ自慢
- 根性論
- 怖い格闘技ジム感を出す投稿

### 目標(見た人が感じてほしいこと)

```text
なんかこのジム、怖くなさそう。
ここにいる人たち、幸せそう。
格闘技って、強い人だけのものじゃないんだ。
弱い自分でも、ここならいていい気がする。
この空気、ちょっと好きかも。
```

---

## 4. 守りのAI(既存 FLATUP LINE BOT) — 役割定義

> 既存のFLATUPGYMのLINE BOTで丁寧に体験の誘導で呼び込みに使う。
> 守りのAIにします。

役割:

- SNSなどを見てLINEに来た人を丁寧に受ける
- 不安を減らす
- 初心者でも大丈夫だと伝える
- 体験の流れを説明する
- 質問に答える
- 必要なら人間に引き継ぐ
- 体験予約へ自然に誘導する

**攻めの AI と守りの AI は分ける。**

### 全体構造

```text
SNS / ショート動画 / Threads / TikTok / Instagram / YouTube
        ↓
OPENQLOW が理念と空気を伝える(営業しない)
        ↓
興味を持った人が自発的に LINE へ来る
        ↓
FLATUP LINE BOT(守りのAI)が丁寧に受ける
        ↓
体験 / 見学 / 相談へつなぐ
```

---

## 5. 自律レベルと承認モデル

**Q. どこまで AI に任せる?**

> 安全領域は自動、危険領域は人間承認

**Q. リスク0は目指す?**

> 自動化して私の代わりに営業してお客さんを取ってきてほしい
> 必ず失敗が起きる前に確認を取る設計を入れるか、そもそも危ない行為をしない設計、できる限りリスク0に近づける

正確には「リスク最小化設計」。

**Q. 承認の流れは?**

> 全てが自動で回るように設計し、最終的に重要な判断は私にLINEで質問するようにして、これやる?と質問して私が承認したらSNSに投稿するような機能にして。

> その都度LINEで質問してほしい。私が回答し承認するとRUN。

実装上は、初期段階では「投稿」ではなく「下書き保存」まで。外部公開は別途 Phase で明示承認する。

**Q. OPENQLOW と LINE はつなげる?**

> openqlowはLINEと繋げる?(Yes として確定)

---

## 6. プラットフォームの判断

**Q. 初期ループは?**

> SNS自動投稿→集客ループ

**Q. 最初に動かす SNS は?**

> X(Typefully経由、既に接続済み)

**Q. 後で何を足したい?**

> 格闘技のネタを自動生成して一日3ネタ作る
> INSTAGRAM(と)スレッズとも連携したい

**Q. YouTube は?**

> YOUTUBELIVE(YouTube Live アーカイブ)に試合の動画があるので 1試合ずつ切り分けて試合を SNS で発信

**Q. 体験予約フローは?**

> 体験からの予約ループはもう完成しています(=既存システムで完結、OPENQLOWは触らない)

---

## 7. インフラ・動作環境

**Q. どこで動かす?**

> JinさんのMacのローカルcron・launchd

**Q. ClawX の位置づけは?**

> ClawXを土台として使う
> 最初はJinのMacローカルで動かす
> 将来的に必要になったらVPSや常時稼働環境も検討するが、最初はMacで構築する

**Q. 承認チャネルは?**

> LINE(Jinさん専用の新しいLINE公式アカウントを作る)

実体は **MOLTBOT @817nsdhr** という公式アカウント。OPENQLOW 専用 LINE では、以下だけを扱う:

- 承認依頼
- 修正指示
- 却下
- 下書き保存の実行指示

**Q. Mac の蓋を閉じてもWiFiテザリングを維持したい(運用前提)**

Amphetamine + pmset 設定 + クラムシェル条件(電源アダプタ+外部入力)で構成。`PreventSystemSleep` を立てる。

**Q. 生ネタの投入経路は?**

> Obsidian Vaultの特定フォルダに置く

具体的には `30_INBOX/openqlow/` の `.md` `.txt`。OPENQLOW の朝のジェネレーターが優先採用する。

---

## 8. 承認ルール(LINE 返信文法)

OPENQLOW は SNS に直接投稿しない。Jin が LINE で `OK` と返信したものだけ次に進む。`OK` の後も**直接公開ではなく、下書き保存まで**。

| 返信 | 動作 |
|------|------|
| `OK FG-20260518-001` | 承認。X は Typefully 下書き、Instagram / Threads は下書きDB保存 |
| `修正 FG-20260518-001: コメント` | 修正指示。状態を `needs_revision` にし、修正ログを残す |
| `× FG-20260518-001` / `やめる FG-20260518-001` | 却下。状態を `rejected` にし、却下ログを残す |

```text
投稿ID: FG-20260518-001
承認する場合: OK FG-20260518-001
```

---

## 9. やる/やらない一覧

| 領域 | 方針 |
|------|------|
| 体験 → 予約ループ | 既存システム完成済み。OPENQLOWでは触らない |
| X / Twitter 下書き | やる。Typefully に下書き保存 |
| Instagram 下書き | やる。下書きDB保存。公開は手動 |
| Threads 下書き | やる。下書きDB保存 |
| YouTube | 直接投稿しない。タイトル・概要欄・Shorts メタデータの下書きまで |
| TikTok | MVP ではやらない。BAN リスク高、Phase 3 以降 |
| LINE VOOM | MVP ではやらない。Phase 3 以降 |
| 試合動画切り抜き | やる。Phase 2 で実装 |
| MMA ネタ自動生成 | やる。1 日 3 ネタ |
| 自動投稿 API 直叩き | やらない |
| Typefully | schedule API は呼ばない。draft のみ |
| Instagram / Threads API | 最初は使わない。下書きDB保存から始める |

---

## 10. リスク最小化設計(3層ガード)

### 第1層 — 危ない行為をしない

- OPENQLOW は SNS に直接投稿しない
- Typefully の schedule API も呼ばない。Typefully は draft のみ
- Instagram / Threads は API 連携せず、下書きDB保存にする
- YouTube も投稿しない。タイトル・概要欄・Shorts メタデータの下書きまで

### 第2層 — 失敗前に確認する

```text
生成 → 自動安全チェック → LINE通知 → Jin承認 → 下書き保存
```

安全チェックで見る項目:

- PII 検出(電話・メール・住所)
- 会員氏名検出
- 子ども・女性・会員・体験者の映り込み
- ネガティブワード
- 他ジム批判
- 未確定情報
- 過度な煽り
- 誇大広告
- FLATUP らしさ

### 第3層 — 壊れた時の被害最小化

- 全ての出力は `logs/` と Obsidian に二重記録
- 承認は冪等(同じネタの二重処理・二重下書き保存が起きない)
- 投稿案ごとに一意の ID(`FG-YYYYMMDD-NNN`)
- 投稿ログでは「下書き保存」と「公開」を混同しない

---

## 11. 絶対に守るブランドルール(禁止リスト)

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
- 営業CTA(「体験に来てください」「LINE登録」「今だけ」「無料」「限定」)を使わない

---

## 12. 優しさスコア(5軸 0〜5点 / 合計25点)

| 軸 | 範囲 |
|----|------|
| 怖く見えないか(notScary) | 0〜5 |
| 初心者が入りやすいか(beginnerFriendly) | 0〜5 |
| 人を傷つけないか(noShameOrPressure) | 0〜5 |
| 会員の尊厳を守っているか(memberDignity) | 0〜5 |
| FLATUP GYM らしいか(flatupLike) | 0〜5 |

判定:

- 22〜25: **strong**(投稿可)
- 18〜21: **revise_lightly**(軽い修正推奨)
- 14〜17: **revise_before_showing**(出す前に直すべき)
- 〜13: **reject**(投稿不可)

---

## 13. 媒体別の方針(Phase 2 で本格化)

同じ動画を全媒体に横流ししない。

| 媒体 | 重視点 |
|------|--------|
| YouTube Shorts | タイトル / 視聴維持 / 冒頭の引き |
| TikTok | 冒頭1秒の違和感 / 人間味 / 空気感 |
| Instagram | 保存したくなる言葉 / 世界観 / 優しさ / 余白 |
| Threads | 思想 / 短文 / 日記性 / 共感 / ジムの哲学 |
| X | 短い洞察 / 内省 / 共感 |

---

## 14. MMA ネタの方針

> 単なる格闘技ニュース速報にはしない。

FLATUP 独自の価値観に必ず接続する:

- 初心者に何を伝えるか
- 女性に何を伝えるか
- 子ども・保護者に何を伝えるか
- FLATUP の安全思想にどうつながるか
- 挑戦する勇気にどうつながるか
- 「世界一優しい格闘技ジム」にどうつながるか

`ContentIdea.valueConnection` フィールドで全提案に必須化する。

---

## 15. 段階ロードマップ

### Phase 1 MVP(毎朝 8:00)

```text
1. ネタジェネレーター
   - data/*.md から角度を選ぶ(差別化/初心者向け/女性向け/キッズ/価値観 ローテーション)
   - Obsidian Vault /30_INBOX/openqlow/ の生ネタを優先採用
   - MMAネタ 1日3本

2. SNS展開モジュール
   - X / Instagram / Threads / LINE 配信用文を生成

3. 3層ガード + ブランドルール検出 + 優しさスコア採点

4. LINE通知(投稿IDつき)

5. Jin 返信で分岐(OK / 修正 / × / やめる)

6. 承認時: Typefully draft + ローカル下書きDB + Obsidian Vault に二重保存
```

### Phase 1.5 Obsidian 双方向統合(実装済み)

- 承認ログを `6_システム/openqlow_logs/YYYY-MM-DD.md` に追記
- 承認済み下書きを `6_システム/openqlow_drafts/{x,instagram,threads}/` にミラー
- `FLATUPGYM_AI_正本マップ.md` を読み取って正本パス解決
- `approval-register` / `posting-log` / `performance-log` を Vault に追記

### Phase 1.6 LINE Push 本番結線 + 死活監視(コード実装済み / 運用確認対象)

- `src/line_bot/notifier.ts` — `pushLineMessage` / `pushApprovalNotification` / `pushAlert`
- `scheduler/daily.ts` — `runDaily()`で生成→各レコードを LINE Push
- `src/monitor/healthcheck.ts` — OpenRouter / LINE webhook / ngrok / launchd の4チェック並列実行
- `npm run monitor`
- 異常時は LINE Alert push

運用確認が必要:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `JIN_LINE_USER_ID`
- `OPENQLOW_DRY_RUN=false`
- ngrok / Cloudflare Tunnel の外部URL
- `daily` / `serve` / `monitor` launchd の実ロード状態

現状ファイル確認:

- `launchd/com.flatup.openqlow.monitor.plist` は配置済み
- `daily` / `serve` plist は `docs/launchd.md` に案があり、実ファイルとしては未配置または別途配置確認が必要

### Phase 2

```text
1. YouTube 動画ダウンロード(yt-dlp)
2. 試合区切り検出(チャプターメタデータ or 手動マーク)
3. 1試合ずつ切り出し(ffmpeg)
4. 各試合に対して SNS 用素材化
   - X 用 15〜30 秒切り抜き
   - Instagram リール 60 秒切り抜き
   - 解説テキスト生成(AIKAボイス)
5. LINE 承認 → 公開素材として保存
```

加えて:

- 媒体別差別化(Shorts ≠ TikTok ≠ IG ≠ Threads)
- 素材管理台帳 + 使用許可チェック
- 公開レベル制

### Phase 3

- 反応分析(Phase 1 で 30 投稿たまったら)
- Instagram Graph API 連携
- TikTok / LINE VOOM 連携
- ClawX / Codex 常駐エージェント強化
- YouTube メタデータ自動下書き強化

---

## 16. リスクコンサル視点での弱点(自己批判)

1. SNS自動投稿は思ったより危険(API制限、ログイン制限、規約変更、BANリスク、誤投稿、子ども・女性・会員の映り込み)
2. 攻めAIなのに、運用が重くなりすぎる(発信量より構築疲れ)
3. ClawX依存が強すぎる(仕様変更で全体停止リスク)
4. 自動化より先に"勝ちコンテンツ型"が未確定
5. Analytics Agent は最初から高度に作ると失敗しやすい(データ少ない)

最終形は本格型にしつつ、**初期実装は最小勝ち筋型**。

---

## 17. 100点設計の構成要素(ロードマップ)

```text
1. 素材管理台帳        (Phase 2)
2. 投稿ID付き承認       (v2 で導入済み)
3. 優しさスコア         (v2 で導入済み)
4. 媒体別投稿ルール     (Phase 2)
5. 公開レベル制         (v2 で導入済み・運用は Phase 2)
6. 投稿ログ             (Phase 1.5 で導入済み)
7. 反応分析             (Phase 3)
8. 次回改善ループ       (Phase 3)
```

> 美しい理念を、事故らず、継続的に、世界へ出し続ける機械

---

## 18. 下書き DB の構造

Markdown を正本、JSONL を機械検索インデックスにする。

```text
drafts/
├─ x/
│  ├─ 2026-05-17-topic.md
│  └─ index.jsonl
├─ instagram/
│  ├─ 2026-05-17-topic.md
│  └─ index.jsonl
├─ threads/
│  ├─ 2026-05-17-topic.md
│  └─ index.jsonl
└─ youtube/ (Phase 2)
   ├─ 2026-05-17-topic.md
   └─ index.jsonl
```

状態管理は `state/<record-id>.json`。Vault 側にも `6_システム/openqlow_drafts/` にミラー。

---

## 19. コード配置

```text
/Users/jin/Desktop/OPENQLOW HelMES/
├── flatup-ai-os/                 # 既存 AIKA 下書きエンジン(守りのAI、触らない)
│   └── src/data/                 # ブランド正本データ
│
└── openqlow/                     # 新規(攻めのAI)
    ├── README.md
    ├── OPENQLOW_HANDOFF.md
    ├── package.json
    ├── src/
    │   ├── index.ts              # CLI エントリ(generate / approve / reject / revise / monitor)
    │   ├── config.ts
    │   ├── types.ts              # 共通型
    │   ├── scheduler/daily.ts    # 朝のオーケストレーター
    │   ├── generators/
    │   │   ├── daily_three.ts    # 1日3ネタ
    │   │   └── mma_topic.ts      # MMA角度
    │   ├── sources/
    │   │   ├── brand_knowledge.ts
    │   │   ├── obsidian_inbox.ts
    │   │   └── canon_map.ts      # 正本マップ読み取り
    │   ├── distribution/expand.ts # 媒体展開
    │   ├── safety/check.ts        # 3層ガード + 優しさスコア
    │   ├── approval/message.ts    # LINE承認文
    │   ├── adapters/
    │   │   ├── x_typefully.ts
    │   │   ├── instagram_draft.ts
    │   │   ├── threads_draft.ts
    │   │   ├── vault_log.ts      # Vault 承認ログ
    │   │   ├── vault_mirror.ts   # Vault 下書きミラー
    │   │   └── vault_register.ts # 承認・投稿・改善台帳
    │   ├── state/file_store.ts
    │   ├── line_bot/
    │   │   ├── webhook.ts
    │   │   └── notifier.ts       # LINE Push API
    │   ├── monitor/healthcheck.ts # 死活監視
    │   └── utils/
    ├── drafts/
    ├── state/
    ├── logs/
    └── launchd/
        └── com.flatup.openqlow.monitor.plist
```

---

## 20. MVP 完了の指標(30日)

- [ ] OPENQLOW が毎日朝8:00に投稿候補を3本生成、LINEに通知できる
- [ ] 全候補が**優しさスコア 18点以上** で通過
- [ ] 営業CTAの混入が **0件**
- [ ] ブランドルール違反による block が **AI から先回りで検出** されている
- [ ] Jin が「OK FG-…」「修正 FG-…」「× FG-…」で承認/修正/却下を回せる
- [ ] AI 自動公開 = 0 件、誤投稿 / BAN / 規約違反 = 0 件
- [ ] X フォロワー +200(参考目標、営業しない発信での自然増)
- [ ] 体験予約 +5 件(既存フローの結果として観察)
- [ ] 朝の承認所要時間 1 分以内(7 日連続)

---

## 21. Obsidian Vault 統合の優先順位

**最優先 1: WRITE 承認ログ**

> `6_システム/openqlow_logs/YYYY-MM-DD.md` に毎日の生成・承認・却下・修正を残す。これはOPENQLOWの「記憶」になります。あとで改善するとき一番効きます。

**最優先 2: WRITE 下書きDBのVaultミラー**

> 承認済みのX / Instagram / Threads下書きをVaultにも保存する。Obsidianで検索・再利用・改善できるので、Jinさんの運用に一番馴染みます。

**次点 3: READ 正本マップ参照**

> `FLATUPGYM_AI_正本マップ.md` を作って、OPENQLOWが読むべきVaultファイルをそこから見つける。これは長期運用でかなり大事です。AIが迷子になりにくくなります。

**後回し 4: READ 過去投稿の重複検出**

> 30投稿くらい溜まってからでいいです。

**後回し 5: READ 会員ストーリー**

> 強いですが、許可管理・個人情報・子ども/女性の扱いが絡むので、慎重にPhase 2以降。

Phase 1.5 として 1 + 2 + 3 は実装済み。

---

## 22. Vault の正本構造(参照先)

```text
/Users/jin/Documents/Obsidian Vault/
├── 00_CORE/                            # AI の心臓とルールブック
│   ├── FLATUPGYM_AI_HOME.md           # 全体入口
│   ├── AIKA_OS_CONSTITUTION_v1.md     # AIKA OS 憲法
│   └── ブランド理念/
│       ├── FLATUP_mission.md
│       ├── SOUL.md
│       └── 中核コピー.md
├── 01_SKILLS_CUSTOMER/                 # 顧客対応(LINE返信、体験予約、FAQ、成約率)
├── 02_SKILLS_MARKETING/                # マーケティング(SNS、Typefully、広告、動画)
├── 03_SKILLS_INTERNAL/                 # JIN Copilot
├── 1_AIKA人格_本番.md                 # LINE Bot 人格正本
├── 4_日記/                             # JIN作業台、学習ログ
├── 5_アーカイブ/                       # 過去資料(現行手順としては使わない)
├── 6_システム/                         # システム運用
│   ├── FLATUPGYM_AI_正本マップ.md     # 正本ナビ
│   ├── FLATUPGYM_AI_機能一覧.md
│   ├── FLATUPGYM_AI_整理台帳.md
│   ├── PHASE1_DESIGN.md
│   ├── LINE_BOT_仕様.md
│   ├── CLOSED_MODE_DESIGN.md
│   ├── openqlow_logs/                  # OPENQLOW 自動追記
│   └── openqlow_drafts/                # OPENQLOW 自動ミラー
└── 99_REFERENCE/                       # 参考資料
```

---

## 23. 自己評価 — 82点(2026-05-19 時点)

> 採点すると、ここまで **82点** です。

### よくできている点

> LINE webhook は実際に受信できていて、OpenRouter の設定エラーも潰し、最終的に LINE 上で `動いてます` まで返せています。つまり「LINE → webhook → OpenClaw → OpenRouter → LINE返信」の最低限の実動作は通りました。

### 減点ポイント

1. **設定の再現性が弱い**
   - 手動で `models.json` を直して復旧している
   - ClawX 更新や再設定で戻る可能性
   - セットアップ手順として固定化する必要がある

2. **応答品質がまだ未設計**
   - 今は `OK` や `動いてます` が返るだけ
   - FLATUPGYM の「世界一優しい格闘技ジム」「守りのAI」としての人格、導線、禁止表現、体験誘導ルールはまだ本格反映前

3. **LINE 公式アカウント側の自動応答と競合リスクが残る**
   - LINE Manager の応答メッセージがまだ影響する可能性
   - 「OpenClaw 返信」と「LINE 標準自動応答」が混ざるとユーザー体験が壊れる

4. **承認制・投稿制御はまだ未完成**
   - OPENQLOW v2 の思想は固まってきたが、LINE で「これ投稿する?」→承認→投稿の自動運用はまだ実装途中

5. **監視・復旧設計がない**
   - ngrok、Gateway、ClawX、OpenRouter、LINE webhook のどれかが落ちた時に自動検知できない
   - 本番なら死活監視が必要

### 2026-05-19 実装後の補足

- Phase 1.5 の Obsidian ログ・ミラー・正本参照は実装済み。
- Phase 1.6 の LINE Push / healthcheck コードは実装済み。
- `monitor` launchd plist は配置済み。
- 本番運用の満点には、認証情報結線、LINE Push 実送信、daily/serve launchd の配置・ロード確認、1〜2週間の観察が必要。

### 総評

> 技術疎通は合格。思想設計はかなり良い。運用設計はまだ育てる段階。
> 今の状態は「エンジンがかかった車」。次は、ハンドル・ブレーキ・安全装置・目的地を入れる段階。

### 100点への 5 ステップ(優先順)

1. LINE 標準自動応答を整理して OpenClaw と競合させない
2. FLATUPGYM 守り AI の応答方針をプロンプトに固定
3. OPENQLOW 攻め AI を「理念翻訳機」として別役割化
4. 投稿承認フローを LINE で実装
5. Gateway / ngrok / webhook / OpenRouter の死活監視を作る

分担:

- Jin が手で: 1 LINE Manager 設定
- AI が並行で: 4 + 5
- 別セッション: 2 プロンプト固定(本番影響あり)
- 3 OPENQLOW 役割化: v2 で完了

---

## 24. LINE Manager / Developers 設定(MOLTBOT @817nsdhr)

### LINE Official Account Manager

| 項目 | 状態 |
|------|------|
| チャット | ON |
| あいさつメッセージ | OFF |
| Webhook | ON |
| 応答時間 | ON |
| 応答時間内の応答方法 | 手動チャット(応答メッセージ無し) |
| 応答状況を表示 | 表示する |

### LINE Developers Console (Messaging API)

| 項目 | 状態 |
|------|------|
| 応答メッセージ | 無効 |
| あいさつメッセージ | 無効 |
| Webhook の再送 | OFF |
| エラーの統計情報 | OFF |
| グループトーク・複数人トークへの参加 | 無効 |

これにより LINE 標準自動応答が OpenClaw / OPENQLOW の返信と競合しにくくなった。

### 残るもの

- LINE Developers の **Webhook URL** に OPENQLOW の外部公開 URL(ngrok / Cloudflare Tunnel)を入れる
- **チャネルアクセストークン(長期)** を発行して `.env` の `LINE_CHANNEL_ACCESS_TOKEN` にコピー
- Jin の LINE userId を `.env` の `JIN_LINE_USER_ID` にコピー
- `OPENQLOW_DRY_RUN=false` の本番切り替え

これらが揃えば LINE Push と Webhook 受信が本番稼働する。

---

## 25. Mac 運用(launchd で 24h 稼働)

### Sleep 抑止(`pmset`)

```bash
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a tcpkeepalive 1
sudo pmset -a powernap 0
sudo pmset -a hibernatemode 0
```

### Amphetamine 設定

- 「Allow system to sleep when display is closed」を **OFF**
- 「Closed-Display Mode」を ON
- セッション開始時に新規 Indefinite セッションを開始

### クラムシェル運用の物理条件

- 電源アダプタ接続(必須)
- 外部マウス or キーボード(BT/USBどちらでも)

これで Mac の蓋を閉じた状態でテザリング・OPENQLOW・LINE webhook を維持しやすくする。

---

## 26. 最終定義(再掲)

**OPENQLOW:**

> FLATUP GYM の理念と空気を外の世界に伝える AI。
> 営業しない。
> ただ、最高に楽しくて優しくて、みんなが幸せそうなジムの姿を考え抜いて発信する。

**FLATUP GYM LINE BOT(守り):**

> LINE に来た人を丁寧に受ける守りの AI。
> 不安を減らし、必要なら体験・見学・人間対応につなげる。

**自動化:**

> AI が企画・台本・字幕・キャプション・リスク確認まで自動で行う。
> ただし、SNS 投稿など外部に出るものは必ず自分に LINE で確認する。
> 自分が承認したら(下書きに)保存する。

**最終目標:**

> FLATUP GYM の「世界一優しい格闘技ジム」という思想を、SNS 上で自然に伝わる状態にする。
> 営業臭くなく、押し売りせず、ただ見た人が「ここ、なんかいいな」と感じる発信を継続的に自動で生み出す。

---

## 27. 引き継ぎ時の注意

- **本番影響がある領域は触らない**: `line_webhook.py` / `closed_mode.py` / LINE Bot 仕様差分は別タイミングで本番ログを見ながら整理。
- **`5_アーカイブ/` と `99_REFERENCE/` は急いで整理しなくてよい**。
- **OPENQLOW(HelMES側)は git 外**。履歴管理に乗せるなら `git init` のタイミングを別途相談。
- Vault 側は GitHub に push 済み(2026-05-19 時点で `feec09e docs: adopt system research canon`)。
- **次の100点化の鍵**: 守りAIプロンプト固定(本番並行で慎重に)、本番認証情報の結線、運用観察 1〜2週間。
