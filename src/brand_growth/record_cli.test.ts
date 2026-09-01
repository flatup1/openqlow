// Brand Growth Phase 4: 人が費用・実測値を記録する最小CLIの受入試験。
//
// 外部API、LINE、publishには接続しない。書き込みは一時ディレクトリだけ。

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runRecordCli } from "./record_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function withTempRepo(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "brand-growth-record-cli-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// 本番integration callerの運用条件: absolute repository root は必須。
{
  const missing = await runRecordCli(["metric"]);
  assert(missing.exit_code === 2, `missing repository root exit: ${missing.exit_code}`);
  assert(missing.error_code === "missing_flag", `missing repository root code: ${missing.error_code}`);

  const relative = await runRecordCli([
    "metric",
    "--repository-root",
    "relative/repo",
  ]);
  assert(relative.exit_code === 2, `relative repository root exit: ${relative.exit_code}`);
  assert(relative.error_code === "relative_repository_root", `relative root code: ${relative.error_code}`);
}

// 生成1回の費用と、人が見た usable 判定を追記できる。
await withTempRepo(async repositoryRoot => {
  const result = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_attempt_001",
    "--attempt-id", "attempt_001",
    "--created-at", "2026-08-29T01:00:00Z",
    "--created-by", "owner",
    "--status", "succeeded",
    "--cost-jpy", "120",
    "--usability", "usable",
    "--assessed-by", "human",
  ]);

  assert(result.exit_code === 0, `attempt exit: ${result.exit_code} ${result.message}`);
  assert(result.stream === "generation_attempts", `attempt stream: ${result.stream}`);

  const file = path.join(repositoryRoot, "runtime", "brand_growth", "generation_attempts.jsonl");
  const lines = (await readFile(file, "utf8")).trim().split("\n");
  assert(lines.length === 1, `attempt lines: ${lines.length}`);
  const stored = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  const payload = stored.payload as Record<string, unknown>;
  assert(stored.event_type === "generation_attempt_cost_recorded", `attempt event type: ${stored.event_type}`);
  assert(payload.attempt_id === "attempt_001", `attempt id: ${payload.attempt_id}`);
  assert((payload.provider_cost as Record<string, unknown>).amount_minor === 120, "JPY amount recorded");
});

// 費用が分からない場合は0円にせず null として記録できる。
await withTempRepo(async repositoryRoot => {
  const result = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_attempt_unknown_cost",
    "--attempt-id", "attempt_unknown_cost",
    "--created-at", "2026-08-29T01:10:00Z",
    "--created-by", "owner",
    "--status", "failed",
    "--usability", "rejected",
    "--assessed-by", "human",
  ]);
  assert(result.exit_code === 0, `unknown cost exit: ${result.exit_code}`);
  const file = path.join(repositoryRoot, "runtime", "brand_growth", "generation_attempts.jsonl");
  const stored = JSON.parse((await readFile(file, "utf8")).trim()) as Record<string, unknown>;
  const payload = stored.payload as Record<string, unknown>;
  assert(payload.provider_cost === null, "unknown cost must stay null");
});

// 投稿後の実測値を、分からない項目は null のまま追記できる。
await withTempRepo(async repositoryRoot => {
  const result = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_metric_001",
    "--snapshot-id", "metric_001",
    "--publication-id", "publication_001",
    "--captured-at", "2026-08-30T01:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T01:01:00Z",
    "--evidence", "instagram_insights_24h",
    "--window", "24h",
    "--views", "800",
    "--line-adds", "4",
    "--trial-inquiries", "2",
  ]);

  assert(result.exit_code === 0, `metric exit: ${result.exit_code} ${result.message}`);
  assert(result.stream === "metric_snapshots", `metric stream: ${result.stream}`);

  const file = path.join(repositoryRoot, "runtime", "brand_growth", "metric_snapshots.jsonl");
  const stored = JSON.parse((await readFile(file, "utf8")).trim()) as Record<string, unknown>;
  const snapshot = stored.payload as Record<string, unknown>;
  const values = snapshot.values as Record<string, unknown>;
  assert(values.views === 800, `views: ${values.views}`);
  assert(values.line_adds === 4, `line adds: ${values.line_adds}`);
  assert(values.trial_inquiries === 2, `trial inquiries: ${values.trial_inquiries}`);
  assert(values.enrollments === null, "unknown enrollment must stay null");
});

