# 引き継ぎ指示書 — 会員100名達成マニュアル Ver.1.0（2026-09-04）

> このファイルは**そのまま次のAIに貼って使える**引き継ぎ文です。
> 受け取ったAIは「§0 → §1 → §4」の順に読み、**§4「次の一手」から着手**してください。
> 元セッション: https://claude.ai/code/session_01Xsc6WTTsDAGThXfRRF5p3b

---

## §0 30秒サマリー（結論ファースト）

- JIN提供の「会員100名達成実行マニュアル Ver.1.0」を **`docs/FLATUP_100MEMBERS_PLAN_2026-11-01.md`** に収録した。
- 併せて **`docs/templates/membership_funnel_ledger.md`**（在籍・ファネル台帳テンプレ）を追加した。
- PR #133 は JIN の承認（2026-09-04「go マージして」）を受けて main へ squash マージ。CI 7ジョブ全て緑。
- **コードは1行も変えていない。canon.ts も無変更。** 追加したのはドキュメント2本（＋この引き継ぎ書）だけ。
- **止まっているのは「JINの判断」3件**（§3）。特に **入会金の表記**が決まらないと広告・LPが出せない。
- AIが勝手にやってはいけないこと: 送信、広告出稿、料金確定、canon書き換え、本番反映。**全部JINの承認後**。

---

## §1 いまの状態

| 対象 | 状態 |
|---|---|
| `docs/FLATUP_100MEMBERS_PLAN_2026-11-01.md`（作戦の正） | ✅ main にマージ済み（PR #133） |
| `docs/templates/membership_funnel_ledger.md`（台帳テンプレ） | ✅ main にマージ済み（PR #133） |
| 台帳を Vault `01_DAILY_OPERATIONS/` へコピーして記録開始 | ⛔ 未実施（JINの作業・9/6締切） |
| canon差分3件の確定（入会金ほか） | ⛔ 未決（§3） |
| 施策2 LINE再活性化の文面 | ⛔ 未着手（下書きはAI可・送信はJIN） |
| 施策4 広告テスト | ⛔ 未着手（9/7締切・出稿はJINのみ） |
| コード変更 | なし（`canon.ts`・`src/` は無変更） |

数字の現在地は**すべて自己申告または未計測**。在籍約80名、Google口コミ4.9/36件前後、LINE友だち約1,400人はいずれも裏取り前。
体験→入会CVR、退会率、CPA、ARPU/LTVは未計測。**推測で埋めない。**

---

## §2 何を作ったか（3行で）

1. マニュアル原文を消さずに収録し、canonと食い違う箇所だけ §0 の差分表に切り出した。
2. 施策1（計測整備）は**新規開発せず**、既存の `src/commands/trial_kpi.ts`（LINE `体験予約` / `体験完了` / `体験集計`）と `docs/weekly_sales_funnel.md` に接続した。
3. 台帳は「在籍数と純増」だけに絞った。体験→入会は Vault `01_DAILY_OPERATIONS/体験予約・入会管理.md` が正本で、**二重管理しない**。

---

## §3 いま止まっている場所（JIN判断待ち・3件）

| # | 論点 | マニュアル原文 | canon（正本） | 影響 |
|---|---|---|---|---|
| 1 | **入会金** | 「入会金なし」 | `joinFee: 入会金10,000円`（出典A・2026-06-25 オーナー確認） | **最優先。** 決まるまで広告・LP・LINE文面に入会金を書けない |
| 2 | 紹介特典 | タオル or 1回無料延長 | `referralBenefit: 紹介でお互いにFLATUPバンテージ進呈` | 変えると既存紹介者との不公平が出る |
| 3 | 体験500円の所要時間 | 「30分」 | canon未記載＝未確認 | 案内に書くならcanonへ追記してから |

補足: 所在地は番地一致（建物名の呼び方だけ差異）。アクセスの「公津の杜から徒歩圏」はcanonに無いので**広告に書かない**。
決めたら `src/shared/canon.ts` と `docs/ai-os/canon/VERIFICATION_LEDGER.md`（出典と日付）を**セットで**更新する。canonだけ直して台帳に残さないのは禁止。

---

## §4 次の一手（この順で）

1. **§3 の3件をJINに1回で確認する。** 特に入会金。確認の型は `AGENTS.md` の承認ゲートに従う。
2. 確定したら canon.ts ＋ VERIFICATION_LEDGER.md を更新し、`./scripts/validate-ai-os.sh` と canon 系テストを流す。
3. 台帳テンプレを Vault `01_DAILY_OPERATIONS/在籍ファネル台帳_2026-09.md` としてコピーし、9月分の記録を開始する（JINの手作業）。
4. 施策2のLINE配信文面を下書きする（`flatup-campaign-planner` / `flatup-content-qc` を使う）。**送信はJIN。**
5. 数字が1週間たまったら `docs/weekly_sales_funnel.md` の判定表で週次レビュー。仮置きのCVR（30〜40%）を実測に差し替え、`docs/FLATUP_100MEMBERS_PLAN_2026-11-01.md` §2 を修正する。

---

## §5 やってはいけないこと

- canon と食い違う数字（入会金なし等）を、確認前にお客様向け文面・広告・LPへ出す。
- 未計測のCVR・退会率を、実測のように書く。空欄を「0」で埋める。
- 体験→入会の記録を台帳側にも書いて二重管理する。
- 台帳・ドキュメントに氏名・電話番号・LINE ID・顧客個人情報を書く。
- 送信、予約確定、料金判断、返金、退会、休会、広告出稿、課金、本番反映、commit / push / PR を**JINの承認なしに**行う。
- 11月1日までは、この5施策以外の新規開発（大規模WebOS拡張・大量アニメ制作など）に着手する。

---

## §6 参照

- 作戦: `docs/FLATUP_100MEMBERS_PLAN_2026-11-01.md`
- 台帳テンプレ: `docs/templates/membership_funnel_ledger.md`
- 週次点検: `docs/weekly_sales_funnel.md` ／ 経営レビューの型: `docs/ai-os/workflows/weekly_management.md`
- 正本: `src/shared/canon.ts` ／ 出典台帳: `docs/ai-os/canon/VERIFICATION_LEDGER.md`
- 承認境界: `AGENTS.md` ／ `docs/ai-os/canon/approval_matrix.md` ／ 担当領域: `COORDINATION.md`
- 体験KPIの実装: `src/commands/trial_kpi.ts`（Vault `01_DAILY_OPERATIONS/体験予約・入会管理.md` が正本）
