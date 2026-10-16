# Codex への指示書：LINE VOOM と Google ビジネスプロフィールを、Codex のブラウザから投稿する

作成: 2026-10-16（Claude → Codex）
対象リポジトリ: `flatup1/openqlow`
作業ブランチ: `claude/image-choice-fix`（本番VPSで動いている版。ここから新しいブランチを切ること）

---

## 1. やりたいこと（ひとことで）

JIN が LINE で `投稿` → `ok` → `画像1` → 「これで投稿」まで進めた投稿を、
**Codex のブラウザアプリ（JIN のログイン済みブラウザ）で LINE VOOM と Google ビジネスプロフィールに投稿する**。

- Instagram / Threads / Facebook は、すでに API で自動投稿できている（触らない）。
- LINE VOOM と Google ビジネスは、今は「投稿パネル（本文コピー＋投稿画面を開く）」で JIN が手で貼っている。ここを Codex のブラウザ操作に置き換える。

---

## 2. 今の状態（2026-10-16 時点で確認済み）

| 項目 | 状態 |
|---|---|
| 本番VPS | `/opt/openqlow` が `claude/image-choice-fix` の `8efe63c`。`openqlow-webhook.service` は active |
| 投稿の流れ | `投稿` → 投稿案 → `ok` → 写真候補 → `画像N` → 写真に合わせた本文を表示 → 「これで投稿」で公開 |
| 自動投稿 | Instagram・Threads・Facebook（API） |
| 手動投稿 | Google ビジネス・LINE VOOM（投稿パネル） |
| X | 課金待ちで停止中 |
| 画像配信 | `https://162-43-41-182.sslip.io/openqlow/media/<ファイル名>` を nginx が直接配信（200） |
| 公開ロック | `OPENQLOW_ENABLE_PUBLIC_POSTING=false`（API投稿は有効） |

既存の部品（これを土台にする。作り直さない）:

- `src/publish/browser_panel.ts` … 投稿パネル（本文・画像URL・投稿画面へのリンク）を作る
- `src/publish/browser_post_job.ts` … `state/browser_post_jobs/<ID>.json` に、投稿先ごとの本文・画像・URLを書き出す
- `src/publish/browser_post_runner.ts` … ジョブを順に処理するランナー
- `scripts/adapters/google_business.mjs` / `scripts/adapters/line_voom.mjs` … サイト別の操作
- `scripts/mac-browser-poster.mjs` … Mac のブラウザで投稿画面を開き、本文をクリップボードに入れる
- `docs/browser-post-adapters.md` … 上の使い方と安全設計（**必ず先に読む**）

---

## 3. 作るもの

### 3-1. Codex が投稿ジョブを受け取る入口

- 「これで投稿」の後、Google ビジネスと LINE VOOM のジョブは `state/browser_post_jobs/<ID>.json` に出る（既存）。
- Codex のブラウザから取れるように、**読み取り専用の取得口**を作る。案:
  - 既存の投稿パネル（HTML）に、ジョブ内容を JSON で返すページを足す（例: `/openqlow/panel/<ID>.json`）
  - URL には推測されにくいトークンを付ける。トークンは env から読み、ログや返信に出さない
- LINE の返信に「Codex で投稿する」ボタン（パネルURL）を出す

### 3-2. Codex のブラウザでの投稿手順（サイト別）

Codex のブラウザは JIN がログイン済みの状態で使う。Cookie・パスワード・トークンを読んだり保存したりしない。

**Google ビジネスプロフィール**
1. ジョブの本文・画像URLを読む
2. `OPENQLOW_GBP_POST_URL`（JIN 設定済みの投稿画面）を開く
3. 「最新情報を追加」→ 本文を貼る → 画像を追加（画像URLから取得してアップロード）
4. **投稿ボタンを押す前に止まり、JIN に確認を取る**（下の「安全ルール」参照）

