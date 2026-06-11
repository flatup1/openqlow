// CLI: 保存したサイトのテキスト/HTML を読み込み、改善チェック結果を表示する。
//
//   npm run site-audit -- --file ./index.html
//   npm run site-audit -- --label トップページ --file ./index.html
//   cat index.html | npm run site-audit -- --label トップページ
//
// ネットワーク取得は行わない。サイトのHTMLを保存するか、ページのテキストを貼って渡す。
// 改善の最終判断は人間が行う。

import { readFile } from "node:fs/promises";
import { auditSite, type AuditSeverity, type SiteAuditInput } from "./site_audit.js";
import { parseFlags } from "./shared.js";

const SEVERITY_MARK: Record<AuditSeverity, string> = {
  good: "✅",
  warn: "⚠",
  missing: "❌",
};

export function parseArgs(argv: string[]): { file?: string; label?: string } {
  const { flags } = parseFlags(argv);
  const out: { file?: string; label?: string } = {};
  if (flags.file) out.file = flags.file;
  if (flags.label) out.label = flags.label;
  return out;
}

export function renderResult(input: SiteAuditInput): string {
  const result = auditSite(input);
  const lines: string[] = [
    `============ FLATUP集客AI司令塔 / サイト改善チェック（${result.pageLabel}） ============`,
    "",
    result.summary,
  ];
  for (const f of result.findings) {
    lines.push("");
    lines.push(`${SEVERITY_MARK[f.severity]} ${f.area}: ${f.message}`);
    if (f.suggestion) lines.push(`   → 改善案: ${f.suggestion}`);
  }
  lines.push("");
  lines.push("■ 注意");
  lines.push(result.notes.map(n => `- ${n}`).join("\n"));
  lines.push("=====================================================================");
  return lines.join("\n");
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const invokedDirectly = process.argv[1]?.endsWith("site_audit_cli.ts");
if (invokedDirectly) {
  const { file, label } = parseArgs(process.argv.slice(2));
  const content = file ? await readFile(file, "utf8") : await readStdin();
  if (!content.trim()) {
    console.error("Usage: npm run site-audit -- --file <path> [--label <ページ名>]   (または HTML を標準入力で渡す)");
    process.exit(1);
  }
  console.log(renderResult({ content, pageLabel: label }));
  process.exit(0);
}
