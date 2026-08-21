// Brand Growth Phase 4 受入試験: 追記専用イベント記録。
//
// 参照: IMPLEMENTATION_BOOK §6、CLAUDE_CODE_IMPLEMENTATION_SPEC §11、SCHEMA_CATALOG §1。
//
// 確かめること:
//   - 保存先は差し替えられ、既定は Git 追跡外である
//   - 追記しかできない（既存の行は変わらない）
//   - 同時に書いても行が混ざらない
//   - schema_version が無い記録は入らない
//   - 秘密情報・個人情報はファイルに触れる前に止まる
//
// 書き込みは一時ディレクトリだけ。リポジトリ内には1バイトも書かない。
//
// 注意: このファイルは src/shared/secret_guard.test.ts のリポジトリ走査対象に入る。
// 偽の鍵はソース上の文字列としては成立させず、実行時に組み立てる。

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRAND_GROWTH_ROOT_ENV,
  DEFAULT_RUNTIME_DIRNAME,
  resolveStoreRoot,
  StoreConfigError,
} from "./config.js";
import * as eventStore from "./event_store.js";
import {
  appendEvent,
  currentEvents,
  EVENT_SCHEMA_VERSION,
  makeEvent,
  readEvents,
  StorageError,
  supersedeEvent,
  type StoredEvent,
} from "./event_store.js";
import { RecordRuleError } from "../contracts/record_rules.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

/** 同期の「失敗するはず」。 */
function throwsSync(fn: () => unknown, expectedCode: string, message: string): void {
  try {
    fn();
  } catch (error) {
    const code = (error as { code?: string }).code;
    assert(
      (error instanceof StorageError || error instanceof StoreConfigError || error instanceof RecordRuleError) &&
        code === expectedCode,
      `${message}: expected ${expectedCode}, got ${String(code)} (${String(error)})`,
    );
    return;
  }
  throw new Error(`${message}: expected a failure but nothing was thrown`);
}

/** 非同期の「失敗するはず」。 */
async function throwsAsync(fn: () => Promise<unknown>, expectedCode: string, message: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const code = (error as { code?: string }).code;
    assert(
      (error instanceof StorageError || error instanceof RecordRuleError) && code === expectedCode,
      `${message}: expected ${expectedCode}, got ${String(code)} (${String(error)})`,
    );
    return;
  }
  throw new Error(`${message}: expected a failure but nothing was thrown`);
}

const AT = "2026-08-16T00:00:00Z";

