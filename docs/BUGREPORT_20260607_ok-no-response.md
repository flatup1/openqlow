# BUGREPORT: `ok` を送っても反応しない — 2026-06-07

報告者：Claude（レビュー役）／対応：Codex（`src/line_bot` `src/approval` `src/scheduler` `deploy` 領域）
正本仕様：`docs/HANDOFF_20260607_claude→codex_v2.md`

> Claude は実装（src/・scripts/）を触らない。本書は原因切り分けと確認ポイントの提供まで。

---

## 1. 症状

- LINE で投稿候補（例 `FG-20260608-003` / THREADS の親子キックボクシング本文）が提示された後、
  JIN が `ok` を送っても **返信が一切ない（無反応）**。
- スクショ：候補提示 5:15 → `ok` 送信 5:39 → 返信なし。

## 2. 期待動作

`ok`（素のok）は「直近の承認待ち候補」を承認し、返信を返すはず。
（コード上は最終投稿まで走る挙動。§6 安全注意も参照）

## 3. コード上の処理経路（確認済み）

`src/line_bot/webhook.ts`
- L54-63 `extractLineTexts`：`event.source.userId` を取得。
- **L58-60**：`allowedApproverIds.size > 0 && !allowedApproverIds.has(userId)` の時、
  `ignored: "non_approver_user"` で **無言で打ち切り（返信なし）**。
- L71-89 `executeApproval`：
  - `executeLineCommand`（line コマンド）→ 非該当。
  - `expandApprovalShortcut(text, root)` で `ok` を展開。
  - 展開できなければ `parseApprovalCommand` が null → **「受け取りました…」返信が出る**。

`src/approval/shortcut.ts`
- `isOkOnly`：NFKC＋trim＋小文字で `=== "ok"` 判定（全角OK・前後空白OK）。
- `last_approval_candidate.json` の id を読む → その record が `pending_approval` なら `OK {id} all`。
- 無ければ `state/FG-*.json` から最新の `pending_approval` を探す。
- それも無ければ **undefined**（→ webhook 側で「受け取りました…」返信）。

## 3.5 切り分け結果（2026-06-07 追記・確定）

JIN が `日報` を送ったところ **即返信あり**（08:40）。これにより:
- ✅ webhook プロセス生存（#2 除外）
- ✅ JIN は承認者として認識（#1 送信者ID 除外）
- ✅ 返信トークン正常（#3 除外）

→ 問題は **`ok` の処理中だけ**で発生。下表 #4 ではなく、**処理中の例外**が濃厚（§4.5）。

## 4.5 真因（ほぼ確定）：処理中の例外で無言終了

`src/line_bot/webhook.ts` の `try/catch`：
- L155-164：`executeApproval` 実行 → `replyLineMessage`（返信）を呼ぶ。
- **L165-170：`executeApproval` が throw すると catch に入り、`console.error` と
  エラーJSON応答のみ。`replyLineMessage` を呼ばない＝LINE に返信が出ない。**

`ok` の流れ（`executeApproval` 内）：
1. `expandApprovalShortcut` が候補を見つけ `OK FG-20260608-003 all` に展開。
2. `approveRecord` → `createBrowserPanel` → **`runFinalPublish`（最終投稿）** を実行。
3. ここで throw すると **無言終了 → JIN には無反応**。

throw の有力候補：
- **(a) 最終投稿の失敗**：VPS には Mac/Chrome が無く、ブラウザ投稿/最終投稿が実行できず例外。
- **(b) Phase1 の投稿拒否**：README 記載「Phase 1 は `level_3_scheduled` / `level_4_publish` を
  承認時に物理的に拒否」。候補が投稿レベルだと `approveRecord` が throw。
- `日報` は投稿処理を通らないので正常に返信できる（症状と整合）。

### 直すべき2点
1. **例外時もユーザーに返信する**：catch（webhook.ts L165-170）で `replyLineMessage` を呼び、
   「投稿準備でエラー。半自動で確認してください」等を返す（無言にしない）。
2. **素の `ok` の意味を見直す**：現状 `ok` は最終投稿まで走る（§6）。VPS 環境で最終投稿が
   できないなら、`ok` は **下書き保存／ブラウザ投稿キュー止まり**にする等、環境に合った既定へ。
   いずれにせよ「投稿できていないのに成功扱いしない」を維持。

## 4. 原因の切り分け（可能性が高い順）

| # | 原因 | 根拠 | 切り分け方法 |
|---|---|---|---|
| 1 | **送信者IDの不一致** | webhook.ts L58-60 が無言で無視 | 別コマンド（`日報`）も無反応か？ 無反応なら濃厚 |
| 2 | **webhook プロセス停止** | 落ちていれば全無反応 | `日報` も無反応／VPS 再起動で復活するか |
| 3 | **返信トークン未設定/失敗** | 処理しても返信が届かない | `replyLineMessage` のログ／`reply.ts` のトークン |
| 4 | 承認待ち候補が無い・状態不一致 | この場合は「受け取りました…」**返信が出る** | 完全無反応なら本件ではない可能性 |

> 完全無反応なので **1〜3（インフラ側）が濃厚**。4は返信が出るため切り分けの基準になる。

## 5. Codex への確認依頼

1. **送信者ID**：稼働中VPSの `JIN_LINE_USER_ID` が、実際にLINEから届く `event.source.userId` と一致しているか。
   - ログ `webhook.ts:57` の `LINE message received from <userId>` で実IDを確認できる。
   - ⚠️ 値そのものを LINE/ログ/コミットに貼らない（IDは秘密情報扱い）。
2. **プロセス**：`openqlow-webhook.service` が up か。落ちていれば再起動と再発防止（自己修復は monitor 領域）。
3. **候補の状態**：`state/FG-20260608-003.json` が存在し `status: "pending_approval"` か。
   `last_approval_candidate.json` に候補提示時の id が書かれているか（`rememberApprovalCandidate` が呼ばれているか）。
4. **デプロイ差分**：VPS は rsync デプロイ（git管理外）。**稼働コードがリポジトリ最新と一致**しているか。
   古い版が動いていると、リポジトリを読んだ診断とズレる。
5. **無反応の握り潰し**：非承認ユーザー時に完全無言で良いか、最低限のログ/通知を残すか（UX判断）。

## 6. ⚠️ 安全注意（修正時に必ず確認）

- `webhook.ts:95` で、**素の `ok` は `runFinalPublish` を呼び最終投稿まで走る**
  （`okShortcutUsed && hasPublishDestinations`）。
- つまり `ok` が直ると、**全媒体（all）へ投稿が走る**。半自動アダプタ経由でも、
  「投稿できていないのに成功扱いしない」原則を維持すること（§共通ルール）。
- 修正で `ok` を復活させる際は、**最終投稿の前に JIN 確認が残る**設計か再点検
  （特に Threads API 直投稿の有無）。意図せず全自動に倒れていないか確認。

## 7. JIN がすぐできる切り分け（参考）

1. LINE で `日報` を送る → 反応あれば webhook 生存、`ok` 固有問題（候補状態）。
2. 無反応なら webhook 再起動（cheatsheet 記載）:
   ```
   ssh -i ~/.ssh/openqlow_vps root@162.43.41.182 'systemctl restart openqlow-webhook.service'
   ```

— Claude
