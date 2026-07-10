# Codex実装指示書：LINEメモ → Obsidian → GitHub → iPhone 連携

作成: 2026-07-10 / 作成者: Claude (Fable 5) / 依頼者: JIN

> **進捗（2026-07-10更新）**
> - 作業1（/push安全化）: ✅ 実装・テスト済み（このPRに含まれる）
> - 作業3の手順書: ✅ [LINE_OBSIDIAN_MEMO_GUIDE.md](LINE_OBSIDIAN_MEMO_GUIDE.md) として作成済み
> - 残り: 作業2（VPS本番反映）と、ガイドのステップB・Cを実機で実行すること。
>   手順はすべてガイドに書いてあるので、Codexは作業2をガイドのステップA〜Bに沿って実行すればよい。

## ゴール

**LINEで `/追記` したメモが、iPhoneのObsidianを開くだけで見られる状態にする。**

毎日の操作はこれだけ：

```text
1. LINEに /追記 メモ を送る
2. GitHubに送りたいときだけ /push を送る
3. iPhoneでObsidianを開くと自動で最新になっている
```

## 確定した設計（変更しないこと）

| 役割 | 担当 |
|---|---|
| 人間が見る正本 | Obsidian（Vaultのmdファイル） |
| 同期・バックアップ・履歴 | GitHub `flatup1/flatup` |
| LINEメモの一次保存場所 | VPS `/opt/obsidian-vault` |
| LINE受付係 | openQLOW |
| 整理・改善係 | Fable / Claude / Codex / ChatGPT（GitHub経由でVaultを読む） |

- `/追記` は保存だけ。**自動pushはしない**（`/push` は手動のまま）。
- 正本（00_CORE等）の書き換えは、AIが直接やらない。必ず「提案 → JIN承認」。
- LINE自動送信・料金判断などは今回のスコープ外。絶対に追加しない。

## 現状（このリポジトリで確認済み）

- `src/line_bot/commands.ts` に `/追記`（`appendLineMemo`）と `/push`（`pushVault`）実装済み。テストあり。
- VPS本番には未反映。
- iPhone / Mac への同期は未接続。

---

## 作業1: `/push` の安全化（コード修正）

現状の `pushVault()` には事故の穴が2つある。先に直すこと。

### 1-a. `git add -A` をやめて許可リスト方式にする

今は Vault 内の**全変更**をコミットしてしまう。VPS上で別プロセスが正本を書き換えていた場合、`/push` 一発で正本の変更まで GitHub に流れる。

修正：

```ts
const PUSH_ALLOWLIST = [
  "01_DAILY_OPERATIONS/daily_logs",
  "6_システム/openqlow_logs",
];
// git add -A → git add <allowlistの各パス> に変更
```

- 許可リスト外に変更（`git status --porcelain` で検出）がある場合は、その旨をLINE返信に含める：
  「⚠️ メモ以外の変更が◯件あります。これらはpushしていません。」
- 許可リスト内に変更がなく、許可リスト外だけ変更がある場合は push せず案内だけ返す。

### 1-b. push前に `git pull --rebase` を入れる

Mac / iPhone 側から先に push されていると、今の実装は non-fast-forward で失敗する。

修正フロー：

```text
git add <allowlist> → git commit → git pull --rebase origin main → git push origin HEAD
```

- rebase がコンフリクトしたら `git rebase --abort` して、LINEに
  「⚠️ 同期が衝突しました。Macで解決してください」と返す。**自動解決しない。**
- コミットメッセージは `memo: LINE追記 YYYY-MM-DD (N件)` の形式に変更。
- LINE返信にはコミットしたファイル名を含める。

### 1-c. テスト

- `commands.test.ts` に追加：許可リスト外変更の除外 / pull --rebase 実行順 / コンフリクト時のabortと返信文。
- `npm run test` 全通過を確認。

---

## 作業2: VPS本番反映

1. 作業1を含む main を VPS にデプロイ（既存手順: `deploy/` 参照、systemd再起動）。
2. VPSの `/opt/obsidian-vault` を git 設定：
   - `flatup1/flatup` を origin に設定（**書き込み可能な Deploy Key** をVPSに発行。個人PATは使わない）。
   - `git config user.name "openqlow-bot"` / `git config user.email "flatupgym@gmail.com"`
   - サービス実行ユーザーで `git push` が通ることを手動確認。
3. 実機テスト：LINEで `/追記 テスト` → `/push` → GitHubの `flatup1/flatup` に
   `01_DAILY_OPERATIONS/daily_logs/YYYY-MM-DD.md` のコミットが出ることを確認。

---

## 作業3: iPhone / Mac 接続（人間向け手順書を書く）

コードは不要。`docs/LINE_OBSIDIAN_MEMO_GUIDE.md` として、JINが読んでそのまま実行できる手順書を作ること（中学生でもわかる言葉で）。内容は以下を採用する。

### iPhone：Obsidian Git プラグイン（pull専用）を推奨

Macを常時起動させなくて済むので、これが一番簡単。

1. iPhoneのObsidianで新しいVault（例: `FLATUP`）を作る。
2. 設定 → コミュニティプラグイン → 「Obsidian Git」をインストール。
3. GitHubで **Fine-grained token**（対象: `flatup1/flatup` のみ、権限: Contents Read）を発行。
4. Obsidian Git の「Clone existing repo」で `flatup1/flatup` をクローン。
5. プラグイン設定：
   - **Auto pull on startup: ON**（開くだけで最新になる）
   - Auto push / auto commit: **OFF**（iPhoneからは読むだけ）
6. 動作確認：LINEで `/追記` → `/push` → iPhoneのObsidianを開き直す → メモが見える。

### Mac：今のVaultのままでOK

`/Users/jin/Documents/Obsidian Vault` はすでにgit管理下なので、
launchd（既存の `launchd/` の書き方に合わせる）で15分ごとに `git pull --rebase` するplistの例を手順書に載せる。
Macで正本を編集したら、今まで通り自分で commit / push（承認ルール通り）。

---

## やらないこと（スコープ外・禁止）

- `/追記` での自動push
- iPhone / VPS からの正本（00_CORE等）自動編集
- LINE自動送信、料金・退会・返金・予約の自動判断
- git force push、コンフリクトの自動解決

## 受け入れ条件

- [ ] `npm run test` 全通過（新規テスト含む）
- [ ] `/push` が daily_logs / openqlow_logs 以外を絶対にコミットしない
- [ ] VPSで `/追記` → `/push` → GitHub反映を実機確認
- [ ] iPhoneのObsidianを開くだけでメモが見える
- [ ] `docs/LINE_OBSIDIAN_MEMO_GUIDE.md` が完成している
