import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import type { DraftRecord, SafetyResult } from "../types.js";

function vaultLogPath(date: string): string {
  const config = loadConfig();
  return path.join(config.obsidianVaultRoot, "6_システム", "openqlow_logs", `${date}.md`);
}

async function appendBlock(file: string, block: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${block}\n`, "utf8");
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function logGeneration(records: DraftRecord[], safetyByRecord: Map<string, SafetyResult>): Promise<string> {
  if (records.length === 0) return "";
  const date = records[0]!.idea.date;
  const file = vaultLogPath(date);

  const lines: string[] = [];
  const isFirstWriteHint = `# OPENQLOW ログ ${date}`;
  lines.push(isFirstWriteHint);
  lines.push("");
  lines.push(`## 生成 ${nowIso()}`);
  lines.push("");
  for (const record of records) {
    const safety = safetyByRecord.get(record.id);
    const score = safety?.kindnessScore.total ?? "?";
    const decision = safety?.kindnessScore.decision ?? "?";
    lines.push(`### ${record.id}`);
    lines.push(`- テーマ: ${record.idea.theme}`);
    lines.push(`- 角度: ${record.idea.angle}`);
    lines.push(`- 価値接続: ${record.idea.valueConnection}`);
    if (record.idea.canonReferences?.length) {
      lines.push(`- 正本参照:`);
      for (const ref of record.idea.canonReferences) {
        lines.push(`  - ${ref.layer}: ${ref.canonPath} (${ref.description})`);
      }
    } else {
      lines.push(`- 正本参照: 未設定`);
    }
    lines.push(`- 優しさスコア: ${score}/25 (${decision})`);
    lines.push(`- 媒体: ${record.drafts.map(d => d.platform).join(" / ")}`);
    if (safety && !safety.ok) {
      lines.push(`- 安全チェック: 要確認`);
      for (const issue of safety.issues) {
        lines.push(`  - [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    } else {
      lines.push(`- 安全チェック: OK`);
    }
    lines.push("");
  }

  await appendBlock(file, lines.join("\n"));
  return file;
}

export async function logApproval(recordId: string, approvalReply: string, savedFiles: string[], date: string): Promise<string> {
  const file = vaultLogPath(date);
  const lines = [
    `## 承認 ${nowIso()}`,
    `- 投稿ID: ${recordId}`,
    `- 承認文: \`${approvalReply}\``,
    `- 保存先:`,
    ...savedFiles.map(f => `  - ${f}`),
    "",
  ];
  await appendBlock(file, lines.join("\n"));
  return file;
}

export async function logRejection(recordId: string, date: string, reason?: string): Promise<string> {
  const file = vaultLogPath(date);
  const lines = [
    `## 却下 ${nowIso()}`,
    `- 投稿ID: ${recordId}`,
    reason ? `- 理由: ${reason}` : "- 理由: (記録なし)",
    "",
  ];
  await appendBlock(file, lines.join("\n"));
  return file;
}

export async function logRevision(recordId: string, date: string, note: string): Promise<string> {
  const file = vaultLogPath(date);
  const lines = [
    `## 修正依頼 ${nowIso()}`,
    `- 投稿ID: ${recordId}`,
    `- コメント: ${note}`,
    "",
  ];
  await appendBlock(file, lines.join("\n"));
  return file;
}
