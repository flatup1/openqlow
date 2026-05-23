import { approveRecord, rejectRecord, requestRevision, runDaily } from "./scheduler/daily.js";
import { runHealthcheckWithAlert } from "./monitor/healthcheck.js";

const [command, id, ...responseParts] = process.argv.slice(2);
const response = responseParts.join(" ");

if (!command || command === "generate") {
  const records = await runDaily();
  console.log(`Generated ${records.length} approval records.`);
  for (const record of records) {
    console.log(`${record.id}: ${record.idea.theme}`);
  }
  process.exit(0);
}

if (command === "approve") {
  if (!id || !response) {
    console.error("Usage: npm run dev -- approve <post-id> \"OK <post-id>\"");
    process.exit(1);
  }
  const saved = await approveRecord(id, response);
  console.log("Saved draft files:");
  for (const file of saved) console.log(file);
  process.exit(0);
}

if (command === "reject") {
  if (!id) {
    console.error("Usage: npm run dev -- reject <post-id> \"reason\"");
    process.exit(1);
  }
  const record = await rejectRecord(id, response || undefined);
  console.log(`Rejected ${record.id}`);
  process.exit(0);
}

if (command === "revise") {
  if (!id || !response) {
    console.error("Usage: npm run dev -- revise <post-id> \"revision note\"");
    process.exit(1);
  }
  const record = await requestRevision(id, response);
  console.log(`Revision requested for ${record.id}`);
  process.exit(0);
}

if (command === "monitor") {
  const report = await runHealthcheckWithAlert();
  process.exit(report.ok ? 0 : 1);
}

console.error(`Unknown command: ${command}`);
console.error("Commands: generate, approve <post-id> \"OK <post-id>\", reject <post-id> \"reason\", revise <post-id> \"note\", monitor");
process.exit(1);
