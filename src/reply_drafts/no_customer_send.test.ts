// 顧客への送信経路が「存在しない」ことを、コードそのもので確かめる（要件 §4.2 / §53）。
//
// 設定でオフにするのではなく、送るためのコードを書かない。だからこのテストは
// 振る舞いではなく実装を読む。将来だれかが送信コードを足したら、ここで落ちる。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ForbiddenActionError } from "../safety/forbidden_actions.js";
import { pushLineMessage } from "../line_bot/notifier.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// フォルダの下まで全部読む。
// 直下だけを見ていたときは、src/reply_drafts/senders/customer.ts に
// sendCustomerReply と api.line.me を置いても、このテストは通ってしまった。
// 「この保証はここまでしか見ていません」という穴を残さない。
async function collectSources(dir: string, prefix = ""): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [name, text] of await collectSources(path.join(dir, entry.name), relative)) {
        found.set(name, text);
      }
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    found.set(relative, await fs.readFile(path.join(dir, entry.name), "utf8"));
  }
  return found;
}

// この検査そのものが「どこまで見ているか」を先に確かめる。
// 直下しか見ていなかったとき、サブフォルダに置いた顧客送信コードは素通りした。
// 検査の範囲が縮んだことに気づけないのが、いちばん危ない。
{
  const probe = await fs.mkdtemp(path.join(os.tmpdir(), "no-send-scan-"));
  await fs.mkdir(path.join(probe, "nested", "deeper"), { recursive: true });
  await fs.writeFile(path.join(probe, "top.ts"), "export const a = 1;\n", "utf8");
  await fs.writeFile(path.join(probe, "nested", "deeper", "hidden.ts"), "export const b = 2;\n", "utf8");
  await fs.writeFile(path.join(probe, "nested", "skip.test.ts"), "export const c = 3;\n", "utf8");

  const scanned = await collectSources(probe);
  assert(scanned.has("top.ts"), "直下のファイルを見ている");
  assert(scanned.has("nested/deeper/hidden.ts"), "フォルダの奥まで見ている");
  assert(!scanned.has("nested/skip.test.ts"), "テストファイルは検査対象にしない");

  await fs.rm(probe, { recursive: true, force: true });
}

const sources = await collectSources(moduleDir);
assert(sources.size > 0, "実装ファイルが読めている");
// 直下のファイルを確実に見ていること（読み取りが壊れて0件検査にならないように）。
for (const required of ["draft.ts", "notify.ts", "pipeline.ts", "line_intake.ts"]) {
  assert(sources.has(required), `${required} を検査対象にできている`);
}

// 顧客へ届きうる送信手段そのものを持たない。
const FORBIDDEN_IN_MODULE: Array<[RegExp, string]> = [
  [/https?:\/\/api\.line\.me/, "LINE APIを直接叩かない"],
  [/\breplyLineMessage\b/, "LINEの返信（reply token）は使わない"],
  [/\bline_bot\/reply\.js\b/, "返信モジュールを読み込まない"],
  [/\breplyToken\b/, "返信トークンを扱わない"],
  [/\bnodemailer\b|\bsendMail\b|\bcreateTransport\b|\bsmtp\b/i, "メール送信の仕組みを持たない"],
  [/\bgmail\.users\.messages\.(send|insert)\b|\bmessages\/send\b/, "Gmail送信を持たない"],
  [/\bsendCustomerReply\b|\bsendLineMessageToCustomer\b|\bautoReply\b/, "顧客送信用の関数を作らない"],
  [/\bfetch\s*\(/, "この機能から直接ネットワークへ出さない"],
];

for (const [name, source] of sources) {
  // コメントで禁止事項を説明している行は検査対象から外す（説明文で落ちないように）。
  const code = source
    .split("\n")
    .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
  for (const [pattern, reason] of FORBIDDEN_IN_MODULE) {
    assert(!pattern.test(code), `${name}: ${reason}（${pattern}）`);
  }
}

// LINEへ出る唯一の経路は notify.ts の pushLineMessage で、宛先を渡さない。
const notifySource = sources.get("notify.ts") ?? "";
assert(/from "\.\.\/line_bot\/notifier\.js"/.test(notifySource), "通知は既存の notifier を使う");
assert(/pushLineMessage\(text\)/.test(notifySource), "宛先を指定せずJIN既定へ送る");
assert(!/userId/.test(notifySource), "notify.ts は宛先IDを一切扱わない");

for (const [name, source] of sources) {
  if (name === "notify.ts") continue;
  assert(!/line_bot\/notifier\.js/.test(source), `${name}: 送信は notify.ts 以外から呼ばない`);
}

// 受け口は常に「お客様へ返信しない」。true を書けないことを実装で確かめる。
const intakeSource = sources.get("line_intake.ts") ?? "";
assert(/replyToSender: false/.test(intakeSource), "受け口は replyToSender: false を返す");
assert(!/replyToSender:\s*true/.test(intakeSource), "受け口が true を返す分岐は無い");

// 物理ロックが生きていること。承認された宛先以外へ送ろうとしたら例外で止まる。
let blocked = false;
try {
  await pushLineMessage("test", {
    token: "dummy-token",
    userId: "U-customer",
    approvedRecipients: new Set(["U-jin"]),
    dryRun: true,
  });
} catch (error) {
  blocked = error instanceof ForbiddenActionError;
}
assert(blocked, "承認されていない宛先への送信は例外で止まる");

console.log("reply_drafts no_customer_send tests passed");
