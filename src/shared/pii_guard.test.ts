import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPii, hasPii } from "./pii_guard.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 検出ロジックの単体テスト（ダミーの個人情報を使う） ---
assert(hasPii("連絡先は 090-1234-5678 です"), "phone with separators detected");
assert(hasPii("メールは test@example.com まで"), "email detected");
assert(hasPii("userId: Uaa10d8962ee00789c2a52cfa01a94cff"), "LINE userId detected");

// --- 誤検知しないこと（PIIではない数字・IP・日付・正本の料金） ---
assert(!hasPii("ただの日本語と数字 12345 と FLATUP_CANON"), "clean text has no PII");
assert(!hasPii("VPSは 162.43.41.182 で稼働"), "IP address is not PII");
assert(!hasPii("更新: 2026-06-27 / 営業 10:00-22:00"), "date and hours are not PII");
assert(!hasPii("初回体験500円、月会費9,900円"), "prices are not PII");
assert(!hasPii("成田駅から徒歩約5分"), "access text is not PII");

// --- リポジトリ実スキャン: src/ に個人情報の直書きが無いことを保証 ---
// テストファイル(*.test.ts)はダミーPIIを意図的に含むため走査対象から除外する。
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "data", "logs", "reports"]);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
}

const files: string[] = [];
walk(path.join(repoRoot, "src"), files);

const leaks: string[] = [];
for (const f of files) {
  // このガード自身のパターン定義は除外（正規表現が一致してしまうため）。
  if (f.endsWith("pii_guard.ts")) continue;
  const findings = scanPii(readFileSync(f, "utf8"));
  if (findings.length) leaks.push(`${path.relative(repoRoot, f)}: ${findings.map(x => x.kind).join(",")}`);
}
assert(leaks.length === 0, `committed PII found:\n${leaks.join("\n")}`);

console.log(`pii_guard tests passed (scanned ${files.length} files, 0 PII)`);
