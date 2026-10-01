# UIZIN Event OS 設計パック

最終更新: 2026-10-01 / 起案: Claude / 承認: 未（オーナー承認前）
状態: **設計書のみ。コードは未着手。** 実装は Phase ごとに JIN の承認後。

---

## 一言で

**イベントの難しい機械を、全部やさしい日本語にするOS。**

スタッフに必要なのは「今、何が起きているか」と「次に何を押すか」だけ。
OBS・NDI・WebSocket・RTMP・VJソフトを知らなくていい。

## 最終戦略（7行）

1. 無料のOSSを最大限に使う。UIZINは再発明しない。
2. 中身はモジュール（Adapter）に分けて、裏側の対応範囲を広げる。
3. 表面は「今・次・実行」の3要素だけ。
4. ネットが無くても大会は続く（Local First）。
5. 自動化しても、必ず人間が上書きできる。
6. 1つ壊れても、全体は止めない。
7. 機能が増えるほど、UIは複雑にならず、Event OSが裏で仕事をする。

## 採用した戦略：C「Thin Event OS」

| 案 | 中身 | 判定 |
|---|---|---|
| A 全部入りを自作 | OBS・DJ・VJ・配信を全部作る | ❌ 最大の失敗案（開発・テスト・保守が爆発） |
| B Companion中心に改造 | Bitfocus Companionの上にUIを作る | △ 良い所だけ借りる（機器連携・予備の操作盤） |
| **C Thin Event OS** | 状態管理＋やさしいUI＋自動化だけ持ち、下にAdapter | ✅ **採用** |

## ファイル

| ファイル | 中身 | 主な読者 |
|---|---|---|
| [AGENTS.md](AGENTS.md) | AI向けの作業ルール・役割分担・貼るだけの指示文 | Claude Code / Codex / JIN |
| [EVENT_OS_SPEC.md](EVENT_OS_SPEC.md) | 製品仕様（画面・進行・NEXT ACTION・安全運転・配信NG） | 全員 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 構成・Adapter契約・故障時の動き・技術選定 | Claude Code / Codex |
| [ROADMAP.md](ROADMAP.md) | Phase 0〜8・リスク登録簿・費用・未決事項 | JIN / 全員 |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Phaseごとの受入テスト・小学生UIテスト・CHAOS | Claude Code / Codex |
| [REFERENCES.md](REFERENCES.md) | 使うOSS・外部サービスの確認済み事実と「借りる/作る」判定 | Claude Code / JIN |

## 関係するもの

- `tools/uizin-clipper/` と `docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md`：大会動画の自動切り抜き（既存）。Event OSの録画と操作記録を、将来この道具の入力にできる（ARCHITECTURE.md §9）。
- 既存UIZIN OS：**このリポジトリには無い（所在未確認）**。ROADMAP.md Phase 0 で確認する。

## JINに決めてほしいこと

ROADMAP.md §5（Q1〜Q5）。特に **Q1 既存UIZIN OSの所在** が分かると Phase 0 を始められます。