function event(id: string, payload: unknown = { note: "ok" }): StoredEvent<unknown> {
  return makeEvent({
    event_id: id,
    event_type: "quality_assessed",
    created_at: AT,
    created_by: "brand_growth_test",
    payload,
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

// =====================================================================================
// 保存先の決め方
// =====================================================================================

{
  // 既定はリポジトリ直下の runtime/brand_growth。
  const fallback = resolveStoreRoot({ cwd: "/example/repo", env: {} });
  assert(fallback === "/example/repo/runtime/brand_growth", `default root: ${fallback}`);

  // 環境変数で差し替えられる。
  const fromEnv = resolveStoreRoot({
    cwd: "/example/repo",
    env: { [BRAND_GROWTH_ROOT_ENV]: "/var/lib/brand_growth" },
  });
  assert(fromEnv === "/var/lib/brand_growth", `env root: ${fromEnv}`);

  // 引数が環境変数より強い。
  const explicit = resolveStoreRoot({
    root: "/tmp/explicit",
    cwd: "/example/repo",
    env: { [BRAND_GROWTH_ROOT_ENV]: "/var/lib/brand_growth" },
  });
  assert(explicit === "/tmp/explicit", `explicit root: ${explicit}`);

  // 空文字は「指定なし」として扱う（空の環境変数でリポジトリ直下へ書かない）。
  const blank = resolveStoreRoot({ root: "  ", cwd: "/example/repo", env: { [BRAND_GROWTH_ROOT_ENV]: "" } });
  assert(blank === "/example/repo/runtime/brand_growth", `blank falls back: ${blank}`);
}

// --- 反証: 追跡対象のソース・設計書の中へは書かせない ---------------------------------
{
  for (const bad of ["src/brand_growth/data", "docs/ai-os", "scripts", "port", "deploy", "knowledge"]) {
    throwsSync(
      () => resolveStoreRoot({ root: bad, cwd: "/example/repo", env: {} }),
      "root_inside_tracked_source",
      `store root must reject ${bad}`,
    );
  }
  // 相対指定で登って戻る抜け道も塞ぐ。
  throwsSync(
    () => resolveStoreRoot({ root: "runtime/../src", cwd: "/example/repo", env: {} }),
    "root_inside_tracked_source",
    "traversal back into src must be rejected",
  );
  throwsSync(
    () => resolveStoreRoot({ root: ".", cwd: "/example/repo", env: {} }),
    "root_is_repository",
    "repository root itself must be rejected",
  );
}

// --- 既定の保存先が本当に Git 追跡外か（.gitignore を実際に読む）----------------------
{
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
  const lines = gitignore.split("\n").map(line => line.trim());
  assert(
    lines.includes(`/${DEFAULT_RUNTIME_DIRNAME}/`) || lines.includes(`${DEFAULT_RUNTIME_DIRNAME}/`),
    `.gitignore must ignore the default runtime directory (${DEFAULT_RUNTIME_DIRNAME}/)`,
  );
  // このテストはリポジトリ内へ書かない。既定の保存先が存在しないことを確かめる。
  assert(
    !existsSync(path.join(repoRoot, DEFAULT_RUNTIME_DIRNAME, "brand_growth")),
    "tests must never write to the default runtime directory",
  );
}

// =====================================================================================
// 記録の作り方
// =====================================================================================

{
  const e = event("evt_1");
  assert(e.schema_version === EVENT_SCHEMA_VERSION, "schema_version is set");
  assert(e.supersedes_id === null, "new record supersedes nothing");
  assert(Object.isFrozen(e), "record is frozen");
}

// --- 反証: 必須項目が欠けていれば作らせない -------------------------------------------
{
  throwsSync(() => makeEvent({ event_id: "", event_type: "x", created_at: AT, created_by: "t", payload: {} }), "missing_id", "empty event_id");
  throwsSync(() => makeEvent({ event_id: "evt", event_type: "", created_at: AT, created_by: "t", payload: {} }), "missing_field", "empty event_type");
  throwsSync(() => makeEvent({ event_id: "evt", event_type: "x", created_at: AT, created_by: "", payload: {} }), "missing_field", "empty created_by");
  throwsSync(
    () => makeEvent({ event_id: "evt", event_type: "x", created_at: "2026-08-16T09:00:00+09:00", created_by: "t", payload: {} }),
    "invalid_timestamp",
    "non-UTC created_at",
  );
  throwsSync(
    () => makeEvent({ event_id: "evt", event_type: "x", created_at: "2026-02-31T00:00:00Z", created_by: "t", payload: {} }),
    "invalid_timestamp",
    "impossible date",
  );
  throwsSync(
    () => makeEvent({ event_id: "evt", event_type: "x", created_at: AT, created_by: "t", payload: {}, schema_version: "" }),
    "missing_field",
    "empty schema_version",
  );
  // ID に連絡先を入れない（SCHEMA_CATALOG §1）。実行時に組み立てる。
  const idWithPhone = ["evt_", "090", "-", "1234", "-", "5678"].join("");
  throwsSync(
    () => makeEvent({ event_id: idWithPhone, event_type: "x", created_at: AT, created_by: "t", payload: {} }),
    "pii_in_id",
    "phone number inside an id",
  );
}

// --- 書き換え・削除の関数が存在しないこと（追記専用を構造で保証）----------------------
{
  const exported = Object.keys(eventStore);
  const mutating = exported.filter(name => /^(delete|remove|update|overwrite|truncate|clear)/i.test(name));
  assert(mutating.length === 0, `append-only store must not export mutating functions: ${mutating.join(",")}`);
}

// =====================================================================================
// 書き込みと読み出し（一時ディレクトリのみ）
// =====================================================================================

const root = await mkdtemp(path.join(tmpdir(), "brand-growth-store-"));

try {
  // --- 何も無いところから読んでも異常ではない ---
  {
    const empty = await readEvents(root, "quality");
    assert(empty.events.length === 0, "missing file reads as empty");
    assert(empty.malformed_lines === 0, "missing file has no malformed lines");
  }

  // --- 追記して読み戻せる。順番も保たれる ---
  {
    await appendEvent(root, "quality", event("evt_a"));
    await appendEvent(root, "quality", event("evt_b"));
    await appendEvent(root, "quality", event("evt_c"));

    const result = await readEvents(root, "quality");
    assert(result.events.length === 3, `events: ${result.events.length}`);
    assert(result.malformed_lines === 0, "no malformed lines");
    assert(
      result.events.map(e => e.event_id).join(",") === "evt_a,evt_b,evt_c",
      `order preserved: ${result.events.map(e => e.event_id).join(",")}`,
    );
  }

  // --- 追記しても、先に書いた行は1バイトも変わらない ---
  {
    const file = path.join(root, "quality.jsonl");
    const before = await readFile(file, "utf8");
    await appendEvent(root, "quality", event("evt_d"));
    const after = await readFile(file, "utf8");
    assert(after.startsWith(before), "append must not rewrite earlier lines");
    assert(after.length > before.length, "append must add content");
  }

  // --- 1件 = 1行。改行を含む値でも行が割れない ---
  {
    await appendEvent(root, "multiline", event("evt_nl", { note: "1行目\n2行目\r\n3行目" }));
    const raw = await readFile(path.join(root, "multiline.jsonl"), "utf8");
    assert(raw.trimEnd().split("\n").length === 1, `one record must be one line: ${raw.trimEnd().split("\n").length}`);
    const back = await readEvents<{ note: string }>(root, "multiline");
    assert(back.events[0]?.payload.note.includes("\n"), "the newline survives inside the value");
  }

  // --- 同時に書いても混ざらない（原子的な追記）---
  {
    const count = 60;
    await Promise.all(
      Array.from({ length: count }, (_, i) => appendEvent(root, "concurrent", event(`evt_c${i}`))),
    );
    const result = await readEvents(root, "concurrent");
    assert(result.malformed_lines === 0, `torn write detected: ${result.malformed_lines} malformed lines`);
    assert(result.events.length === count, `all records survived: ${result.events.length}/${count}`);
    const ids = new Set(result.events.map(e => e.event_id));
    assert(ids.size === count, `no record was lost or duplicated: ${ids.size}/${count}`);
  }

  // --- 壊れた行があっても、残りは読める（書きかけで落ちた場合）---
  {
    const file = path.join(root, "torn.jsonl");
    await appendEvent(root, "torn", event("evt_ok1"));
    // 途中で電源が落ちたような、途切れた行を混ぜる。
    await writeFile(file, '{"schema_version":"x","event_id":"evt_bro', { flag: "a" });
    await writeFile(file, "\n", { flag: "a" });
    await appendEvent(root, "torn", event("evt_ok2"));

    const result = await readEvents(root, "torn");
    assert(result.malformed_lines === 1, `malformed counted: ${result.malformed_lines}`);
    assert(result.events.length === 2, `good records still readable: ${result.events.length}`);
  }

  // --- 訂正は上書きではなく新しい記録 ---
  {
    const first = event("evt_v1", { score: 1 });
    await appendEvent(root, "revised", first);
    const second = supersedeEvent(first, {
      event_id: "evt_v2",
      event_type: "quality_assessed",
      created_at: "2026-08-16T01:00:00Z",
      created_by: "brand_growth_test",
      payload: { score: 2 },
    });
    await appendEvent(root, "revised", second);

    const result = await readEvents<{ score: number }>(root, "revised");
    // 元の記録は残っている。
    assert(result.events.length === 2, "the original record is retained");
    const now = currentEvents(result.events);
    assert(now.length === 1 && now[0]?.event_id === "evt_v2", "only the newest version is current");
    assert(now[0]?.payload.score === 2, "the correction is visible");
  }

  // --- 反証: schema_version が無い記録は書かせない ---
  {
    const noVersion = { event_id: "evt_x", event_type: "x", created_at: AT, created_by: "t", supersedes_id: null, payload: {} } as unknown as StoredEvent<unknown>;
    await throwsAsync(() => appendEvent(root, "guarded", noVersion), "missing_schema_version", "record without schema_version");
    assert(!existsSync(path.join(root, "guarded.jsonl")), "a rejected record must not create the file");
  }

  // --- 反証: 秘密情報はファイルに触れる前に止まる ---
  {
    // ソース上に本物の形の文字列を残さないため、実行時に組み立てる。
    const fakeKey = ["sk", "-", "0".repeat(32)].join("");
    const before = existsSync(path.join(root, "quality.jsonl"))
      ? await readFile(path.join(root, "quality.jsonl"), "utf8")
      : "";

    await throwsAsync(
      () => appendEvent(root, "quality", event("evt_secret", { token: fakeKey })),
      "secret_in_record",
      "credential inside a record",
    );

    const after = await readFile(path.join(root, "quality.jsonl"), "utf8");
    assert(after === before, "a rejected record must not be written at all");
    assert(!after.includes(fakeKey), "the credential must never reach disk");
  }

  // --- 反証: 区切り記号の直後に隠したsecretもファイル前で止める ---
  {
    const prefixedKey = ["ref_", "sk", "-", "0".repeat(32)].join("");
    const file = path.join(root, "secret_prefixed.jsonl");

    await throwsAsync(
      () => appendEvent(root, "secret_prefixed", event("evt_secret_prefixed", { reference: prefixedKey })),
      "secret_in_record",
      "credential hidden after a separator",
    );

    assert(!existsSync(file), "a prefixed credential must be rejected before creating the file");
  }

  {
    const prefixedKey = ["ref_", "gh", "p", "_", "0".repeat(30)].join("");
    const file = path.join(root, "secret_prefixed_internal_separator.jsonl");

    await throwsAsync(
      () =>
        appendEvent(
          root,
          "secret_prefixed_internal_separator",
          event("evt_secret_prefixed_internal_separator", { reference: prefixedKey }),
        ),
      "secret_in_record",
      "credential with an internal separator hidden after a separator",
    );

    assert(!existsSync(file), "the credential must be rejected before creating the file");
  }

  // --- 反証: 個人情報も同じく止める ---
  {
    const fakeEmail = ["member", "@", "example", ".com"].join("");
    const fakePhone = ["090", "-", "1234", "-", "5678"].join("");
    const fakeLineId = `U${"a".repeat(32)}`;

    for (const [value, label] of [
      [fakeEmail, "email"],
      [fakePhone, "phone"],
      [fakeLineId, "line user id"],
    ] as const) {
      await throwsAsync(
        () => appendEvent(root, "pii_guarded", event("evt_pii", { note: value })),
        "pii_in_record",
        `${label} inside a record`,
      );
    }
    assert(!existsSync(path.join(root, "pii_guarded.jsonl")), "no file is created for rejected records");
  }

  // --- 回帰: 区切り記号に続く個人情報も、ディスクへ書かせない ---
  //
  // 見つかった不具合: 書き込み前の検査が素の文字列だけを見ていたため、
  // "ast_090-1234-5678" のように接頭辞へ続く電話番号は単語境界が立たず、
  // そのまま JSONL へ書かれていた（実ファイルで確認済み）。
  {
    const cases = [
      ["ast_", "090", "-", "1234", "-", "5678"].join(""),
      ["cnt_", "U", "a".repeat(32)].join(""),
      ["ref:", "090", "-", "1234", "-", "5678"].join(""),
      ["a/", "090", "-", "1234", "-", "5678"].join(""),
    ];

    for (const value of cases) {
      await throwsAsync(
        () => appendEvent(root, "pii_flat", event("evt_pii_flat", { asset_id: value })),
        "pii_in_record",
        `personal data after a separator (${value.slice(0, 4)}…)`,
      );
    }
    assert(!existsSync(path.join(root, "pii_flat.jsonl")), "no file is created for rejected records");
  }

  // --- 反証: stream 名でディレクトリを抜け出せない ---
  {
    for (const bad of ["../escape", "/etc/passwd", "Quality", "quality.jsonl", "", "a b"]) {
      await throwsAsync(() => appendEvent(root, bad, event("evt_s")), "invalid_stream", `stream name ${JSON.stringify(bad)}`);
    }
  }

  // --- 反証: JSON にできない値は書かせない ---
  {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await throwsAsync(
      () => appendEvent(root, "quality", event("evt_circular", circular)),
      "unserializable_record",
      "circular payload",
    );
  }

  // --- 書いたのは一時ディレクトリの中だけ ---
  {
    const info = await stat(root);
    assert(info.isDirectory(), "temp root exists");
    assert(root.startsWith(tmpdir()), `tests must write only under the temp dir: ${root}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("brand_growth storage (phase 4) tests passed");
