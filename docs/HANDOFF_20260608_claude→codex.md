# HANDOFF: Claude → Codex - 2026-06-08

## Summary

Claude が `REFERRAL_PLAYBOOK.md` を作成し、紹介を「言わずに」発生させる仕組み（写真送信テンプレ A/B/C・告知文・QRカード設計）をドキュメント化。
このうち**写真送信テンプレ A/B/C を openQLOW から半自動で生成・送信できる**ようにしたい。Codex 担当領域（LINE webhook + 承認フロー + commands）に該当するため依頼。

---

## 1. ゴール

JIN が LINE で短いコマンドを送るだけで、親への成長報告メッセージが半自動で作られ、承認 → 送信できる仕組み。

### 期待される運用フロー

```
JIN: /成長 ○○ちゃん 回し蹴り初成功 → LINE bot

openQLOW: テンプレB を生成して返信
  ☀ 今日の成長記録
  ○○ちゃん、初めて回し蹴りができました！
  ...
  
JIN: ok

openQLOW: 親のLINE宛にメッセージ送信
  + Obsidianに記録
  + CRMに「成長報告送信済」を記録
```

---

## 2. 必要な要素

### 2-1. LINE コマンド（Codex領域 `src/commands/`）

```
/成長 <名前> <できたこと>       → テンプレB
/レッスン <名前> <反応>          → テンプレA  
/UIZIN <名前>                  → テンプレC
```

### 2-2. テンプレート（Claude領域 `src/generators/` または `src/sources/` で連携）

テンプレ A/B/C の文面は `docs/REFERRAL_PLAYBOOK.md` §1 にあります。
canon_2026 のトーンに整合した文面を生成する責任は Claude 側。
**Codex は文面生成自体は触らず**、Claude が用意する `generators/growth_message.ts` を呼ぶインターフェイスだけ実装してください。

### 2-3. 親LINEへの送信（Codex領域 `src/line_bot/`）

- 親の LINE User ID を CRM (`src/crm/`) から引く
- 承認後に push 送信
- 送信記録を残す

---

## 3. 安全要件

- ❌ 親への自動送信は禁止（必ず JIN の `ok` 承認が必要）
- ❌ 顔出しNGの子の写真が含まれる場合は送信ブロック
- ❌ 親のLINE User ID をログに表示しない
- ✅ 送信前にプレビュー → 承認 → 送信
- ✅ 送信失敗時は LINE に通知
- ✅ 既存の承認フロー（OK/修正/NO）と整合

---

## 4. 推奨実装順

```
Phase 1: コマンドルーティング
  /成長 /レッスン /UIZIN を parser に追加

Phase 2: Claude側のテンプレ生成連携  
  src/generators/growth_message.ts は Claude が後日作成
  → Codex は呼び出し interface だけ用意

Phase 3: CRM連携
  親LINE User ID 引き取り（既存 crm/ 連携）

Phase 4: 半自動送信
  承認後 push API 呼び出し
```

---

## 5. 担当境界（明示）

| 役割 | 担当 |
|---|---|
| LINE コマンドparser | Codex |
| 承認フロー連携 | Codex |
| CRMからの親LINE ID取得 | Codex（既存 crm/ 拡張） |
| push 送信 | Codex |
| **文面テンプレ A/B/C のロジック** | **Claude**（後日 `src/generators/growth_message.ts`） |
| 安全チェック（顔出しNG） | Codex（既存 safety/ 拡張） |

---

## 6. 既存資産の活用

- `docs/REFERRAL_PLAYBOOK.md` §1 にテンプレ A/B/C 原文あり
- `STRATEGY_2026_AB_HYBRID.md` §4 で位置付け説明済み
- canon_2026.md の「太陽のジム」「敵は相手じゃない」を含む
- 既存承認フロー（`src/approval/`）の `ok` ショートカット流用

---

## 7. JIN確認待ち事項

このハンドオフ受領後、Codex が以下に答えてください：
1. Phase 1（コマンド追加）の見積もり工数
2. CRM から親 LINE ID を引く既存機能の有無
3. push 送信 API 実装方針（LINE Messaging API直接 / 既存ラッパー使用）

---

## 8. 完了条件

1. `/成長 ○○ちゃん 回し蹴り` が動く
2. JIN が `ok` で半自動送信完了
3. 親 LINE に正しく届く（テスト用 LINE で確認）
4. 顔出しNG判定が機能する
5. `npm run test` フルパス
6. JIN が「使えた」と1回成功報告

---

## 9. Claude 側の準備

Claude は本ハンドオフ後、`src/generators/growth_message.ts` のドラフトを書き始める準備があります。
Codex が Phase 1 を完了後、コマンドの interface を共有してください。Claude が合わせて generators を実装します。

---

## 10. 関連ドキュメント

- `REFERRAL_PLAYBOOK.md` テンプレ原文・運用方針
- `STRATEGY_2026_AB_HYBRID.md` §4 戦略上の位置付け
- `canon_2026.md` ブランドトーン
- `CAMPAIGN_RULES.md` 親子割・紹介規約

— Claude
