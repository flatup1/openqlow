// WebOS 正本ズレ検知。
//
// 目的: `flatup-webos/app/` に書かれた事実（料金・LINE導線）が
// `src/shared/canon.ts` からズレたまま公開されるのを防ぐ。
//
// 背景: 既存の no-hardcoded-canon.test.ts は `src/` と `port/` の .ts だけを見る。
// WebOS は .html / .js のため、これまでどの機械チェックにも掛かっていなかった。
// AIKAで起きた「レディース14:00」ズレと同じ事故が、Web側で起きる余地が残っていた。
//
// 判定ルール:
//   1. WebOS に出てよい金額は「体験料金」だけ（正本 trialFirst から自動で引く）。
//      他の金額（会費・入会金・回数券など）は書かない。詳細はLINE/AIが案内する。
//   2. 体験料金は必ず正本と同じ額であること（正本を変えたらここが落ちる）。
//   3. 会費・住所・スケジュールの具体値をWebOSへ複製しないこと。
//   4. LINE導線は正本URL1本だけであること。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FLATUP_CANON } from "./canon.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const webosApp = path.join(repoRoot, "flatup-webos", "app");

// 正本の公式LINE URL（flatup-lp / girl-power-op と同一の1本）。
const CANON_LINE_URL = "https://lin.ee/cTSDajPz";

const TEXT_EXTENSIONS = [".html", ".js", ".css"];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXTENSIONS.some(ext => name.endsWith(ext))) out.push(full);
  }
}

const files: string[] = [];
walk(webosApp, files);
assert(files.length > 0, `WebOSのファイルが見つかりません: ${webosApp}`);

// 正本の「初回体験500円」から数字だけを取り出す（正本を変えれば自動で追従する）。
const trialMatch = FLATUP_CANON.trialFirst.match(/([\d,]+)円/);
assert(trialMatch, `正本 trialFirst から金額を読み取れません: ${FLATUP_CANON.trialFirst}`);
const trialAmount = trialMatch![1];

const violations: string[] = [];

// WebOSへ複製してはいけない正本の具体値。
const FORBIDDEN_LITERALS: ReadonlyArray<readonly [string, RegExp]> = [
  ["kids_price", /7[,，]700/],
  ["women_price", /8[,，]800/],
  ["men_price", /9[,，]900/],
  ["join_fee", /入会金\s*1?0[,，]000/],
  ["address", /成田市土屋516/],
  ["ladies_schedule", /土曜\s*1[0-9]:[0-9]{2}/],
  ["kids_schedule", /火曜・木曜\s*18:00/],
];

let trialMentions = 0;

for (const f of files) {
  const rel = path.relative(repoRoot, f);
  const lines = readFileSync(f, "utf8").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const where = `${rel}:${i + 1}`;

    // 1〜2. 金額は体験料金だけ。額は正本と一致していること。
    for (const [, amount] of line.matchAll(/([\d][\d,，]*)\s*円/g)) {
      if (amount.replace(/[,，]/g, "") !== trialAmount.replace(/,/g, "")) {
        violations.push(
          `${where} [price] 「${amount}円」はWebOSに書けません。` +
            `出してよい金額は正本の体験料金「${trialAmount}円」だけです: ${line.trim().slice(0, 60)}`,
        );
      } else {
        trialMentions++;
      }
    }

    // 3. 会費・住所・スケジュールの複製禁止。
    for (const [kind, re] of FORBIDDEN_LITERALS) {
      if (re.test(line)) {
        violations.push(`${where} [${kind}] 正本値の複製です: ${line.trim().slice(0, 60)}`);
      }
    }

    // 4. LINE導線は正本URL1本だけ。
    for (const [url] of line.matchAll(/https:\/\/lin\.ee\/[A-Za-z0-9]+/g)) {
      if (url !== CANON_LINE_URL) {
        violations.push(`${where} [line_url] 正本と違うLINE URLです: ${url}`);
      }
    }
  }
}

assert(
  violations.length === 0,
  `WebOSと正本のズレを検出しました — src/shared/canon.ts を正として直してください:\n${violations.join("\n")}`,
);

// 体験料金がどこにも書かれていない＝正本更新時に気づけない状態も落とす。
assert(
  trialMentions > 0,
  `WebOSに体験料金「${trialAmount}円」の記載がありません。正本との照合ができない状態です。`,
);

console.log(
  `webos-canon-sync tests passed (scanned ${files.length} files, ` +
    `trial price ${trialAmount}円 matched ${trialMentions} times, 0 violations)`,
);
