// 試合データ（CSV）の読み込み。AT-P4A-01
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCard, normalizeBroadcast, musicUnknownCount } from "../src/core/card.mjs";
import { csv, SAMPLE_CSV, CSV_HEADER } from "./helpers.mjs";

test("CSV: BOM・CRLF・引用符・セル内の改行とカンマを読める", () => {
  const rows = parseCsv('﻿a,b\r\n"x,1","he said ""hi"""\r\n"multi\nline",z\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x,1", 'he said "hi"'], ["multi\nline", "z"]]);
});

test("正しい試合データを読める（順番・表示名・配信可否）", () => {
  const card = parseCard(SAMPLE_CSV);
  assert.equal(card.ok, true);
  assert.equal(card.bouts.length, 3);
  assert.deepEqual(card.bouts.map(bout => bout.no), [1, 2, 3]);
  assert.equal(card.bouts[0].red.name, "ヒカル");
  assert.equal(card.bouts[1].blue.broadcast, "NG");
  assert.equal(card.bouts[2].blue.broadcast, "REC_ONLY");
  assert.match(card.hash, /^[0-9a-f]{16}$/);
});

test("配信可否は OK / 録画のみ / NG だけ。全角も受け付ける", () => {
  assert.equal(normalizeBroadcast("ＯＫ"), "OK");
  assert.equal(normalizeBroadcast(" ok "), "OK");
  assert.equal(normalizeBroadcast("録画のみ"), "REC_ONLY");
  assert.equal(normalizeBroadcast("ng"), "NG");
  assert.equal(normalizeBroadcast("たぶんOK"), null);
  assert.equal(normalizeBroadcast(""), null);
});

test("おかしい行があれば、行番号つきで読み込みを止める", () => {
  const result = parseCard(csv([
    "1,ヒカル,,OK,ソラ,,OK,,,",
    "1,ミナト,,OK,ハル,,OK,,,",
    "x,アオイ,,OK,レン,,OK,,,",
    "4,,,OK,レン,,わからない,,,",
  ]));
  assert.equal(result.ok, false);
  const text = result.errors.join("\n");
  assert.match(text, /3行目: 試合番号 1 が 2行目と重なっています/);
  assert.match(text, /4行目: 試合番号「x」/);
  assert.match(text, /5行目: 赤の表示名が空です/);
  assert.match(text, /5行目: 青_配信「わからない」/);
});

test("必須の列が無ければ止める", () => {
  const result = parseCard("試合番号,赤_表示名,青_表示名\n1,ヒカル,ソラ\n");
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /赤_配信/);
});

test("個人情報の列（本名・年齢・学校など）があれば読み込まない", () => {
  for (const column of ["本名", "年齢", "学年", "学校", "電話番号", "保護者連絡先", "生年月日"]) {
    const result = parseCard(`${CSV_HEADER},${column}\n1,ヒカル,,OK,ソラ,,OK,,,,x\n`);
    assert.equal(result.ok, false, column);
    assert.match(result.errors[0], /個人情報の列は読み込みません/);
  }
});

test("長い表示名は注意として返す（読み込みは止めない）", () => {
  const result = parseCard(csv(["1,とてもとてもながいリングネームです,,OK,ソラ,,OK,,,"]));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
});

test("入場曲が未定・空欄の数を数える", () => {
  const result = parseCard(csv(["1,ヒカル,,OK,ソラ,,OK,,未定,", "2,ミナト,,OK,ハル,,OK,,曲,曲"]));
  assert.equal(musicUnknownCount(result.bouts), 2);
});

test("空のCSVや試合0件は止める", () => {
  assert.equal(parseCard("").ok, false);
  assert.equal(parseCard(`${CSV_HEADER}\n`).ok, false);
});

test("CSV：セルの途中の引用符は文字のまま。閉じていない引用符は読み込みを止める（後ろの行を消さない）", () => {
  const ok = parseCard(csv(['1,ヒカル,,OK,ソラ,,OK,,12" Mix,曲B', "2,ミナト,,OK,ハル,,NG,,,"]));
  assert.equal(ok.ok, true);
  assert.equal(ok.bouts.length, 2);
  assert.equal(ok.bouts[0].red.music, '12" Mix');
  const broken = parseCard(csv(['1,ヒカル,,OK,ソラ,,OK,,"曲A,曲B', "2,ミナト,,OK,ハル,,NG,,,", "3,アオイ,,OK,レン,,OK,,,"]));
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0], /引用符/);
});
