// テスト用の小道具。選手名はすべて架空（AGENTS.md R8）。

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCard } from "../src/core/card.mjs";
import { reduce, decide } from "../src/core/engine.mjs";

export const TOOL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export const CSV_HEADER = "試合番号,赤_表示名,赤_所属,赤_配信,青_表示名,青_所属,青_配信,区分,赤_入場曲,青_入場曲";

export function csv(rows) {
  return [CSV_HEADER, ...rows].join("\n");
}

export const SAMPLE_CSV = csv([
  "1,ヒカル,架空ジムA,OK,ソラ,架空ジムB,OK,キッズ,曲A,曲B",
  "2,ミナト,架空ジムC,OK,ハル,架空ジムD,NG,一般,曲C,曲D",
  "3,アオイ,架空ジムA,OK,レン,架空ジムE,録画のみ,一般,曲E,曲F",
]);

export function exampleConfig() {
  return JSON.parse(readFileSync(join(TOOL_DIR, "config.example.json"), "utf8"));
}

export function tempDir() {
  return mkdtempSync(join(tmpdir(), "uizin-eos-test-"));
}

// 時刻を自由に進められる時計。
export function fakeClock(start = Date.parse("2026-11-03T04:00:00.000Z")) {
  let current = start;
  const clock = () => current;
  clock.advance = ms => {
    current += ms;
    return current;
  };
  clock.iso = () => new Date(current).toISOString();
  return clock;
}

// 記録と状態エンジンだけで動く小さな大会。
export class MiniEvent {
  constructor({ config = exampleConfig(), clock = fakeClock(), csvText = SAMPLE_CSV } = {}) {
    this.config = config;
    this.clock = clock;
    this.events = [];
    this.state = reduce(this.events);
    const card = parseCard(csvText);
    if (!card.ok) throw new Error(card.errors.join("\n"));
    this.card = card;
  }

  find(seq) {
    return this.events.find(event => event.seq === seq)?.type;
  }

  run(type, args, { role = "operator", rev = this.state.rev, confirm, preflightReady = true } = {}) {
    const result = decide(
      { state: this.state, role, now: this.clock.iso(), config: this.config, preflightReady, findEventType: seq => this.find(seq) },
      { type, args, expectedRev: rev, confirm },
    );
    if (result.ok) {
      for (const event of result.events) this.events.push({ seq: this.events.length + 1, ...event });
      this.state = reduce(this.events);
    }
    return result;
  }

  observe(entry) {
    this.events.push({ seq: this.events.length + 1, at: this.clock.iso(), ...entry });
    this.state = reduce(this.events);
  }

  setup({ ack = true } = {}) {
    this.run("load_card", { bouts: this.card.bouts, hash: this.card.hash });
    if (ack) this.run("consent_ack");
    this.run("start_event");
    return this;
  }

  // 1試合をふつうに最後まで進める（勝者表示まで）。
  playBout(winner = "red", stepMs = 30_000) {
    const order = this.config.flow?.entranceOrder ?? ["red", "blue"];
    for (const [type, args] of [
      ["entrance", { corner: order[0] }],
      ["entrance", { corner: order[1] }],
      ["fight_start"],
      ["fight_end"],
      ["result", { winner }],
    ]) {
      this.clock.advance(stepMs);
      const result = this.run(type, args, { role: "easy" });
      if (!result.ok) throw new Error(`${type}: ${result.message}`);
    }
  }
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(check, { timeoutMs = 3000, stepMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await wait(stepMs);
  }
  throw new Error("時間内に条件がそろいませんでした");
}
