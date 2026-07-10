# LINEメモ → Obsidian → iPhone 連携 設計正本 + Codex実装指示（2026-07-10）

> 設計: Claude(Fable) / 実装: Codex / 最終判断: オーナー(Jin)
> ゴール: **VPSのObsidian VaultとiPhone(Mac)のObsidianがつながり、LINEだけで毎日回る状態**にする。
> 既存の上に積む。作り直さない。`npm test`緑。秘密はgitに入れない。

---

## 1. 結論（設計はこれでよい）

提案された役割分担は正しい。このまま採用する。

| 役割 | 担当 | たとえ |
|---|---|---|
| 入口 | LINE + openQLOW | 郵便受け と 受付係 |
| メモの保存場所 | VPSのObsidian Vault (`/opt/obsidian-vault`) | 引き出し |
| 同期・履歴・バックアップ | GitHub（vault用privateリポジトリ） | 宅配便 と アルバム |
| 人間が読む場所 | Mac / iPhone の Obsidian | 本棚 |
| 改善係 | Fable / Claude / Codex / ChatGPT | 編集者 |

ただし1点だけ言葉を直す。**「事実の正本」（料金・住所・営業時間など）はすでに `openqlow/src/shared/canon.ts` と決まっている**（`docs/UNIFY_3_REPOS.md`）。
Obsidianは「人間が読む記憶と下書きの正本」、canon.tsは「機械が使う事実の正本」。この2つを混ぜない。

### 全体の流れ（完成形）

```md
LINE で /追記
↓
openQLOW（受付係）
↓
VPS の Obsidian Vault に保存 ← ここまで動作確認済み
↓
/push（または夜の自動同期）で GitHub へ
↓
Mac / iPhone の Obsidian Git が自動で pull
↓
AI が daily_logs を読んで改善提案（人間が承認してから正本へ）
```

---

## 2. 10個の質問への回答

1. **この設計でよいか** → よい。上記の1点（正本の言葉の整理）だけ直す。
2. **GitHubとObsidianどちらをメインにするか** → 両方メイン。ただし役割が違う。**人間が見るのはObsidian、全デバイスの合流点（データの真実）はGitHub**。「GitHubは見ない。Obsidianだけ見る」でよい。
3. **iPhoneに反映させる一番簡単な方法** → Obsidianアプリの中に入れられる **Obsidian Git プラグイン**（モバイル対応）。GitHubの Fine-grained PAT（vaultリポジトリ1つだけ・contents読み書きのみ）で接続し、「アプリを開いたら自動pull」に設定する。専用アプリ追加なし・iPhoneでのgit操作なし。
4. **`/追記`ごとに自動pushすべきか** → **今は手動`/push`のまま**（AGENTS.md ルール7どおり）。ただし「/pushを忘れるとiPhoneに永遠に届かない」問題があるので、**夜1回の自動同期（daily_logsのみ）をオプションとして提案**する。これは本番反映ではなく自分のメモのバックアップなので、オーナーが一度承認すればルールの範囲内。承認するまでは入れない。
5. **MacとiPhoneで一番工数が少ない同期** → 両方 Obsidian Git。Macは**ローカルフォルダにclone**する（iCloudフォルダに置かない。iCloudとgitを混ぜるとファイル破損の原因になる）。
6. **中学生でも使えるように削るところ** →
   - 「各AIへの連携専用の仕組み」は作らない（GitHubにあれば各AIはそのまま読める）
   - フォルダを増やさない（`01_DAILY_OPERATIONS/daily_logs/` に貯まるだけ）
   - 毎日のコマンドは `/追記` と `/push` の2つだけ
7. **今すぐの最短ルート** → 下の「4. Codex実装指示」のSTEP 1〜5。新規コードはほぼ不要で、大半はサーバーとiPhoneの設定作業。
8. **事故防止の最低ルール** →
   - vaultリポジトリは **必ずprivate**
   - iPhone/MacのPATは **vaultリポジトリ1つ限定のFine-grained**
   - `/push`の前に必ず `git pull --rebase`（iPhone/Macが先に変更していても衝突しない）
   - 衝突したら自動で直そうとせず、LINEに「手動確認が必要」と返す
   - APIキー・トークン・顧客の実名/連絡先をvaultに書かない（`.gitignore`と運用ルール）
9. **FLATUP AI OS正本への反映運用** → 自動反映しない。週1回（または必要時）、AIが `daily_logs/` を読んで「正本反映の提案」をPRで出し、**人間がマージしたときだけ**反映。料金などの事実は `canon.ts` のみを変更対象にする。
10. **各AIに連携するファイル構成** → 今の構成のままGitHubに置くのが一番よい。Claude Code / Codex はリポジトリ接続で直接読む。ChatGPTなどリポジトリ接続がないAIには、必要なファイルだけ貼る。専用のエクスポート機構は作らない。

---

## 3. 毎日の運用（これだけ）

```md
1. LINEに /追記 メモ を送る（何回でも）
2. すぐiPhoneで見たいときだけ /push と送る
3. iPhoneのObsidianを開くと自動で最新になっている
```

覚えるのは `/追記` と `/push` の2つだけ。

