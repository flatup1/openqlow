// 試合データ（Google Sheets から書き出したCSV）を読み、確かめる。
// 1つでもおかしければ読み込まない（行番号つきで理由を返す）。純ロジック。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §12

import { createHash } from "node:crypto";

export const REQUIRED_COLUMNS = ["試合番号", "赤_表示名", "赤_配信", "青_表示名", "青_配信"];
export const OPTIONAL_COLUMNS = ["赤_所属", "青_所属", "区分", "赤_入場曲", "青_入場曲"];

// 必要のない個人情報は持たない。こうした列があれば読み込みを止める。
const PERSONAL_DATA_HEADERS = /本名|氏名|年齢|学年|学校|生年月日|誕生日|電話|住所|メール|保護者|連絡先|e-?mail|phone|address|birth/i;

export const NAME_WARN_LENGTH = 12;

// RFC 4180 に沿ったCSVの読み取り（ダブルクォート・改行入りセル・BOM・CRLF）。
// 引用符はセルの先頭にあるときだけ囲みとして扱う（途中の " は文字のまま）。閉じていない囲みはエラーにする
// （黙って後ろの行を飲み込み、試合が消えるのを防ぐ）。
export function parseCsv(text) {
  const source = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let cellStarted = false;
  let line = 1;
  let quoteLine = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\n") line += 1;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
      quoteLine = line;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
      cellStarted = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
        line += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      cellStarted = false;
    } else {
      cell += char;
      cellStarted = true;
    }
  }
  if (quoted) throw new Error(`${quoteLine}行目で始まった引用符（"）が閉じていません`);
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(cells => cells.some(value => value.trim() !== ""));
}

export function normalizeBroadcast(value) {
  const text = String(value ?? "").normalize("NFKC").trim().toUpperCase();
  if (text === "OK") return "OK";
  if (text === "録画のみ") return "REC_ONLY";
  if (text === "NG") return "NG";
  return null;
}

export const BROADCAST_LABELS = { OK: "OK", REC_ONLY: "録画のみ", NG: "NG" };

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

// 戻り値: { ok: true, bouts, hash, warnings } または { ok: false, errors }
export function parseCard(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (error) {
    return { ok: false, errors: [`CSVが読めません：${error.message}`] };
  }
  if (rows.length === 0) return { ok: false, errors: ["CSVが空です"] };
  const header = rows[0].map(clean);
  const errors = [];
  const warnings = [];

  const personal = header.filter(name => PERSONAL_DATA_HEADERS.test(name));
  if (personal.length > 0) {
    return {
      ok: false,
      errors: [`個人情報の列は読み込みません（${personal.join("、")}）。表示名と配信可否だけのCSVにしてください`],
    };
  }
  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) errors.push(`列「${column}」がありません`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const col = name => header.indexOf(name);
  const seen = new Map();
  const bouts = [];
  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const get = name => (col(name) >= 0 ? clean(cells[col(name)]) : "");
    const noText = get("試合番号");
    const no = Number(noText);
    if (!/^\d+$/.test(noText) || no < 1) {
      errors.push(`${line}行目: 試合番号「${noText}」は1以上の整数にしてください`);
      return;
    }
    if (seen.has(no)) {
      errors.push(`${line}行目: 試合番号 ${no} が ${seen.get(no)}行目と重なっています`);
      return;
    }
    seen.set(no, line);
    const corner = prefix => {
      const name = get(`${prefix}_表示名`);
      const broadcastRaw = get(`${prefix}_配信`);
      const broadcast = normalizeBroadcast(broadcastRaw);
      const label = prefix;
      if (!name) errors.push(`${line}行目: ${label}の表示名が空です`);
      if (!broadcast) errors.push(`${line}行目: ${label}_配信「${broadcastRaw}」は OK / 録画のみ / NG のどれかにしてください`);
      if (name.length > NAME_WARN_LENGTH) warnings.push(`${line}行目: ${label}の表示名が長いです（${name.length}文字）。テロップで切れるかもしれません`);
      return { name, team: get(`${prefix}_所属`), broadcast: broadcast ?? "NG", music: get(`${prefix}_入場曲`) };
    };
    bouts.push({ no, category: get("区分"), red: corner("赤"), blue: corner("青") });
  });

  if (bouts.length === 0 && errors.length === 0) errors.push("試合が1つもありません");
  if (errors.length > 0) return { ok: false, errors };

  const hash = createHash("sha256").update(JSON.stringify(bouts)).digest("hex").slice(0, 16);
  return { ok: true, bouts, hash, warnings };
}

export function musicUnknownCount(bouts) {
  let count = 0;
  for (const bout of bouts ?? []) {
    for (const corner of [bout.red, bout.blue]) {
      const music = clean(corner.music);
      if (!music || music === "未定") count += 1;
    }
  }
  return count;
}

export function longNames(bouts) {
  const list = [];
  for (const bout of bouts ?? []) {
    for (const [label, corner] of [["赤", bout.red], ["青", bout.blue]]) {
      if (corner.name.length > NAME_WARN_LENGTH) list.push(`第${bout.no}試合 ${label}`);
    }
  }
  return list;
}
