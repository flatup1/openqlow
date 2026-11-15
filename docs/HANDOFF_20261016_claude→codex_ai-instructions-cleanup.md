# HANDOFF 2026-10-16 claude → codex / 指示書とSkillの整理

## 今やったこと

JIN の指示で、最新モデル向けに指示書を軽量化した（PR #158 / branch `claude/ai-instructions-cleanup-767o71`）。
**Codex担当領域に入っている**ので、内容確認をお願いしたい。

毎回読み込まれていた指示を減らし、禁止の重ね書きの代わりに「確認なしで進めてよい範囲」を明示した。
内容は削除ではなく移動と圧縮。

### Codex担当領域で触ったファイル

| ファイル | 変更 |
|---|---|
| `docs/ai-os/skills-source/*/SKILL.md`（10件） | `description` の2文目（`Do not use ...`）を本文の `## Not for` へ移動。常時ロードされる禁止文を外すのが目的。 |
| `docs/ai-os/skills-source/flatup-change-review/SKILL.md` | 発動条件を「統合前の独立レビュー依頼」に限定。 |
| `docs/ai-os/skills-source/flatup-daily-command/SKILL.md` | `Read first` を今日の情報源だけに変更（憲法ファイルの再読をやめた）。AGENTS.md から削除した起動時チェックの役割をここが持つ。 |
| `src/publish/morning_candidate.ts` / `media_candidate.ts` | `canonPath` が存在しない見出し（`#Daily openQLOW Dialogue` / `#Marketing Output Rules`）を指していたので、実在する見出しへ修正。**この不整合は本PR以前から存在**。 |

`.claude/settings.json`、`.claude/hooks/`、`.codex/` は変更していない。

### 共有・Claude領域で触ったファイル

- `CLAUDE.md`: 必読を `AGENTS.md` 1本にし、他は場面別参照へ。
- `AGENTS.md`: 10.7KB → 約7KB。承認一覧を `approval_matrix.md` 参照に集約。§2「セッション開始時」を追加（JIN判断で毎回の最重要1件提案は維持）。完了報告の型に採点を追加。
- `COORDINATION.md`: §0 の協業ルール重複を `AGENTS.md` 参照へ。Phase 4 の経緯ログを `docs/HANDOFF_20260829_claude→codex_phase4-boundary.md` へ移動。
- `docs/JIN_INSTRUCTIONS_FOR_AI.md`: 「まず通読」を参照資料へ変更し、§0 の旧参照順の引用を更新。**JINの発言原文は一字も変更していない。**
- `docs/EXTERNAL_LINK_FETCH.md`（新規）: `AGENTS.md` にあった Jina Reader 手順を分離。
- `knowledge/CLAUDE.md`: 6.4KB → 2.6KB。`README.md` と重複する説明を削除。
- `flatup-webos/AGENTS.md`: `validate-ai-os.sh` を条件付きに。TESTと100点採点はJIN判断で元に戻した。
- LINE文体の正本を canon に統一（JIN判断）。`docs/canon/11_AIKA_SAFE_REPLY_TEMPLATES.md` と brand-film-ep01/09/11 の引用を `docs/ai-os/canon/brand_voice.md`（200文字以内・3文程度・絵文字1〜2個）へ揃えた。

## 変更していないもの

- `docs/ai-os/canon/**`（`approval_matrix.md` 含む）。canon変更はオーナー承認が必要なため。
  結果として承認ゲートの定型文が `AGENTS.md` と `approval_matrix.md` に8行だけ重複している。
- `COORDINATION.md` §5 のインフラ表。`scripts/vps-role-guard.test.mjs` が値の存在を検証しているため。
- `docs/SNS_POST_TEMPLATE_2026-08.md` の「LINE VOOM（短く・3〜5行）」。顧客返信ではなく投稿フォーマットのため canon の対象外と判断。

## 受け手への注意事項

- `COORDINATION.md` の「§2 現在のロック」は `start-work.sh` / `end-work.sh` が自動書き換えする領域。
  **ロック行以外を置かないこと**（end-work.sh が節の中身を全消去する）。注記は節の外に出してある。
- `AGENTS.md` の章番号が変わった（承認は §3 → §4、協業は §6 → §7）。§番号で参照している箇所があれば直す。
- Skill の `description` を変えると発動精度が変わる。意図に合わないものがあれば指摘してほしい。

## 検証

- `./scripts/validate-ai-os.sh` 通過、`scripts/validate-ai-os.test.sh` 通過
- `npm test` 126件すべて成功
- `start-work.sh` → `end-work.sh` のロック往復を実機確認
- GitHub Actions 7チェックすべて success（head `d93d41e`）

## JIN確認待ち事項

- PR #158 の main への merge（現在ドラフト）
- canon の定型文重複（8行）を解消するかどうか