---

## 4. Codex実装指示（VPS ⇔ iPhone をつなぐまで）

> 順番どおりに進める。STEP 3の本番反映とSTEP 6はオーナー承認が必要。

### STEP 0. 前提確認（5分）

- vault用のGitHubリポジトリを確認する。`docs/UNIFY_3_REPOS.md` では `flatup1/flatup`（Obsidian Vault）とされている。
  - 存在してprivateなら、それを使う。
  - なければ `flatup1/flatup-vault` を **private** で新規作成（オーナー承認後）。
- VPSの `/opt/obsidian-vault` が既にgitリポジトリかどうか確認する（`git -C /opt/obsidian-vault status`）。

### STEP 1. VPSのvaultをGitHubにつなぐ（30分・コード変更なし）

1. GitHub側でvaultリポジトリ用の **Deploy Key（書き込み可）** を作る。鍵はVPSの `openqlow` ユーザーで生成し、秘密鍵はVPSから出さない。
2. `/opt/obsidian-vault` で:
   - まだgit管理でなければ `git init` → remote追加 → 初回コミット → push（**初回pushはオーナー承認後**）
   - すでにgit管理なら remote がvaultリポジトリを向いているか確認
3. `openqlow` ユーザーに `git config user.name "openqlow-bot"` / `user.email`（noreplyでよい）を設定。
4. `.gitignore` に `.obsidian/workspace*` `.trash/` `.DS_Store` を入れる（端末ごとの画面状態を同期しない）。
5. systemdの `ReadWritePaths=/opt/obsidian-vault` は設定済みなので変更不要。webhookサービスのユーザーで `git -C /opt/obsidian-vault push --dry-run` が通ることを確認。

### STEP 2. `/push` に pull を足す（コード変更・小）

対象: `src/line_bot/commands.ts` の `pushVault()`

- push（および ahead 判定）の**前に** `git pull --rebase` を実行する。
- pull が衝突などで失敗したら、`git rebase --abort` で元に戻し、LINEに「同期が衝突しました。手動確認が必要です」と返す（勝手にmergeしない）。
- `runGit` は注入可能なので、`src/line_bot/commands.test.ts` に以下を追加:
  - pull → push の順で呼ばれること
  - pull 失敗時に abort して失敗メッセージを返すこと
- `npm test` 緑を確認。

### STEP 3. 本番反映（オーナー承認後）

- openqlowをVPSにデプロイし、LINEから実際に `/追記 テスト` → `/push` → GitHubのvaultリポジトリに反映されることを確認。

### STEP 4. iPhoneのObsidianをつなぐ（設定作業・20分）

> ここはオーナー自身のiPhoneでの作業。Codexは下の手順書をそのままLINE/ドキュメントで渡す。

1. GitHubでFine-grained PATを作る: 対象リポジトリ=vaultリポジトリ1つだけ / 権限=Contents: Read and write のみ / 期限は1年。
2. iPhoneのObsidianで新しいvault（空）を作る。
3. 設定 → コミュニティプラグイン → 「Obsidian Git」をインストールして有効化。
4. Obsidian Gitの「Clone an existing remote repo」でvaultリポジトリのHTTPS URLとPATを入れてclone。
5. 設定: 「Pull on startup」= ON、「Auto commit / Auto push」= OFF（iPhoneは読む専用にする。編集したいときだけ手動でcommit+push）。
6. アプリを開き直して、LINEで送ったメモが見えたら完成。

### STEP 5. Macをつなぐ（設定作業・15分）

1. ローカルフォルダ（例: `~/vaults/flatup`。**iCloud Drive配下は禁止**）に `git clone`。
2. Obsidianで「Open folder as vault」で開く。
3. Obsidian Gitを入れて、Pull on startup = ON。Macで編集するなら Auto commit-and-push（10分間隔など）= ON でもよい。

### STEP 6.（オプション・オーナー承認後）夜の自動同期

- systemd timer で毎日23:00に「`daily_logs/` 配下に変更があれば pull --rebase → commit → push」を実行するスクリプトを追加。
- 対象を `01_DAILY_OPERATIONS/daily_logs/` に限定し、コミットメッセージは `chore: nightly sync of daily logs`。
- 失敗してもリトライせず、LINE通知（既存notifier）で知らせるだけ。

### 完了条件

- [ ] LINEで `/追記 → /push` → 1分以内にGitHubに反映される
- [ ] iPhoneのObsidianを開くと自動pullで最新メモが見える
- [ ] Macで編集 → push → VPSで `/push` しても衝突せず両方残る（pull --rebaseが効いている）
- [ ] vaultリポジトリはprivate、PATはvault限定、秘密情報はvaultに無い
- [ ] `npm test` 緑

---

## 5. やらないこと（今回のスコープ外）

- `/追記` ごとの自動push（ルール7を守る。STEP 6の夜間同期で十分）
- Obsidian Sync（有料）や iCloud同期（gitと二重管理になり事故のもと）
- daily_logs から正本への自動反映（人間承認のPRのみ）
- 各AI向けの専用エクスポート機構（GitHubをそのまま読ませる）
