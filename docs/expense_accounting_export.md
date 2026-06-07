# 経費の会計ソフト連携（設計）

OPENQLOW の経費帳簿（`/経費`）で貯めた**正規データ**を、会計ソフトが取り込める
CSV へ変換する仕組みの設計メモ。Claude / Codex があとで対応ソフトを増やす前提で、
**「正規台帳 → 形式別アダプタ」**の二層構造にしている。

## データの流れ

```
LINE/CLI (/経費)
      │  記録
      ▼
6_システム/openqlow_expenses/expenses.jsonl   ← 正規台帳（唯一の真実）
      │  読み出し → フォーマット変換（アダプタ）
      ├─ expenses-YYYY-MM.csv         generic（表計算/Excel, UTF-8 BOM, ヘッダ有り）
      ├─ expenses-YYYY-MM-yayoi.csv   yayoi  （弥生 仕訳インポート, ヘッダ無し）
      └─ expenses-YYYY-MM-freee.csv   freee  （未実装・枠のみ）
      │
      ▼
  /push → GitHub（Obsidian Vault リポジトリ）
```

正規台帳 `expenses.jsonl` は **1行1経費**の JSON で、会計ソフトに依存しない素のデータ：

```json
{"ts":"...","date":"2026-06-01","amount":1100,"category":"消耗品費","memo":"袋","taxRate":10}
```

- `amount` は**税込**（円・整数）
- `taxRate` は消費税率(%)。未指定は 10% 扱い
- `category` は勘定科目（略称は記録時に正式名へ正規化：消耗品→消耗品費 等）

## コード構成

| ファイル | 役割 |
| --- | --- |
| `src/commands/expense_model.ts` | 共有コア：`ExpenseEntry` 型・`taxAmount()`・既定税率 |
| `src/commands/expense_ledger.ts` | 記録・集計・月報・CSV書き出しの入口（`exportExpenseCsv`） |
| `src/commands/expense_export.ts` | **アダプタ層**：generic / yayoi / (freee枠) のCSV生成 |

アダプタは `expense_export.ts` の `ADAPTERS` レジストリに登録するだけで増やせる：

```ts
const ADAPTERS: Partial<Record<ExportFormat, Adapter>> = {
  generic: ...,
  yayoi:   ...,
  // freee: ここに取引インポート形式を足す
};
```

各アダプタは `ExportArtifact`（本文・ファイル名サフィックス・対応可否）を返す。
ファイルの書き出し・空チェック・/push 案内は `exportExpenseCsv` 側で共通化している。

## 使い方

```text
/経費CSV              # generic（既定）
/経費CSV 弥生         # 弥生 仕訳形式（今月）
/経費CSV 弥生 先月     # 形式トークンは位置自由
/経費CSV 2026-05 yayoi
```

```bash
npm run dev -- expense:csv yayoi 2026-06
```

## 弥生会計（yayoi）アダプタの仕様

弥生の「仕訳データ」インポートは **25列・ヘッダ無し**の固定フォーマット。
経費は **1件 = 1仕訳**（借方＝経費科目／貸方＝相手科目）として出力する。

| 列 | 内容 | 本実装の値 |
| ---: | --- | --- |
| 1 | 識別フラグ | `2000`（通常仕訳） |
| 4 | 取引日付 | `2026/06/01`（西暦スラッシュ） |
| 5 | 借方勘定科目 | カテゴリ（例: 消耗品費） |
| 8 | 借方税区分 | `課対仕入10%` / `課対仕入8%（軽）` / `対象外` |
| 9 | 借方金額（税込） | `amount` |
| 10 | 借方税額 | `taxAmount()` の内税 |
| 11 | 貸方勘定科目 | **事業主借**（個人事業主の既定） |
| 14 | 貸方税区分 | `対象外` |
| 17 | 摘要 | `カテゴリ メモ` |
| 25 | 調整 | `no` |

（残りの列は空欄。弥生が伝票No等を自動採番する）

### 設定で変えられる前提

- **相手勘定科目**（貸方）: 既定は個人事業主の `事業主借`。法人や別運用は
  `exportExpenseCsv(..., { creditAccount: "未払金" })` で差し替え可能。
- **税区分の文字列**: `expense_export.ts` の `YAYOI_TAX_CLASS_PURCHASE` 対応表に集約。
- **日付表記**: 既定は西暦スラッシュ。和暦が必要なら `formatDate` フックで差し替え。

### ⚠️ 初回インポート時に必ず確認すること

1. **文字コード**: 弥生（デスクトップ版）は環境によって **Shift_JIS** 前提。
   本実装は UTF-8（BOM無し）で書き出す。文字化けする場合は取込ウィザードで
   文字コードを指定するか、エンコード変換を挟む（→ 必要なら `iconv-lite` 導入を検討。
   現状は依存ゼロ方針のため未導入）。
2. **税区分名**: `課対仕入10%` 等の表記は弥生のバージョン/設定で揺れる。
   合わない場合は `YAYOI_TAX_CLASS_PURCHASE` だけ直せばよい。
3. **勘定科目名**: 借方科目（消耗品費 等）が弥生側の科目名と一致しているか。
   未登録の科目はインポート時に弾かれるので、科目名を合わせる。

## freee を足すときの指針（未実装）

freee 会計は「取引（収支）」インポート CSV を持つ。アダプタを
`expense_export.ts` に1つ足すだけでよい。検討する主な列：

- 収支区分（支出）/ 発生日 / 勘定科目 / 税区分 / 金額（税込）/ 備考 /
  決済（完了か未決済か）/ 取引先 / 品目・部門・メモタグ など

freee は税区分や口座の扱いが弥生と異なるため、`ExportAdapterOptions` に
freee 固有の設定（決済口座など）を追加して対応する。正規台帳側のデータは
そのまま使えるため、台帳フォーマットの変更は不要。
