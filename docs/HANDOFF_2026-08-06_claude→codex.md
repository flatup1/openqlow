# HANDOFF 2026-08-06 claude → codex

未成年入会の保護者同意システム。**データ層は Claude が実装完了**、**LINE会話フローの配線は Codex へ引き継ぎ**ます。

## 1. 今やったこと

`src/crm/`（Claude担当領域）に、保護者同意のデータモデルと永続化を新設しました。

| ファイル | 内容 |
|---|---|
| `src/crm/guardian_consent.ts` | 新規。データモデル・JSONストア・18歳判定・重要事項の文言・LINE用の文面生成 |
| `src/crm/guardian_consent.test.ts` | 新規。57アサーション |
| `package.json` | `test:crm-guardian-consent` を追加し、`test` の連鎖に組み込み（1行追加のみ） |

**既存ファイルは1つも変更していません。** `prospect.ts` / `store.ts` は無変更です。同意データを `Prospect` の項目として足すと18歳以上の全レコードに空欄が増え、既存の全機能に影響が出るため、独立ストアに分離しました。

### 検証済み

```
npx tsc --noEmit                      → exit 0
npm run test:no-hardcoded-canon       → 0 violations（103ファイル走査）
npm run test:crm-prospect             → passed（回帰なし）
npm run test:crm-store                → passed（回帰なし）
npm run test:crm-guardian-consent     → passed
```

## 2. Codex にお願いしたいこと（`src/line_bot/`）

LINEトーク上の会話フロー配線です。**本モジュールは LINE API に一切依存していません**ので、そのまま呼べます。

### 画面遷移

```
入会導線
  └─ 生年月日を尋ねる  ← ★現在この工程が存在しないため新規追加が必要
       ↓
   requiresGuardianConsent(birthDate)
       ├─ false（18歳以上）→ 既存フローへ素通り（変更なし）
       └─ true（18歳未満）
            ↓
        buildImportantMattersMessage() を送信（重要事項6項目）
            ↓
        ① ☑「重要事項を確認しました」
        ② ☑「保護者として入会に同意します」
            ↓
        両方揃うまで先へ進めない（isConsentComplete が false の間は保留）
            ↓
        store.update(id, {...}) で両フラグを立てる
            ↓
        buildConsentRecordMessage(consent) を送信
        →「保護者同意を受け付けました／管理番号／同意日時／紙署名のご案内」
            ↓
        既存フローへ合流
```

### 使うAPI

```ts
import {
  openGuardianConsentStore,
  requiresGuardianConsent,
  parseBirthDate,
  isConsentComplete,
  buildImportantMattersMessage,
  buildConsentRecordMessage,
} from "../crm/guardian_consent.js";

const store = openGuardianConsentStore(<保存先パス>);

// 1) 生年月日を受けて判定
const birthDate = parseBirthDate(userInput);       // ゆるい表記を受ける／不正なら undefined
if (!requiresGuardianConsent(birthDate ?? "")) { /* 既存フローへ */ }

// 2) 同意レコードを起票（pending）
const consent = await store.create({
  externalId: lineUserId,
  minorName,
  birthDate: birthDate ?? "",
});
// → managementNumber は自動採番（FG-MC-YYYYMMDD-NNNN）

// 3) チェックが押されるたびに更新。両方揃った瞬間に consented + consentedAt が自動で入る
const updated = await store.update(consent.id, { confirmedImportantMatters: 1 });
const done    = await store.update(consent.id, { confirmedGuardianAgreement: 1 });

// 4) トークに記録を残す
if (done && isConsentComplete(done)) {
  await pushMessage(lineUserId, buildConsentRecordMessage(done));
}
```

### 保存先パスについて

`openGuardianConsentStore(filePath)` の `filePath` は未決です。既存CRMのJSON保存先と同じ流儀で決めてください。**同意記録は個人情報を含む**ため、公開ディレクトリやリポジトリ管理下に置かないでください。

## 3. 受け手への注意事項

1. **手書き署名は取りません。** JIN確定事項です。LINEは確認のみ、手書き署名は初回来館時の紙が原本。トーク上で署名画像を要求する実装にはしないでください。
2. **保護者氏名はLINEで入力を求めません。** JIN確定事項です。`guardianName` は空のままで正常。紙やCRMから判明した時点で補記する運用です。
3. **「保護者のスマホか確認する工程」は入れません。** JINが「いらない」と明示。
4. **判定不能は安全側に倒しています。** `requiresGuardianConsent("")` と不正入力は **true**（同意が必要）を返します。「読めなかったから同意を飛ばす」が最も危険なためです。この挙動を反転させないでください。
5. **重要事項の文言に金額・住所・スケジュールを足さないでください。** `test:no-hardcoded-canon` に落ちます。具体値の正本は `shared/canon.ts` です。
6. **文言を変えたら `CONSENT_TERMS_VERSION` を上げてください。** 「どの版に同意したか」を記録に焼き込んでいます。
7. **`src/crm/` は Claude 担当です。** 配線の都合で変更が要る場合は、直接編集せず JIN 経由でご連絡ください。

## 4. JIN確認待ち事項

| # | 項目 | 状態 |
|---|---|---|
| 1 | `src/shared/` に重要事項の文言を置くか | **未承認**。`COORDINATION.md` の担当表に `src/shared/` の記載がないため、暫定的に `guardian_consent.ts` 内に置いた。§8に従い、移すなら先に担当表へ追記が必要 |
| 2 | 同意記録JSONの保存先パス | **未決** |
| 3 | 管理画面からの確認方法 | **未着手**。当初依頼にあったが、今回は「LINEトークに残す」方針が採用されたため未実装。必要なら `crm_cli.ts` にサブコマンドを足すのが最小 |
| 4 | 紙の同意書の様式 | **未作成**。原本となる書面のため、文面はJIN確認が必要 |
| 5 | commit / push | **未実施**。`AGENTS.md` によりオーナー明示承認が必要 |

## 5. 未完了で残したこと

- LINE会話フローの配線一式（本ハンドオフの依頼内容）
- 生年月日の入力工程そのもの（現在の入会導線に存在しない）
- 紙の同意書の様式作成
- 管理画面／CLIでの一覧確認

---

作成: Claude（2026-08-06）
