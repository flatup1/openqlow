# LINEメモ → Obsidian かんたんガイド

作成: 2026-07-10 / 対象: JIN（設定は1回だけ。毎日の操作はLINEだけ）

## 毎日やることは、これだけ

```text
1. LINEに /追記 メモ を送る
2. GitHubに残したいときだけ /push を送る
3. iPhoneでObsidianを開くと、もう最新になっている
```

## しくみの絵

```text
LINE（/追記）
  ↓
openQLOW（VPSの受付係）
  ↓
VPSのObsidian Vault（/opt/obsidian-vault）
  ↓ /push と送ったときだけ
GitHub（flatup1/flatup）= 履歴とバックアップ
  ↓ 自動
Mac / iPhone の Obsidian
```

- **Obsidianのファイルが正本**。GitHubは水道管。
- `/push` がGitHubへ送るのは **メモ（daily_logs / openqlow_logs）だけ**。正本（00_COREなど）は絶対に送らない。

---

# 設定手順（1回だけ）

3つのステップがあります。上から順にやってください。

| ステップ | 場所 | 所要時間 |
|---|---|---|
| A. VPSに新しいコードを反映 | Mac + VPS | 10分 |
| B. VPSのVaultとGitHubをつなぐ | GitHub + VPS | 15分 |
| C. iPhoneとMacの設定 | iPhone / Mac | 15分 |

---

## ステップA: VPSに新しいコードを反映

Macのターミナルで:

```bash
cd "/Users/jin/Desktop/OPENQLOW HelMES/openqlow"
git pull origin main
bash deploy/scripts/sync-to-vps.sh
```

VPSにSSHして、ビルドと再起動:

```bash
ssh -i ~/.ssh/openqlow_vps root@162.43.41.182
cd /opt/openqlow
npm ci
npm run build
systemctl restart openqlow-webhook
systemctl status openqlow-webhook --no-pager
```

`active (running)` と出ればOK。

## ステップB: VPSのVaultとGitHubをつなぐ

### B-1. GitHubでDeploy Keyを作る

VPS上で鍵を作ります（webhookは `ProtectHome=true` で動いているので、鍵は `/home` ではなく `/etc/openqlow/` に置くこと）:

```bash
ssh-keygen -t ed25519 -f /etc/openqlow/vault_deploy_key -N "" -C "openqlow-vault"
chown openqlow:openqlow /etc/openqlow/vault_deploy_key /etc/openqlow/vault_deploy_key.pub
chmod 600 /etc/openqlow/vault_deploy_key
cat /etc/openqlow/vault_deploy_key.pub
```

表示された公開鍵をコピーして、ブラウザで:

1. https://github.com/flatup1/flatup/settings/keys を開く
2. 「Add deploy key」→ Title: `openqlow-vps` → 鍵を貼り付け
3. **「Allow write access」に必ずチェック** → Add key

### B-2. Vaultをgitリポジトリとしてつなぐ

```bash
export GIT_SSH_COMMAND="ssh -i /etc/openqlow/vault_deploy_key -o StrictHostKeyChecking=accept-new"
cd /opt/obsidian-vault

# まだgit管理でない場合だけ、次の4行を実行
git init -b main
git remote add origin git@github.com:flatup1/flatup.git
git fetch origin main
git reset origin/main   # 既存ファイルはそのまま。GitHubの履歴とつなぐだけ

git branch --set-upstream-to=origin/main main
git config user.name "openqlow-bot"
git config user.email "flatupgym@gmail.com"
chown -R openqlow:openqlow /opt/obsidian-vault
```

### B-3. webhookにSSH鍵の場所を教える

`/etc/openqlow/openqlow.env` に1行追加:

```bash
GIT_SSH_COMMAND=ssh -i /etc/openqlow/vault_deploy_key -o StrictHostKeyChecking=accept-new
```

反映:

```bash
systemctl restart openqlow-webhook
```

### B-4. 動作テスト

openqlowユーザーでpushできるか確認:

```bash
sudo -u openqlow env GIT_SSH_COMMAND="ssh -i /etc/openqlow/vault_deploy_key -o StrictHostKeyChecking=accept-new" \
  git -C /opt/obsidian-vault push origin HEAD --dry-run
```

エラーが出なければ、LINEで実機テスト:

```text
/追記 接続テスト
/push
```

「GitHubへpushしました。」と返ってきて、https://github.com/flatup1/flatup のコミット履歴に
`memo: LINE追記 ...` が出れば成功。

## ステップC: iPhoneとMacの設定

### C-1. iPhone（Obsidian Gitプラグイン・読むだけ設定）

Macを付けっぱなしにしなくても、iPhoneが直接GitHubから受け取れる方法です。

1. **トークンを作る**（iPhoneのブラウザでOK）
   - https://github.com/settings/personal-access-tokens/new を開く
   - Token name: `iphone-obsidian` / Expiration: 1年
   - Repository access: 「Only select repositories」→ `flatup1/flatup` を選ぶ
   - Permissions → Contents: **Read-only**
   - 「Generate token」→ 表示された文字列をコピー（メモ帳に一時保存）
2. **Obsidianの設定**
   - iPhoneのObsidianで新しいVault「FLATUP」を作る
   - 設定 → コミュニティプラグイン → 制限モードをオフ → 「Git」を検索してインストール・有効化
   - Gitプラグインのコマンド「Clone an existing remote repo」を実行
     - URL: `https://github.com/flatup1/flatup.git`
     - Username: `flatup1` / Password: さっきのトークン
3. **自動で最新になる設定**
   - Gitプラグイン設定で:
     - **Pull on startup（起動時にpull）: ON**
     - Auto commit / Auto push: **OFF**（iPhoneからは読むだけ）
4. **確認**: LINEで `/追記 iPhoneテスト` → `/push` → iPhoneのObsidianを開き直す →
   `01_DAILY_OPERATIONS/daily_logs/今日の日付.md` にメモが見えたら完成 🎉

### C-2. Mac（15分ごとに自動で最新にする）

`~/Library/LaunchAgents/com.flatup.vault.pull.plist` を作る:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.flatup.vault.pull</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "/Users/jin/Documents/Obsidian Vault" && git pull --rebase --autostash origin main >> /tmp/vault-pull.log 2>&1</string>
  </array>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

読み込み:

```bash
launchctl load ~/Library/LaunchAgents/com.flatup.vault.pull.plist
```

Macで正本を編集したときは、今まで通り自分で commit / push（承認ルール通り）。

---

# 困ったとき

| LINEの返事 | 意味 | どうする |
|---|---|---|
| `⚠️ メモ以外の変更が◯件あります` | Vaultにメモ以外の変更があった。メモだけpush済み | 急ぎでなければ放置でOK。正本の変更はMacで確認 |
| `⚠️ 同期が衝突しました` | 同じファイルを2か所で編集した | MacでVaultを開き `git pull --rebase` して直す |
| `GitHubへのpushに失敗しました` | 鍵や回線の問題 | もう一度 `/push`。ダメならステップB-4を再確認 |
| iPhoneに反映されない | pullできていない | Gitプラグインのコマンド「Pull」を手動実行。トークン期限切れなら作り直し |

# 安全ルール（このしくみが守っていること)

1. `/push` は **daily_logs / openqlow_logs 以外を絶対にコミットしない**
2. `/追記` だけでは GitHubに送らない（`/push` と言ったときだけ）
3. 衝突したら自動で止まって人間に知らせる（勝手に解決しない）
4. 正本（00_COREなど）の変更は、人間の承認（JIN）を通してのみ
5. force push はどこでも使わない