// 同じ明示入力は同じ論理記録になる（保存先だけ一時ディレクトリごとに違う）。
{
  const writes: string[] = [];
  const args = [
    "metric",
    "--repository-root", "/example/repo",
    "--event-id", "evt_deterministic",
    "--snapshot-id", "metric_deterministic",
    "--publication-id", "publication_deterministic",
    "--captured-at", "2026-08-30T02:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T02:01:00Z",
    "--evidence", "insights_24h",
    "--window", "24h",
    "--views", "10",
  ];
  const deps = {
    append: async (_root: string, _stream: string, event: unknown): Promise<string> => {
      writes.push(JSON.stringify(event));
      return "/tmp/not-written.jsonl";
    },
  };
  const first = await runRecordCli(args, deps);
  const second = await runRecordCli(args, deps);
  assert(first.exit_code === 0 && second.exit_code === 0, "deterministic calls pass");
  assert(writes.length === 2 && writes[0] === writes[1], "same explicit input creates same event");
}

// 不正な数値はファイルを作る前に止まる。
await withTempRepo(async repositoryRoot => {
  const invalid = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_invalid",
    "--snapshot-id", "metric_invalid",
    "--publication-id", "publication_invalid",
    "--captured-at", "2026-08-30T01:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T01:01:00Z",
    "--evidence", "insights",
    "--window", "24h",
    "--views", "1.5",
  ]);
  assert(invalid.exit_code === 2, `fractional count exit: ${invalid.exit_code}`);
  assert(invalid.error_code === "invalid_number", `fractional count code: ${invalid.error_code}`);
});

// usable / rejected は誰が判定したか必須。省略して安さを誤集計させない。
await withTempRepo(async repositoryRoot => {
  const invalid = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_missing_assessor",
    "--attempt-id", "attempt_missing_assessor",
    "--created-at", "2026-08-29T03:00:00Z",
    "--created-by", "owner",
    "--status", "succeeded",
    "--cost-jpy", "100",
    "--usability", "usable",
  ]);
  assert(invalid.exit_code === 2, `missing assessor exit: ${invalid.exit_code}`);
  assert(invalid.error_code === "missing_flag", `missing assessor code: ${invalid.error_code}`);
  assert(!existsSync(path.join(repositoryRoot, "runtime")), "invalid attempt must not create runtime directory");
});

// 個人情報と秘密情報は、ファイルに1バイトも触れる前に止まる。
await withTempRepo(async repositoryRoot => {
  const personalAddress = ["owner", "example.test"].join("@");
  const pii = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_pii",
    "--snapshot-id", "metric_pii",
    "--publication-id", "publication_pii",
    "--captured-at", "2026-08-30T03:00:00Z",
    "--entered-by", personalAddress,
    "--entered-at", "2026-08-30T03:01:00Z",
    "--evidence", "insights",
    "--window", "24h",
    "--views", "10",
  ]);
  assert(pii.exit_code === 2, `PII exit: ${pii.exit_code}`);
  assert(pii.error_code === "pii_in_record", `PII code: ${pii.error_code}`);
  assert(!existsSync(path.join(repositoryRoot, "runtime")), "PII must not create runtime directory");

  const fakeSecret = ["ghp", "0123456789abcdefghijklmnopqrstuvwxyz"].join("_");
  const secret = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_secret",
    "--snapshot-id", "metric_secret",
    "--publication-id", "publication_secret",
    "--captured-at", "2026-08-30T03:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T03:01:00Z",
    "--evidence", fakeSecret,
    "--window", "24h",
    "--views", "10",
  ]);
  assert(secret.exit_code === 2, `secret exit: ${secret.exit_code}`);
  assert(secret.error_code === "secret_in_record", `secret code: ${secret.error_code}`);
  assert(!existsSync(path.join(repositoryRoot, "runtime")), "secret must not create runtime directory");
});

console.log("brand_growth record CLI tests passed");
