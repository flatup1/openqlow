# ワークフロー：問い合わせ → 体験予約

対応する Skill：`flatup-inquiry-reply`

## ステップ

1. 問い合わせ内容を読み、意図（料金 / 体験 / 日時 / 不安）を分類する。
2. 正本を確認する：`canon/pricing_and_schedule.md`, `canon/membership_rules.md`。
3. 日曜・祝日の体験は案内しない。平日の候補枠を「候補」として提示する。
4. 不明点は推測せず「確認事項」として残す。
5. 返信案を3種（丁寧版 / 標準版 / 短文版）作る。テンプレは `templates/inquiry_reply.md`。
6. 送信は人間が行う（`canon/approval_matrix.md` §2）。AI は下書きまで。

## 注意

- 料金・日時は正本の値をそのまま使い、捏造しない。
- 退会・休会・違約金の質問は確定回答せず、代表確認へ回す。
