# HANDOFF: Claude → Codex - 2026-06-07

## Summary

Claude が方針を整理した結果、Google Business / LINE VOOM 専用投稿アダプタの実装は **Codex 担当が妥当** と JIN が判断。実装一切に Claude は触らず、Codex がフロー層の続きとして安全に進める。

---

## 1. 経緯

- 2026-06-07 朝：Codex が `scripts/mac-browser-poster.mjs` に汎用 auto-click を実装（`bf8d76d`）
- 同日：fail-closed safety fix 適用（`5304f4f`）
- ハンドオフ：Codex → Claude（`docs/HANDOFF_20260607_codex→claude.md`）
- Claude が設計方針提案（Playwright + CDP + 3点検証 + 視覚確認）
- JIN 判断：**Claude案を参考に、実装は Codex が継続**

---

## 2. ゴール

Google Business と LINE VOOM の**サイト専用アダプタ**を実装する。

汎用 AppleScript clicker では `最新情報を追加` 等のクリックを安定検出できないことが判明済み（HANDOFF_codex→claude §Posting Test Status）。サイトごとの DOM/フロー特化アダプタが必要。

---

## 3. 必須要件（妥協不可）

### 3-1. 投稿成功検証
- 投稿が確実に成立したと**UI状態で確認できない場合**、`status="posted"` を返さない
- 検証手段は複数のシグナルで多重化（URL変化 / DOM変化 / API確認 のうち少なくとも2つ）
- 検証できない場合は `status="uncertain"` または fail closed

### 3-2. 最終投稿は JIN 確認を残す
- デフォルトで「投稿前に視覚確認ダイアログ」を表示
- `OPENQLOW_FORCE_FULL_AUTO=true` 等の明示フラグでのみスキップ可能（オプション）

### 3-3. 秘密情報を絶対に出さない
- アダプタが Cookie / トークン / セッション情報を**ログに書かない・stdout に出さない**
- JIN の Chrome プロファイルから情報を引き抜かない
- スクショは取らない（誤って認証情報が映る可能性）

### 3-4. push 承認
- 実装後は JIN 承認まで push しない（既存ルール通り）

---

## 4. 既存インターフェイス（活用してOK）

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true
OPENQLOW_BROWSER_AUTO_CLICK_CMD="/path/to/adapter"
```

`scripts/mac-browser-poster.mjs` がこの env を読んで外部アダプタを呼ぶ仕組みは実装済み。アダプタは標準入出力 or 引数で job 受け取り、JSON で結果を返せばよい。

期待される出力：

```json
// 成功
{"externalId": "google_business-posted-FG-xxxx", "status": "posted"}

// 失敗（fail closed）
{"status": "failed", "reason": "投稿ボタンが見つからない"}

// 不確実（手動確認推奨）
{"status": "uncertain", "reason": "投稿後の遷移が検出できない"}
```

---

## 5. Claude からの設計案（参考・採用任意）

実装は Codex に任せるが、検討材料として：

### 案A：Playwright + Chrome CDP（Claude推奨）
- Playwright を依存追加（npm install playwright）
- JIN が事前に Chrome を `--remote-debugging-port=9222 --user-data-dir=~/.openqlow-chrome-profile` で起動
- アダプタが CDP 接続 → ログイン状態使える
- DOM 完全制御 → セレクタで安定検出可能
- 利点：HTML/JS変更にセレクタ複数候補で耐性
- 欠点：依存追加、JINの事前 Chrome 起動手順が必要

### 案B：osascript + JavaScript (Chrome `tell application` 経由)
- 既存の AppleScript 流れを拡張
- `do JavaScript` でDOMアクセス
- 利点：依存追加なし
- 欠点：DOM操作の信頼性低、エラーハンドリング限定

### 案C：別ツール
Codex の判断で他のアプローチがあれば自由に。

**Codex が技術判断する**。Claude案は参考まで。

---

## 6. 配置場所の提案（Codex判断）

候補：

- `openqlow/scripts/adapters/google_business.mjs` ← Codex領域内
- `openqlow/scripts/adapters/line_voom.mjs`
- `openqlow/scripts/adapters/lib/` ← 共通ユーティリティ

`openqlow/scripts/` は COORDINATION.md §1 で Codex 領域。Codex判断で進めて問題ない。

新規ディレクトリを追加するなら、COORDINATION.md §1 の表に1行追記推奨（`adapters/` 配下）。これは `co-ai:` でも `codex:` でもOK（共有ファイル更新だが領域定義の話）。

---

## 7. テスト要件

- `npm run test` 全パス
- アダプタ単体テスト（モック化したDOM/CDP応答での挙動）
- 失敗ケースの test:
  - ボタンが見つからない → `status="failed"`
  - 投稿後の遷移なし → `status="uncertain"`
  - 成功と verify できた → `status="posted"`

---

## 8. 安全境界（HARD・後退禁止）

Codex の以前の fix `5304f4f` で「verify できなければ success にしない」が確立済み。**この境界を逆戻りさせない**。

- ❌ 「クリックできたから成功」は禁止
- ❌ 「タイムアウトしたから成功」は禁止
- ✅ 「URL変化 + DOM変化 + フォームクリア」のような複合シグナルで判定

---

## 9. Claude 側の状態（参考）

- 触ったファイル：このハンドオフのみ
- 未コミット：このファイル
- Claude 領域（sources/distribution/generators/data）：変更なし
- canon_2026.md：触っていない
- Claude は「待機モード」：Codexから完了報告が来るまで動かない

---

## 10. 完了条件

Codex が以下を達成したら本ハンドオフは Closed：

1. Google Business 専用アダプタ 完成 + 単体テスト通過
2. LINE VOOM 専用アダプタ 完成 + 単体テスト通過
3. 両アダプタが `OPENQLOW_BROWSER_AUTO_CLICK_CMD` で呼べる
4. `npm run test` フルパス
5. JIN が Threads と同様の `ok` フローで Google Business / LINE VOOM 投稿に成功した報告

---

## 11. 締めのお願い

Claude は Codex を信頼してこのタスクを渡します。
- 安全境界（§3, §8）は妥協しないでください
- 実装が難しい場合は、半自動モードに留まる選択も尊重します
- 困ったら docs/HANDOFF_20260607_codex→claude.md と本書を再読してください

完了したら `docs/HANDOFF_20260607_codex→claude_v2.md` でフィードバックお願いします。

ご検討よろしくお願いします。

— Claude
