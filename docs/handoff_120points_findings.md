# 120点プラン Task 3 調査結果：「松元仁志」bot の所在

調査日: 2026-06-20

## 結論

「松元仁志」LINE チャットで動いている **「OPENQLOW Daily Check」bot は、`flatup1/flatup-ai-os` リポジトリ内の openQLOW 実装**であり、
私（Claude）が改修してきた **MOLTBOT（`flatup1/openqlow` リポジトリ）とは別コードベース** である。

## 根拠

| 観察（LINE スクショ） | flatup-ai-os 側の一致 |
|---|---|
| 「OPENQLOW Daily Check」6問テンプレ | `src/modules/daily_manager.ts` |
| 投稿候補 媒体「x / instagram / threads」 | `src/modules/sns_post.ts` |
| 「AIKA人格_本番.md」「00_CORE/FLATUPGYM_AI_HOME.md」「6_システム/」参照 | flatup-ai-os の data/ 構造 |
| 優しさスコア 25/25、安全チェック | flatup-ai-os の差別化/risk_check モジュール |

- git remote: `git@github.com:flatup1/flatup-ai-os.git`
- 最新コミット: `fbbd49d feat(canon): add canon_2026.md`

## 2つの openQLOW 系実装（重複状態）

| | MOLTBOT | 松元仁志 bot |
|---|---|---|
| リポジトリ | `flatup1/openqlow` | `flatup1/flatup-ai-os` |
| ローカル | `OPENQLOW HelMES/openqlow/` | `OPENQLOW HelMES/flatup-ai-os/` |
| 日報 | 8問・対話 or かんたん日報 | 6問・Daily Check |
| 投稿媒体 | Threads / LINE VOOM / Google Business | x / instagram / threads |
| 言語 | TypeScript（tsx, テスト46本+） | TypeScript（dist/ ビルド成果物あり） |
| 役割（記憶上） | 攻めの openQLOW | **AIKA本体（守り）** のはずだが攻め機能も同居 |

## ⚠ 重要な注意

- `flatup-ai-os` は CLAUDE.md / メモリ上「**AIKA本体（守りのAI）、触らない**」と明記されている
- しかし実際には openQLOW（攻め）の daily_manager / sns_post も同居している
- → **Rule 1（人間判断）+ Rule 2（AIKA保護）に基づき、私からは flatup-ai-os に一切変更を加えていない**

## Jin への確認事項（要判断）

1. **一本化するか？** MOLTBOT（openqlow）と flatup-ai-os の openQLOW 機能を1つに統合するか
2. **片方を廃止するか？** どちらの bot を主にするか
3. **flatup-ai-os 側にも同じ改修を入れるか？**（8問化・typo救済・連結形・reminder 等）
4. **2つの LINE Channel は別か？** MOLTBOT と「松元仁志」bot が別の LINE 公式アカウントか

→ いずれも Jin の経営判断 + LINE Developers Console の確認が必要。私の一存では進めない。

## 私が触っていないもの（安全宣言）

- flatup-ai-os リポジトリ（読み取りのみ）
- flatup-ai-os の VPS / LINE Channel
- AIKA の人格・データ・プロンプト
