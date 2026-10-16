# HANDOFF 2026-08-29 claude → codex / Brand Growth Phase 4 境界仕上げ

`COORDINATION.md` §2 に置いていた Phase 4 の経緯ログを、2026-09-20 の指示書整理でこちらへ移した。
内容は移動のみで、変更していない。現在の状態は `COORDINATION.md` の担当表を見る。

## 対象

- `src/brand_growth/` Phase 4「Quality Guardian and Growth Metadata」
- branch: `claude/flatup-gym-ai-os-phase4-20260816`
- branch最終commit: `14aae4b`。`origin/claude/flatup-gym-ai-os-phase4-20260816` へpush済み。
- 2026-08-29にJINがmergeを承認し、最新`main`との競合を解消して本merge commitで統合した。

## 経緯

Claude Code の Phase 4 実装 → Codex レビュー反映 `706da60` → `main` を merge `b5c3965`
→ push → 2026-08-29 の境界仕上げ（ローカル1 commit・未push）。
2026-08-16 時点で「ローカルのみ・未push・`971f53e`」と書いていた記述は、この時点で古くなっている。

## 2026-08-29 の追加作業（Claude Code / `14aae4b`）

境界と文書整合性の仕上げ。

- `src/brand_growth/storage/config.ts` から環境変数と暗黙の作業ディレクトリ依存を除去し、
  呼び出し側からの明示注入だけで保存先が決まる純関数にした（基準が無ければ fail closed）。
- 境界検査の `process.env` 例外を撤廃し、`src/brand_growth` 全体で環境の読み取りを禁止した。
  fs / path の許可はファイル単位の完全一致のみで、storage に新しいファイルを足しても
  権限を継承しないことを恒久的な反証テストで固定した。
- `docs/flatup-ai-os/adr/ADR-0015-NARROW-LOCAL-EVENT-STORE-BOUNDARY.md` を追加し、
  `AGENTS.md` の「pure」記述を storage adapter の例外つきへ最小修正した。

## Codex 承認

**2026-08-29 に Approved**（境界検査のファイル単位例外 / ADR-0015）。
absolute root のみで cwd を渡さない経路は、機能OFF・呼び出し元未接続・明示 root が管理側の信頼済み入力である
現 Phase 4 では受容。**将来の本番 integration caller は absolute cwd / repositoryRoot を必須で渡す**運用条件付き。
部分文字列による境界検査も保守的な fail-closed として承認。→ Codex 側のレビュー事項はクローズ。

## 残り

- push / merge: **JIN承認済み・完了**。deployと実データ投入は未実施。
- JIN 承認が要る事項: deploy、実データ投入の開始
- Phase 5・Phase 6 は未着手（指示により禁止中）
- 前の引き継ぎ書: `docs/HANDOFF_20260816_claude→codex.md`（§0 に 2026-08-29 の更新注記あり）
