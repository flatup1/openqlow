// Brand Growth Phase 4: 人が費用・実測値を記録する最小CLIの受入試験。
//
// 外部API、LINE、publishには接続しない。書き込みは一時ディレクトリだけ。

import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const missingContent = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_missing_content",
    "--attempt-id", "attempt_missing_content",
    "--created-at", "2026-08-29T00:59:00Z",
    "--created-by", "owner",
    "--status", "succeeded",
    "--cost-jpy", "100",
    "--usability", "usable",
    "--assessed-by", "human",
  ]);
  assert(missingContent.exit_code === 2, `missing content exit: ${missingContent.exit_code}`);
  assert(missingContent.error_code === "missing_flag", `missing content code: ${missingContent.error_code}`);
  assert(!existsSync(path.join(repositoryRoot, "runtime")), "missing content must not create runtime directory");

  const missingMetricContent = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_metric_missing_content",
    "--snapshot-id", "metric_missing_content",
    "--publication-id", "publication_missing_content",
    "--captured-at", "2026-08-30T00:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T00:01:00Z",
    "--evidence", "insights",
    "--window", "24h",
  ]);
  assert(missingMetricContent.exit_code === 2, `missing metric content exit: ${missingMetricContent.exit_code}`);
  assert(missingMetricContent.error_code === "missing_flag", `missing metric content code: ${missingMetricContent.error_code}`);
  assert(!existsSync(path.join(repositoryRoot, "runtime")), "missing metric content must not create runtime directory");
});

await withTempRepo(async repositoryRoot => {
  const result = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_attempt_001",
    "--content-id", "content_001",
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
  assert(payload.content_id === "content_001", `attempt content id: ${payload.content_id}`);
  assert(payload.attempt_id === "attempt_001", `attempt id: ${payload.attempt_id}`);
  assert((payload.provider_cost as Record<string, unknown>).amount_minor === 120, "JPY amount recorded");
});

// 費用が分からない場合は0円にせず null として記録できる。
await withTempRepo(async repositoryRoot => {
  const result = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_attempt_unknown_cost",
    "--content-id", "content_unknown_cost",
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
    "--content-id", "content_001",
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
  assert(snapshot.content_id === "content_001", `metric content id: ${snapshot.content_id}`);
});

