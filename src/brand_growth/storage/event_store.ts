// Brand Growth Phase 4: 追記だけのイベント記録（JSONL）。
//
// 参照: IMPLEMENTATION_BOOK §6、SCHEMA_CATALOG §1、
//       CLAUDE_CODE_IMPLEMENTATION_SPEC §11。
//
// 方針:
//   - 追記だけ。書き換えも削除もできない（そういう関数を用意しない）。
//     訂正したいときは supersedes_id を付けた新しい記録を足す。
//   - 1件 = 1行。JSON.stringify は改行を \n へ逃がすので、行が割れない。
//   - 追記は open(O_APPEND) → write 1回 → close。書きかけの行が混ざらない。
//   - 書く前に秘密情報と個人情報を検査し、見つけたら書かずに止める。
//   - schema_version が無い記録は受け付けない。
//   - SQLite も新しい DB migration も使わない（最初の一歩は一番単純な形にする）。
//
// 時計は読まない。created_at は呼び出し側が渡す。

import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  assertNonEmpty,
  assertSafeId,
  assertUtcIso8601,
  deepFreeze,
  scanPiiThorough,
  scanSecretThorough,
} from "../contracts/record_rules.js";

export const EVENT_SCHEMA_VERSION = "brand_growth.event.4.0.0";

/** 記録の種類ごとにファイルを分ける。名前はファイル名になるので厳しく縛る。 */
const STREAM_NAME = /^[a-z][a-z0-9_]*$/;

export class StorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

/** 1件ぶんの記録。SCHEMA_CATALOG §1 の必須項目を型で強制する。 */
export interface StoredEvent<P = unknown> {
  readonly schema_version: string;
  readonly event_id: string;
  readonly event_type: string;
  /** UTC ISO 8601。 */
  readonly created_at: string;
  readonly created_by: string;
  /** 訂正のとき、元の記録の id。新規なら null。 */
  readonly supersedes_id: string | null;
  readonly payload: P;
}

export interface MakeEventParams<P> {
  readonly event_id: string;
  readonly event_type: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly payload: P;
  readonly supersedes_id?: string | null;
  /** 既定は EVENT_SCHEMA_VERSION。payload 側の版はここではなく payload に持たせる。 */
  readonly schema_version?: string;
}

/** 記録を1件つくる。契約に反していればこの時点で止める。 */
export function makeEvent<P>(params: MakeEventParams<P>): StoredEvent<P> {
  assertSafeId("event_id", params.event_id);
  assertNonEmpty("event_type", params.event_type);
  assertUtcIso8601("created_at", params.created_at);
  assertNonEmpty("created_by", params.created_by);

  const schemaVersion = params.schema_version ?? EVENT_SCHEMA_VERSION;
  assertNonEmpty("schema_version", schemaVersion);

  const supersedes = params.supersedes_id ?? null;
  if (supersedes !== null) assertSafeId("supersedes_id", supersedes);

  return deepFreeze({
    schema_version: schemaVersion,
    event_id: params.event_id,
    event_type: params.event_type,
    created_at: params.created_at,
    created_by: params.created_by,
    supersedes_id: supersedes,
    payload: params.payload,
  }) as StoredEvent<P>;
}

/** 訂正用。元の記録は残したまま、新しい記録を作る（上書きしない）。 */
export function supersedeEvent<P>(previous: StoredEvent<P>, params: MakeEventParams<P>): StoredEvent<P> {
  return makeEvent({ ...params, supersedes_id: previous.event_id });
}

function streamFile(root: string, stream: string): string {
  if (!STREAM_NAME.test(stream)) {
    throw new StorageError("invalid_stream", "stream name must match ^[a-z][a-z0-9_]*$");
  }
  return path.join(root, `${stream}.jsonl`);
}

/**
 * 書く前の門番。
 * 鍵や個人情報が1つでも見つかったら、ファイルには一切触れずに止める。
 *
 * 個人情報は scanPiiThorough で見る。素の文字列だけを見ると
 * `"ast_090-1234-5678"` のように区切り記号へ続けて書かれた連絡先を
 * 単語境界の都合で見逃し、そのままディスクへ書いてしまう。
 */
function assertStorable(line: string): void {
  const secrets = scanSecretThorough(line);
  if (secrets.length > 0) {
    // 値は出さない。種類だけを伝える。
    throw new StorageError("secret_in_record", `record contains credentials (${secrets.join(",")})`);
  }
  const pii = scanPiiThorough(line);
  if (pii.length > 0) {
    throw new StorageError("pii_in_record", `record contains personal data (${pii.join(",")})`);
  }
}

function serialize(event: StoredEvent<unknown>): string {
  if (typeof event.schema_version !== "string" || event.schema_version.trim() === "") {
    throw new StorageError("missing_schema_version", "schema_version is required on every record");
  }
  let json: string;
  try {
    json = JSON.stringify(event);
  } catch {
    throw new StorageError("unserializable_record", "record must be JSON serializable");
  }
  if (json === undefined) {
    throw new StorageError("unserializable_record", "record must be JSON serializable");
  }
  if (json.includes("\n")) {
    // JSON.stringify は改行を逃がすので通常は起きない。起きたら行が割れるので止める。
    throw new StorageError("newline_in_record", "serialized record must be a single line");
  }
  return json;
}

/**
 * 記録を1件追記する。既存の行は読まないし、触らない。
 *
 * 返り値は書き込んだファイルのパス。
 */
export async function appendEvent(
  root: string,
  stream: string,
  event: StoredEvent<unknown>,
): Promise<string> {
  const file = streamFile(root, stream);
  const line = `${serialize(event)}\n`;
  assertStorable(line);

  await mkdir(path.dirname(file), { recursive: true });

  // O_APPEND で開いて 1回だけ書く。複数プロセスが同時に書いても行が混ざらない。
  const handle = await open(file, "a");
  try {
    await handle.write(line);
  } finally {
    await handle.close();
  }
  return file;
}

export interface ReadResult<P = unknown> {
  readonly events: readonly StoredEvent<P>[];
  /** 壊れていて読めなかった行の数（書きかけで落ちた場合など）。 */
  readonly malformed_lines: number;
}

/**
 * 記録を読む。ファイルが無ければ空で返す（それは異常ではない）。
 * 壊れた行があっても例外にせず、件数だけ知らせて残りを読む。
 */
export async function readEvents<P = unknown>(root: string, stream: string): Promise<ReadResult<P>> {
  const file = streamFile(root, stream);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return deepFreeze({ events: [], malformed_lines: 0 }) as ReadResult<P>;
    throw error;
  }

  const events: StoredEvent<P>[] = [];
  let malformed = 0;

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line) as StoredEvent<P>;
      if (typeof parsed?.schema_version !== "string" || typeof parsed?.event_id !== "string") {
        malformed += 1;
        continue;
      }
      events.push(parsed);
    } catch {
      malformed += 1;
    }
  }

  return deepFreeze({ events, malformed_lines: malformed }) as ReadResult<P>;
}

/**
 * 訂正を反映した「今の姿」を返す。
 * 元の記録は消さない。supersedes_id で置き換えられたものを除くだけ。
 */
export function currentEvents<P>(events: readonly StoredEvent<P>[]): readonly StoredEvent<P>[] {
  const superseded = new Set<string>();
  for (const event of events) {
    if (event.supersedes_id !== null) superseded.add(event.supersedes_id);
  }
  return events.filter(event => !superseded.has(event.event_id));
}
