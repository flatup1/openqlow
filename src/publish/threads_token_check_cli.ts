import { checkThreadsToken } from "./threads_token_check.js";

// `npm run threads:check` で実行。env の THREADS_ACCESS_TOKEN が有効かを確認し、
// THREADS_USER_ID と実際の id がずれていないかも警告する。
const result = await checkThreadsToken({ accessToken: process.env.THREADS_ACCESS_TOKEN ?? "" });

if (result.ok) {
  console.log(`✅ Threadsトークン有効: @${result.username ?? "?"} (id=${result.id ?? "?"})`);
  const envUserId = process.env.THREADS_USER_ID ?? "";
  if (envUserId && result.id && envUserId !== result.id) {
    console.log(`⚠️ THREADS_USER_ID がずれています: env=${envUserId} / 実際=${result.id}`);
    console.log(`   → set_env THREADS_USER_ID "${result.id}" で合わせてください。`);
  }
} else {
  console.log(`❌ Threadsトークン無効: ${result.error}`);
  console.log("   → graph.threads.net の「Generate Threads Access Token」で取り直し、長命化して env に入れてください。");
  process.exitCode = 1;
}