// 同じ明示入力は同じ論理記録になる（保存先だけ一時ディレクトリごとに違う）。
{
  const writes: string[] = [];
  const args = [
    "metric",
    "--repository-root", "/example/repo",
    "--event-id", "evt_deterministic",
    "--content-id", "content_deterministic",
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
    "--content-id", "content_invalid",
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
    "--content-id", "content_missing_assessor",
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
    "--content-id", "content_pii",
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
    "--content-id", "content_secret",
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

// summary は費用と投稿後の成果を、人が1画面で読める形にまとめる。
await withTempRepo(async repositoryRoot => {
  const empty = await runRecordCli(["summary", "--repository-root", repositoryRoot]);
  assert(empty.exit_code === 0, `empty summary exit: ${empty.exit_code}`);
  assert(empty.message.includes("記録はまだ0件"), `empty summary message: ${empty.message}`);

  const attempt = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_summary_attempt",
    "--content-id", "content_summary",
    "--attempt-id", "attempt_summary",
    "--created-at", "2026-08-29T04:00:00Z",
    "--created-by", "owner",
    "--status", "succeeded",
    "--cost-jpy", "120",
    "--usability", "usable",
    "--assessed-by", "human",
  ]);
  assert(attempt.exit_code === 0, `summary fixture attempt: ${attempt.message}`);

  const metric = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_summary_metric",
    "--content-id", "content_summary",
    "--snapshot-id", "metric_summary",
    "--publication-id", "publication_summary",
    "--captured-at", "2026-08-30T04:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T04:01:00Z",
    "--evidence", "insights_24h",
    "--window", "24h",
    "--views", "800",
    "--line-adds", "4",
    "--trial-inquiries", "2",
  ]);
  assert(metric.exit_code === 0, `summary fixture metric: ${metric.message}`);

  const secondAttempt = await runRecordCli([
    "attempt",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_summary_attempt_expensive",
    "--content-id", "content_expensive",
    "--attempt-id", "attempt_summary_expensive",
    "--created-at", "2026-08-29T04:10:00Z",
    "--created-by", "owner",
    "--status", "succeeded",
    "--cost-jpy", "300",
    "--usability", "usable",
    "--assessed-by", "human",
  ]);
  assert(secondAttempt.exit_code === 0, `second summary attempt: ${secondAttempt.message}`);

  const secondMetric = await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_summary_metric_expensive",
    "--content-id", "content_expensive",
    "--snapshot-id", "metric_summary_expensive",
    "--publication-id", "publication_summary_expensive",
    "--captured-at", "2026-08-30T04:10:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T04:11:00Z",
    "--evidence", "insights_24h_expensive",
    "--window", "24h",
    "--views", "100",
    "--line-adds", "0",
    "--trial-inquiries", "0",
  ]);
  assert(secondMetric.exit_code === 0, `second summary metric: ${secondMetric.message}`);

  const summary = await runRecordCli(["summary", "--repository-root", repositoryRoot]);
  assert(summary.exit_code === 0, `summary exit: ${summary.exit_code} ${summary.message}`);
  assert(summary.stream === null, "summary must not write a stream");
  assert(summary.file === null, "summary must not write a file");
  assert(summary.message.includes("使える1本あたりの費用: 210 JPY"), summary.message);
  assert(summary.message.includes("試行 2件 / 使えた 2件"), summary.message);
  assert(summary.message.includes("publication_summary（24h）"), summary.message);
  assert(summary.message.includes("再生 800"), summary.message);
  assert(summary.message.includes("LINE追加 4"), summary.message);
  assert(summary.message.includes("体験問い合わせ 2"), summary.message);
  assert(summary.message.includes("動画 content_summary: 費用 120 JPY"), summary.message);
  assert(summary.message.includes("動画 content_expensive: 費用 300 JPY"), summary.message);
  assert(summary.message.includes("content_summary: 費用 120 JPY / 再生 800"), summary.message);
  assert(summary.message.includes("content_expensive: 費用 300 JPY / 再生 100"), summary.message);

  // JSONとして読めても契約外のpayloadは成果に数えず、壊れた行も件数だけ知らせる。
  const metricFile = path.join(repositoryRoot, "runtime", "brand_growth", "metric_snapshots.jsonl");
  const invalidEvent = {
    schema_version: "brand_growth.event.4.0.0",
    event_id: "evt_invalid_payload",
    event_type: "metric_snapshot_recorded",
    created_at: "2026-08-30T05:00:00Z",
    created_by: "test",
    supersedes_id: null,
    payload: {
      schema_version: "brand_growth.metric_snapshot.4.0.0",
      metric_snapshot_id: "metric_invalid_payload",
      publication_id: "publication_invalid_payload",
      window: "24h",
      values: { views: "not-a-number" },
    },
  };
  await appendFile(metricFile, `${JSON.stringify(invalidEvent)}\n{broken-json\n`, "utf8");
  const guarded = await runRecordCli(["summary", "--repository-root", repositoryRoot]);
  assert(guarded.exit_code === 0, `guarded summary exit: ${guarded.exit_code}`);
  assert(guarded.message.includes("投稿後の成果: 2件"), guarded.message);
  assert(guarded.message.includes("契約外の記録 1件"), guarded.message);
  assert(guarded.message.includes("読めない行 1件"), guarded.message);
  assert(!guarded.message.includes("publication_invalid_payload"), guarded.message);
});

// 有効データが0件でも、壊れた行があれば「0件」だけで黙らず警告する。
await withTempRepo(async repositoryRoot => {
  const metricDir = path.join(repositoryRoot, "runtime", "brand_growth");
  await runRecordCli([
    "metric",
    "--repository-root", repositoryRoot,
    "--event-id", "evt_temp_for_directory",
    "--content-id", "content_temp_for_directory",
    "--snapshot-id", "metric_temp_for_directory",
    "--publication-id", "publication_temp_for_directory",
    "--captured-at", "2026-08-30T06:00:00Z",
    "--entered-by", "owner",
    "--entered-at", "2026-08-30T06:01:00Z",
    "--evidence", "insights",
    "--window", "24h",
  ]);
  const metricFile = path.join(metricDir, "metric_snapshots.jsonl");
  // 正規行を壊れた行だけに置き換える（テスト用の一時ディレクトリ内だけ）。
  await writeFile(metricFile, "{broken-only\n", "utf8");
  const summary = await runRecordCli(["summary", "--repository-root", repositoryRoot]);
  assert(summary.exit_code === 0, `broken-only summary exit: ${summary.exit_code}`);
  assert(summary.message.includes("記録はまだ0件"), summary.message);
  assert(summary.message.includes("読めない行 1件"), summary.message);
});

console.log("brand_growth record CLI tests passed");
