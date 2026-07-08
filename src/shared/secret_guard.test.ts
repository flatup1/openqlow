import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, hasSecret } from "./secret_guard.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 検出ロジックの単体テスト ---
assert(hasSecret("OPENROUTER_API_KEY=sk-or-v1-0123456789abcdef0123456789abcdef"), "openrouter key detected");
assert(hasSecret("key: AIzaSyA0123456789abcdefghijklmnopqrstuvw"), "google key detected");
assert(hasSecret("-----BEGIN OPENSSH PRIVATE KEY-----"), "private key detected");
assert(hasSecret("token=ghp_0123456789abcdefghijklmnopqrstuvwxyz"), "github token detected");
assert(scanText("ただの日本語と数字 12345 と FLATUP_CANON").length === 0, "clean text has no findings");
// プレースホルダ（.env.example の空値）は誤検知しない
assert(!hasSecret("OPENROUTER_API_KEY="), "empty placeholder is not a secret");
assert(!hasSecret("LINE_CHANNEL_ACCESS_TOKEN=<your token>"), "angle-bracket placeholder is not a secret");

// --- リポジトリ実スキャン: src/ と主要設定に本物の鍵が無いことを保証 ---
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "data", "logs", "reports"]);

function walk(dir: string, exts: string[], out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some(e => name.endsWith(e))) out.push(full);
  }
}

const files: string[] = [];
walk(path.join(repoRoot, "src"), [".ts"], files);
walk(path.join(repoRoot, "port"), [".ts"], files);
// 設定・スクリプト・ドキュメントも走査（鍵が紛れやすい死角を塞ぐ）。
walk(path.join(repoRoot, "deploy"), [".sh", ".conf", ".service", ".timer", ".yml", ".yaml", ".env", ".example"], files);
walk(path.join(repoRoot, "scripts"), [".sh", ".mjs", ".js"], files);
walk(path.join(repoRoot, "docs"), [".md"], files);
for (const f of ["package.json", ".env.example", "README.md", "AGENTS.md", "COORDINATION.md"]) {
  try { statSync(path.join(repoRoot, f)); files.push(path.join(repoRoot, f)); } catch { /* skip */ }
}

const leaks: string[] = [];
for (const f of files) {
  // このガード自身のパターン定義／テストの検証用ダミーは除外
  if (f.endsWith("secret_guard.ts") || f.endsWith("secret_guard.test.ts")) continue;
  const findings = scanText(readFileSync(f, "utf8"));
  if (findings.length) leaks.push(`${path.relative(repoRoot, f)}: ${findings.map(x => x.kind).join(",")}`);
}
assert(leaks.length === 0, `committed secrets found:\n${leaks.join("\n")}`);

console.log(`secret_guard tests passed (scanned ${files.length} files, 0 leaks)`);
