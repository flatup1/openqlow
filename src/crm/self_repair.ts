// 自己修復ログ（エラーを記録し、修復案を出すだけ。自動修復はしない）
//
// 指示書の log_error / build_repair_suggestion に対応。
// この段階では「検知 → 記録 → 人間向けの修復案提示」までで、自動修復は行わない。

import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export type ErrorType =
  | "api_error"
  | "api_insufficient_balance"
  | "line_webhook_error"
  | "db_save_error"
  | "obsidian_save_error"
  | "reply_generation_failed"
  | "reservation_url_error"
  | "disk_full"
  | "cron_failed"
  | "unknown";

interface RepairAdvice {
  scope: string;
  cause: string;
  fix: string;
  humanCheck: string;
}

const ADVICE: Record<ErrorType, RepairAdvice> = {
  api_error: {
    scope: "AI返信生成・日報のAIコメント",
    cause: "APIキー誤り／レート制限／プロバイダ障害の可能性。",
    fix: "APIキーと残高を確認し、数分後に再試行。失敗時はルールベース生成にフォールバック。",
    humanCheck: "APIキーの有効性とプラン上限。",
  },
  api_insufficient_balance: {
    scope: "AI返信生成全般",
    cause: "APIクレジット残高不足。",
    fix: "残高をチャージするか、当面はルールベースのテンプレ生成で運用する。",
    humanCheck: "課金状況・支払い方法。",
  },
  line_webhook_error: {
    scope: "LINE受信→記録フロー",
    cause: "署名検証失敗／エンドポイント未到達／トークン失効。",
    fix: "Webhook URLとチャネルトークンを確認。openQLOW側は受信失敗を記録するのみ。",
    humanCheck: "LINE Developers のWebhook設定とトークン。",
  },
  db_save_error: {
    scope: "見込み客の保存",
    cause: "保存先ディレクトリの権限不足／パス誤り／ディスク不足。",
    fix: "保存先のパスと書き込み権限を確認。JSONが壊れていればバックアップから復元。",
    humanCheck: "data ディレクトリの権限・空き容量。",
  },
  obsidian_save_error: {
    scope: "日報・CRMログのObsidian保存",
    cause: "Vaultパス未マウント／権限不足。",
    fix: "Vaultのパスを確認。保存できない場合はローカルreports/に退避する。",
    humanCheck: "Obsidian Vaultのパス設定。",
  },
  reply_generation_failed: {
    scope: "AIKA返信文の生成",
    cause: "入力（問い合わせ文）が空、または想定外の形式。",
    fix: "入力を検証し、空ならテンプレ文を提示。例外時もアプリは落とさない。",
    humanCheck: "対象見込み客の inquiry_text。",
  },
  reservation_url_error: {
    scope: "体験予約導線",
    cause: "予約URLのリンク切れ／フォーム停止。",
    fix: "予約URLの有効性を確認し、暫定でLINE誘導に切り替える。",
    humanCheck: "予約フォーム/URLの稼働状況。",
  },
  disk_full: {
    scope: "保存処理全般",
    cause: "サーバーの空き容量不足。",
    fix: "古いログ・レポートを退避し容量を確保。保存はリトライ。",
    humanCheck: "ディスク使用率。",
  },
  cron_failed: {
    scope: "日次バッチ（日報生成・追客抽出）",
    cause: "スケジューラ未起動／前段処理の失敗。",
    fix: "cron/systemdタイマーの稼働を確認し、手動で日報生成を再実行。",
    humanCheck: "タイマーのstatusと直近ログ。",
  },
  unknown: {
    scope: "不明",
    cause: "分類できないエラー。",
    fix: "エラーメッセージとコンテキストを確認し、再現条件を特定する。",
    humanCheck: "発生時の操作と入力。",
  },
};

/** エラー種別から修復案（人間確認前提）を組み立てる。自動修復はしない。 */
export function buildRepairSuggestion(
  errorType: ErrorType,
  errorMessage: string,
  context?: string,
): { advice: RepairAdvice; markdown: string; at: string } {
  const advice = ADVICE[errorType] ?? ADVICE.unknown;
  const at = new Date().toISOString();
  const markdown = [
    "# Self Repair Log",
    `## 発生時刻\n${at}`,
    `## エラー種別\n${errorType}`,
    `## エラー内容\n${errorMessage || "(メッセージなし)"}`,
    `## 影響範囲\n${advice.scope}`,
    `## 推定原因\n${advice.cause}`,
    `## 修復案\n${advice.fix}`,
    `## 人間確認が必要な項目\n- ${advice.humanCheck}${context ? `\n- 補足: ${context}` : ""}`,
    "",
    "> 注: この段階では自動修復は行いません。記録と修復案の提示のみです。",
    "",
  ].join("\n\n");
  return { advice, markdown, at };
}

export interface LogErrorResult {
  filePath: string;
  markdown: string;
}

/**
 * エラーを logs/self_repair/YYYY-MM-DD_error.md に追記する。
 * @param baseDir リポジトリ/データのベースディレクトリ
 */
export async function logError(
  errorType: ErrorType,
  errorMessage: string,
  context: string | undefined,
  baseDir: string,
): Promise<LogErrorResult> {
  const { markdown, at } = buildRepairSuggestion(errorType, errorMessage, context);
  const dir = path.join(baseDir, "logs", "self_repair");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${at.slice(0, 10)}_error.md`);
  await appendFile(filePath, markdown + "\n---\n\n", "utf8");
  return { filePath, markdown };
}
