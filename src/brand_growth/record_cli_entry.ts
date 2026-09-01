// npm run brand-growth:record の入口。
// 実際の読み書きは record_cli.ts → storage/event_store.ts の承認済み境界だけを通る。

import { runRecordCli } from "./record_cli.js";

const result = await runRecordCli(process.argv.slice(2));
if (result.exit_code === 0) {
  console.log(result.message);
  if (result.file !== null) console.log(`保存先: ${result.file}`);
} else {
  console.error(`記録できませんでした [${result.error_code}]: ${result.message}`);
}
process.exitCode = result.exit_code;
