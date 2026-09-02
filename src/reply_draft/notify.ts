// JINへ届くLINE本文と、Obsidian・ローカルに残すログを組み立てる。
//
// LINEは結論だけ。「何件来たか」「そのまま送れる文があるか」「全文はどこか」。
// 送るのはJINなので、本文の最後に必ずそう書く。

import { sanitiseFreeText } from "../privacy/rules.js";
import type { ReplyDraft } from "./draft.js";

const LINE_SAFE_CHARS = 4500;
/** 通知に載せる下書きの抜粋の長さ。全文はファイルで読む。 */
const EXCERPT_CHARS = 120;

const SOURCE_LABEL: Record<string, string> = { line: "LINE", gmail: "Gmail" };

function excerpt(text: string, limit = EXCERPT_CHARS): string {
  const oneLine = text.replace(/\s*\n\s*/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

export interface NotificationOptions {
  /** 1通に載せる上限 */
  maxPerRun: number;
  /** 全文の置き場（通知の最後に出す） */
  detailPath: string;
  /** 日付（JST） */
  dateJst: string;
  /** 時刻表示（HH:MM） */
  timeJst: string;
}

/** JINのLINEに届く本文。送信はしない、と必ず書く。 */
export function buildDraftNotification(drafts: ReplyDraft[], opts: NotificationOptions): string {
  const shown = drafts.slice(0, opts.maxPerRun);
  const rest = drafts.length - shown.length;
  const readyCount = drafts.filter(draft => !draft.needsHuman).length;
  const humanCount = drafts.length - readyCount;

  const lines: string[] = [
    `【返信の下書き】${opts.dateJst} ${opts.timeJst}`,
    `新着 ${drafts.length}件（そのまま送れる ${readyCount}件 / JIN確認 ${humanCount}件）`,
    "",
  ];

  shown.forEach((draft, index) => {
    const source = SOURCE_LABEL[draft.source] ?? draft.source;
    const priority = draft.classification ? ` ／ 優先度${draft.classification.priority}` : "";
    lines.push(`${index + 1}. ${source}${priority}`);
    lines.push(`「${excerpt(draft.inboundText, 60)}」`);
    if (draft.needsHuman) {
      lines.push(`→ JIN確認（${draft.humanReason ?? "理由不明"}）。下書きは作っていません。`);
    } else {
      lines.push("下書き:");
      lines.push(excerpt(draft.draftText ?? ""));
    }
    lines.push("");
  });

  if (rest > 0) lines.push(`ほか ${rest}件`, "");

  lines.push(`全文: ${opts.detailPath}`, "※ AIは送っていません。送るのはJINです。");

  const message = sanitiseFreeText(lines.join("\n"));
  return message.length > LINE_SAFE_CHARS ? `${message.slice(0, LINE_SAFE_CHARS)}…` : message;
}

/** その日ぶんの記録。原文と下書きをそのまま残す（要約しない）。 */
export function buildDraftLog(drafts: ReplyDraft[], dateJst: string): string {
  const lines: string[] = [
    `# 返信の下書き ${dateJst}`,
    "",
    "- 状態: **未送信**（openQLOWが作成。送信はJINが行う）",
    `- 件数: ${drafts.length}件（そのまま送れる ${drafts.filter(d => !d.needsHuman).length}件）`,
    "",
  ];

  if (drafts.length === 0) {
    lines.push("- 今日はまだ新着がありません。", "");
    return lines.join("\n");
  }

  for (const draft of drafts) {
    const source = SOURCE_LABEL[draft.source] ?? draft.source;
    lines.push(`## ${draft.receivedAt} ${source} ${draft.id}`, "");
    lines.push("- 状態: 未送信（下書き）");
    lines.push(`- 相手: ${draft.maskedSender}`);
    if (draft.classification) {
      lines.push(
        `- 仕分け: ${draft.classification.purpose} ／ 優先度${draft.classification.priority} ／ 次の一手: ${draft.classification.nextAction}`,
      );
    }
    if (draft.qualityScore !== undefined) lines.push(`- 返信品質: ${draft.qualityScore}点`);
    lines.push("", "### もらった内容（原文）", "", draft.inboundText, "");

    if (draft.needsHuman) {
      lines.push("### 返信の下書き", "", `（作っていません。理由: ${draft.humanReason ?? "不明"}）`, "");
    } else {
      lines.push("### 返信の下書き", "", draft.draftText ?? "", "");
      if (draft.shortDraftText) lines.push("#### 短い版", "", draft.shortDraftText, "");
    }
  }

  lines.push("---", "", "料金・時間は正本（src/shared/canon.ts）どおり。送るのはJIN。", "");
  return sanitiseFreeText(lines.join("\n"));
}