**LINE VOOM**
1. 同じくジョブを読む
2. `OPENQLOW_LINE_VOOM_POST_URL`（LINE公式アカウント管理画面の VOOM 投稿画面）を開く
3. 本文を貼る → 画像ファイルをアップロード
4. 投稿先アカウントが **FLATUPGYM（@jfl0054o）** であることを画面で確認する（ボット側は「会員200人目標 @817nsdhr」なので取り違えに注意）
5. 投稿ボタンを押す前に止まり、JIN に確認を取る

### 3-3. 結果の記録

- 投稿できたら、`state/publish_results/<ID>.json` に `{ destination, status: "posted", postedAt, url? }` を追記
- できなかったら `status: "not_posted"` と理由。**投稿できていないのに posted にしない**
- LINE に「Google: 投稿済み / VOOM: 未投稿（理由）」のように短く返す

---

## 4. 安全ルール（必ず守る）

1. **最後の投稿ボタンは、JIN の確認が取れたときだけ押す**。
   既存の `OPENQLOW_FORCE_FULL_AUTO=true` は「完全自動は未有効」として止まる設計。この設計を壊さない。
   JIN が「確認なしで押してよい」と別途承認するまでは、確認ありで運用する。
2. Cookie・パスワード・アクセストークン・`.env` の中身を、画面・ログ・チャット・コミットに出さない。
3. 写真に会員・子どもが写る場合がある。公開してよいかは、LINE で JIN が「これで投稿」を押した時点で確認済みとする。それ以外の写真を勝手に使わない。
4. 投稿先アカウントを毎回確認する（Google は FLATUP GYM のビジネスプロフィール、VOOM は FLATUPGYM @jfl0054o）。
5. 料金・時間・クラスなどの事実は `src/shared/canon.ts` が正本。本文に勝手に書き足さない。
6. 本番反映（VPS）・push・PR は JIN の承認後（`CLAUDE.md` / `AGENTS.md` の承認境界に従う）。

---

## 5. 確認が必要な点（Claude 側で未検証）

- **LINE VOOM**：公式アカウントの VOOM に投稿できる公開 API は、Claude 側では確認できていない。ブラウザ操作で進める前提だが、公式 API があるかは Codex 側でも調べて、あれば報告すること。
- **Google ビジネスプロフィール**：Google の Business Profile API（投稿 = localPosts）で自動化できる可能性がある。ただし API 利用申請と OAuth 設定が必要になる見込み。今回はブラウザ操作を優先し、API 化は「次の候補」として調べた結果だけ報告すること。
- `OPENQLOW_GBP_POST_URL` / `OPENQLOW_LINE_VOOM_POST_URL` の実際の値は VPS の env にある（値は出力しない）。

---

## 6. 完了の条件

- [ ] LINE で「これで投稿」→ Codex のブラウザで Google と VOOM の投稿画面に本文と画像が入った状態まで進む
- [ ] JIN の確認後に投稿され、`publish_results` に `posted` が記録される
- [ ] 失敗したときは `not_posted` と理由が記録され、LINE に正直に返る
- [ ] 既存テストがすべて通る（`npm test` と `./scripts/validate-ai-os.sh`）。新しい処理にテストを足す
- [ ] 秘密情報がコミット・ログに出ていない

---

## 7. 参考：触ってはいけない・注意するもの

- `/etc/openqlow/openqlow.env`（本番の秘密情報。上書き禁止。読む場合も値を出さない）
- nginx 設定（`/etc/nginx/sites-enabled/`）。バックアップは sites-enabled の**外**に置く（中に置くと二重読み込みで落ちる）
- systemd は `ProtectHome=true`。書き込みは `/opt/openqlow` と `/opt/obsidian-vault` だけ可
- 承認者は `JIN_LINE_USER_ID` と `BACKUP_APPROVER_LINE_USER_ID`。このチャンネルでの JIN は後者
- `THREADS_USER_ID` は仮の値のまま（別タスク）
