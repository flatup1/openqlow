# LINEメモ → Obsidian → iPhone 連携 設計判断の記録（2026-07-10）

> 設計: Claude(Fable) / 実装: Codex / 最終判断: オーナー(Jin)
> このファイルは「なぜこの設計にしたか」の記録。**作業手順の正本は `docs/LINE_OBSIDIAN_MEMO_GUIDE.md`**（PR #45でマージ済み）を見ること。手順書を2つにしない。

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
VPS の Obsidian Vault に保存 ← 動作確認済み
↓
/push（または夜の自動同期）で GitHub へ
↓
Mac / iPhone の Obsidian Git が自動で pull
↓
AI が daily_logs を読んで改善提案（人間が承認してから正本へ）
```

---

## 2. 10個の質問への回答

1. **この設計でよいか** → よい。上記の1点(正本の言葉の整理)だけ直す。
2. **GitHubとObsidianどちらをメインにするか** → 両方メイン。ただし役割が違う。**人間が見るのはObsidian、全デバイスの合流点（データの真実）はGitHub**。「GitHubは見ない。Obsidianだけ見る」でよい。
3. **iPhoneに反映させる一番簡単な方法** → Obsidianアプリの中に入れられる **Obsidian Git プラグイン**（モバイル対応）。GitHubの Fine-grained PAT（vaultリポジトリ1つだけ・contents読み書きのみ）で接続し、「アプリを開いたら自動pull」に設定する。専用アプリ追加なし・iPhoneでのgit操作なし。
4. **`/追記`ごとに自動pushすべきか** → **今は手動`/push`のまま**（AGENTS.md ルール7どおり）。ただし「/pushを忘れるとiPhoneに永遠に届かない」問題があるので、**夜1回の自動同期（daily_logsのみ）をオプションとして提案**する。これは本番反映ではなく自分のメモのバックアップなので、オーナーが一度承認すればルールの範囲内。承認するまでは入れない。
5. **MacとiPhoneで一番工数が少ない同期** → 両方 Obsidian Git。Macは**ローカルフォルダにclone**する（iCloudフォルダに置かない。iCloudとgitを混ぜるとファイル破損の原因になる）。
6. **中学生でも使えるように削るところ** →
   - 「各AIへの連携専用の仕組み」は作らない（GitHubにあれば各AIはそのまま読める）
   - フォルダを増やさない（`01_DAILY_OPERATIONS/daily_logs/` に貯まるだけ）
   - 毎日のコマンドは `/追記` と `/push` の2つだけ
7. **今すぐの最短ルート** → `docs/LINE_OBSIDIAN_MEMO_GUIDE.md` のステップA〜D。
8. **事故防止の最低ルール** →
   - vaultリポジトリは **必ずprivate**（注意: `flatup1/openqlow` はpublic。メモを入れない）
   - iPhone/MacのPATは **vaultリポジトリ1つ限定のFine-grained**
   - `/push`の前に必ず `git pull --rebase`（実装済み。iPhone/Macが先に変更していても衝突しない）
   - `/push`は**許可リスト方式**: `daily_logs`等のメモだけをcommitし、正本(00_CORE等)は絶対に自動pushしない（実装済み）
   - 衝突したら自動で直そうとせず、LINEに「手動確認が必要」と返す（実装済み）
   - APIキー・トークン・顧客の実名/連絡先をvaultに書かない
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

## 4. 実装状況（2026-07-10時点）

- ✅ `/追記` → VPS vault保存（動作確認済み）
- ✅ `/push` の安全化: 許可リスト方式 + `pull --rebase --autostash` + 衝突時は安全に中断（PR #45でmainにマージ済み）
- ✅ 作業手順書: `docs/LINE_OBSIDIAN_MEMO_GUIDE.md`（VPS反映・Deploy Key・iPhone/Mac接続。`ProtectHome=true`のため鍵は`/etc/openqlow/`に置く点、初回pushのupstream設定も記載済み）
- ❌ vault用privateリポジトリの作成（**未作成**。`flatup1/flatup` はアクセス可能な一覧に存在しない。オーナーがprivateで作る）
- ❌ VPSの `/opt/obsidian-vault` ⇔ GitHub接続（ガイドのステップB）
- ❌ VPSへの本番デプロイ（ガイドのステップA・オーナー承認後）
- ❌ iPhone / Mac のObsidian Git設定（ガイドのステップC/D）

### 完了条件

- [ ] LINEで `/追記 → /push` → 1分以内にGitHubに反映される
- [ ] iPhoneのObsidianを開くと自動pullで最新メモが見える
- [ ] Macで編集 → push → VPSで `/push` しても衝突せず両方残る
- [ ] vaultリポジトリはprivate、PATはvault限定、秘密情報はvaultに無い

---

## 5. やらないこと（スコープ外）

- `/追記` ごとの自動push（ルール7を守る。夜間同期は承認制オプション）
- Obsidian Sync（有料）や iCloud同期（gitと二重管理になり事故のもと）
- daily_logs から正本への自動反映（人間承認のPRのみ）
- 各AI向けの専用エクスポート機構（GitHubをそのまま読ませる）
