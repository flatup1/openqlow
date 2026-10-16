# COORDINATION 更新案（2026-09-29 / Claude 作成・JIN承認待ち）

結論：COORDINATION.md は 2026-08-29 で止まっていて、その後の変更が反映されていません。担当の変更は JIN の判断なので、案だけ出します。

## 1. ズレ（事実）

2026-08-29 以降の `src/` 変更（git log 集計）：

| 領域 | 変更数 | 担当表 | 状況 |
|---|---|---|---|
| `src/reply_drafts/` | 45 | **載っていない** | 新領域。担当が未定 |
| `src/approval/` | 7 | Codex | 直近コミットは `claude:` 接頭 |
| `src/publish/` | 5 | Codex | 同上（#147） |
| `src/line_bot/` | 4 | Codex | 同上 |
| `src/state/` | 2 | Codex | 同上（#150） |
| `src/crm/` | 2 | Claude | 問題なし |

該当コミット15件のうち14件が `claude:`、1件が接頭なし。担当表では Codex 領域の変更です（ルール4：他AI担当は JIN に確認）。

## 2. JIN に決めてほしいこと

1. `src/reply_drafts/` の担当は Claude / Codex のどちらか。
2. approval / publish / state / line_bot への Claude 変更を、事後承認（追認）するか。
3. 今後もこの安定化作業を Claude が続けるなら、上の領域の担当を Claude に移すか、期間限定の許可にするか。

## 3. 更新案（承認されたらそのまま反映）

- 最終更新日を承認日に変更。
- §1 に `openqlow/src/reply_drafts/ | （JIN決定） | open` を追加。
- Phase 4 の記述は「統合済み・deploy／実データ投入は未承認」の1行に圧縮（現在は経緯が長く古い記述が残る）。
- §2「現在のロック」は「なし」のまま。

## 4. 未承認のまま残っている事項

- Phase 4 の deploy、実データ投入（JIN承認待ち）
- Phase 5・6 は着手禁止のまま
