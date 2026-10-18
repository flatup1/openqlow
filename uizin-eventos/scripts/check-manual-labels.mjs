#!/usr/bin/env node
// 使い方マニュアルの 「…」 が、本物の画面・スクリプト・資料の文字と一致するかを調べる「ラベル・ロボット」。
// Manual label robot: every 「…」 string in the manual must really exist in the product.
//
// 使い方 / usage:
//   node scripts/check-manual-labels.mjs [manualPath] [builtDir]
//
// ルール（マニュアル側）:
//   「…」 = 画面にある文字そのまま（ボタン名・タブ名・メニュー名・メッセージ）
//   『…』 = 例・サンプル値・他人の言葉（このロボットは調べない）
//
// 探す場所（優先度の高い順）:
//   UI    = 出来上がった画面(builtDir の html/js/css/txt/json/gs)
//           + TypeScript 原本(app, core) + Apps Script(public/templates, builtDir/templates)
//   DOCS  = docs フォルダ・START_HERE.md・README.md（マニュアル自身は除く）
//   UI で見つかれば「OK」。DOCS だけで見つかった場合は「資料のみ(DOCS-ONLY)」として別に表示する
//   （画面にあるとは限らないので要確認。ただし不一致扱いにはしない。--strict-docs で不一致扱い）。
//
// 一致の判定: 前後の絵文字・記号・空白をはずし、空白の連続は1つにまとめて「そのまま含まれるか」を見る。
//   数字・{名前}・… を「何でもよい所」にして画面の「型」にだけ合う場合は TEMPLATE（実例の値入りなので 『…』 にすべき）として不一致扱い。
//   --allow-samples を付けると、数字だけが入れかわる TEMPLATE（{ } や … を含まないもの）は許す。
//   ※数字は何でもよい扱いなので、許したものは目で確かめること。
//   空白だけがちがう場合は SPACE-ONLY として不一致扱い（1文字ずつ同じ、が原則のため）。
//
// 付けられる旗: --allow-samples / --strict-docs / --no-suggest / --no-verified / --list-verified
// 終了コード: 不一致が1つでもあれば 1、なければ 0。依存パッケージなし（Node 18+）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const manualPath = path.resolve(args[0] ?? path.join(root, "docs", "TOURNAMENT_OS_使い方マニュアル.md"));
const DEFAULT_BUILT = "/tmp/claude-0/-home-user-openqlow/fab3c520-9e3b-55ea-a429-23f58091261b/scratchpad/snap-r1/out-private-pages";
let builtDir = path.resolve(args[1] ?? DEFAULT_BUILT);
if (!args[1] && !fs.existsSync(builtDir)) builtDir = path.join(root, "out-private-pages");

const TEXT_EXT = new Set([".html", ".js", ".mjs", ".css", ".txt", ".json", ".gs", ".ts", ".tsx", ".jsx", ".md", ".csv", ".sh"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next", "manual-images"]);

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

if (!fs.existsSync(manualPath)) { console.error(`マニュアルが見つかりません: ${manualPath}`); process.exit(2); }
if (!fs.existsSync(builtDir)) { console.error(`画面フォルダが見つかりません: ${builtDir}`); process.exit(2); }

// ---- 文字の正規化 ----
const decodeEscapes = (s) =>
  s
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["'`\\\/])/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
const collapse = (s) => s.replace(/\s+/g, " ");
const squeeze = (s) => s.replace(/\s+/g, "");
// 前後の絵文字・記号・空白をはずす（① などの丸数字は記号ではないので残る）
const EDGE = /^[\s\p{Extended_Pictographic}\p{S}︎️‍⃣✓✕✔✖]+|[\s\p{Extended_Pictographic}\p{S}︎️‍⃣✓✕✔✖]+$/gu;
const trimEdge = (s) => s.replace(EDGE, "");

// ---- 探す文章を集める ----
function load(files) {
  const parts = [];
  for (const f of files) {
    let t;
    try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    parts.push(t);
    const d = decodeEscapes(t);
    if (d !== t) parts.push(d);
  }
  return parts.join("\n\u0000\n");
}

const manualBase = path.basename(manualPath);
const isManualFile = (f) => path.resolve(f) === manualPath || path.basename(f).includes("使い方マニュアル");

const uiFiles = [
  ...walk(builtDir),
  ...walk(path.join(root, "app")),
  ...walk(path.join(root, "core")),
  ...walk(path.join(root, "public", "templates")),
].filter((f) => !isManualFile(f));
const docFiles = [
  ...walk(path.join(root, "docs")),
  path.join(root, "START_HERE.md"),
  path.join(root, "README.md"),
].filter((f) => fs.existsSync(f) && !isManualFile(f));

const uiRaw = load(uiFiles);
const docRaw = load(docFiles);
const ui = { c: collapse(uiRaw), s: squeeze(uiRaw) };
const doc = { c: collapse(docRaw), s: squeeze(docRaw) };

// ---- マニュアルから 「…」 を取り出す ----
const manual = fs.readFileSync(manualPath, "utf8");
const lineStarts = [0];
for (let i = 0; i < manual.length; i++) if (manual[i] === "\n") lineStarts.push(i + 1);
const lineOf = (idx) => {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
};
// 「…」 を外側から順に取り出す。画面の文そのものが 「」 を含む場合（例：「「開催日」は、…」）は入れ子として扱う。
const found = []; // 一番外側の 「…」 {line, raw, inner: [{line, raw}]}
const structural = [];
{
  const stack = [];
  for (let i = 0; i < manual.length; i++) {
    const ch = manual[i];
    if (ch === "「") {
      const node = { start: i, line: lineOf(i), inner: [] };
      if (stack.length) stack[stack.length - 1].inner.push(node);
      stack.push(node);
    } else if (ch === "」") {
      if (!stack.length) { structural.push({ line: lineOf(i), msg: "対応する 「 のない 」 があります" }); continue; }
      const node = stack.pop();
      node.raw = manual.slice(node.start + 1, i);
      if (!stack.length) found.push(node);
    }
  }
  for (const n of stack) structural.push({ line: n.line, msg: "閉じていない 「 があります" });
}

// ---- 照合 ----
// ---- 手で確かめ済みの「画面で組み立てられる文」 ----
// 画面の文は、プログラムが数・名前・札を つないで作ることがあり、ソースには一続きの文字として無い。
// 下の文は、マニュアルに書かれたとおりの文字が実際の画面に出ることを、ソースを読んで確かめたもの（2026-10-16）。
// 文字が1つでも変わったら、この表には合わなくなり、ふつうの検査に戻る。使わないときは --no-verified。
const VERIFIED_COMPOSED = [
  ["手順1 準備", "app/private/setup/page.tsx:723-728 「手順{n}」と STEP_NAMES(19行目) の2つの札が1つのボタンに並ぶ"],
  ["手順2 つなぐ", "app/private/setup/page.tsx:723-728 「手順{n}」と STEP_NAMES(19行目) の2つの札が1つのボタンに並ぶ"],
  ["手順3 渡す", "app/private/setup/page.tsx:723-728 「手順{n}」と STEP_NAMES(19行目) の2つの札が1つのボタンに並ぶ"],
  ["🔒 まず手順1", "app/private/setup/page.tsx:730 '🔒 まず手順' + (n-1)"],
  ["🔒 まず手順2", "app/private/setup/page.tsx:730 '🔒 まず手順' + (n-1)"],
  ["👉 次はここ：作業1：ここを押して、Googleでコピーを作る", "app/private/setup/page.tsx:212 の「👉 次はここ：」の札 + 各 label (1052, 662, 682 行目)"],
  ["👉 次はここ：ここにURLを貼る", "app/private/setup/page.tsx:212 の「👉 次はここ：」の札 + 各 label (1052, 662, 682 行目)"],
  ["👉 次はここ：Googleシートで「Tournament OS」→「② 受付を開始」を押す", "app/private/setup/page.tsx:212 の「👉 次はここ：」の札 + 各 label (1052, 662, 682 行目)"],
  ["✓ できた　4つの作業の、1つ目", "app/private/setup/page.tsx:259 '✓ できた　' + '4つの作業の、' + n + 'つ目'"],
  ["✓ できた　4つの作業の、2つ目", "app/private/setup/page.tsx:259 '✓ できた　' + '4つの作業の、' + n + 'つ目'"],
  ["✓ できた　4つの作業の、3つ目", "app/private/setup/page.tsx:259 '✓ できた　' + '4つの作業の、' + n + 'つ目'"],
  ["作業2が終わってから押せます", "app/private/setup/page.tsx:1100 '作業' + (cardNow + 1) + 'が終わってから押せます'"],
  ["「準備できました」と出た → 次へ（次の画面で自動で確かめます）", "app/private/setup/page.tsx:26 GO2_NAME + 1166 行目の '（次の画面で自動で確かめます）'"],
  ["いまここ 2 / 3：つなぐ（URLをはって、つなぐ）", "app/private/setup/page.tsx:1028 'いまここ {step} / 3：' + STEP_NAMES + （STEPS: 17行目。画面が広いときだけ出る）"],
  ["いまここ 3 / 3：渡す（選手に渡すURLを作る）", "app/private/setup/page.tsx:1028 'いまここ {step} / 3：' + STEP_NAMES + （STEPS: 17行目。画面が広いときだけ出る）"],
  ["作業2が終わっていません", "app/private/setup/page.tsx:1169 '作業' + (cardNow + 1) + 'が終わっていません'"],
  ["操作1が終わった ✓", "app/private/setup/page.tsx:939 '操作' + (i+1) + 'が終わった ✓' / 'が終わったら、ここを押す'"],
  ["操作2が終わったら、ここを押す", "app/private/setup/page.tsx:939 '操作' + (i+1) + 'が終わった ✓' / 'が終わったら、ここを押す'"],
  ["操作2が終わった ✓", "app/private/setup/page.tsx:939 '操作' + (i+1) + 'が終わった ✓' / 'が終わったら、ここを押す'"],
  ["操作3が終わったら、ここを押す", "app/private/setup/page.tsx:939 '操作' + (i+1) + 'が終わった ✓' / 'が終わったら、ここを押す'"],
  ["操作3が終わった ✓", "app/private/setup/page.tsx:939 '操作' + (i+1) + 'が終わった ✓' / 'が終わったら、ここを押す'"],
  ["ウェブアプリのURL 必須", "app/private/setup/page.tsx:982 label「ウェブアプリのURL」+ 札「必須」"],
  ["クラス分け ✓ あり（Aクラス／Bクラス）。申し込みページに出ます", "app/private/setup/page.tsx:1203 見出し「クラス分け」+ '✓ あり（上／下）。申し込みページに出ます'"],
  ["⚠気をつけて：あと少しです。", "app/private/setup/page.tsx:754 + 195 Caution の title「気をつけて：」+ lead 'あと少しです。'"],
  ["第1試合 → 第2試合に進みました", "app/private/live/listLogic.ts:329 b + ' → ' + a + 'に進みました'"],
  ["いま開いている大会：第3回 架空ジム大会　選手6人・試合3つ　✓ 保存済み 02:09", "app/private/page.tsx:1416 'いま開いている大会：' + 名前 + 選手N人・試合M + line.short (logic.ts:260-270)"],
  ["いま開いている大会：まだ名前なし", "app/private/page.tsx:1416 'いま開いている大会：' + 名前 + 選手N人・試合M + line.short (logic.ts:260-270)"],
  ["いま開いている大会：まだ名前なし　選手0人・試合なし　● 未保存", "app/private/page.tsx:1416 'いま開いている大会：' + 名前 + 選手N人・試合M + line.short (logic.ts:260-270)"],
  ["いま開いている大会：まだ名前なし　選手0人・試合なし", "app/private/page.tsx:1416 'いま開いている大会：' + 名前 + 選手N人・試合M + line.short (logic.ts:260-270)"],
  ["👉 次はここ：保存", "app/private/marks.tsx:21 「👉 次はここ：」+ logic.ts nextAction の label ('保存' / logic.ts:813 '保存が終わるまで待つ')"],
  ["👉 次はここ：保存が終わるまで待つ", "app/private/marks.tsx:21 「👉 次はここ：」+ logic.ts nextAction の label ('保存' / logic.ts:813 '保存が終わるまで待つ')"],
  ["✓ 保存済み 02:09", "app/private/logic.ts:270 '✓ 保存済み ' + savedClock"],
  ["✓ 保存しました 02:09（このパソコンの中）", "app/private/page.tsx:656 '保存しました ' + 時刻 + '（このパソコンの中）'"],
  ["⚠ 気をつけて：コピー未作成：停電や故障で消えると戻せません。", "app/private/marks.tsx:39-42 Caution「⚠ 気をつけて：」+ page.tsx:1358 / 1973 の本文"],
  ["⚠ 気をつけて：ダウンロードの中のファイルを、USBメモリにも入れておく。", "app/private/marks.tsx:39-42 Caution「⚠ 気をつけて：」+ page.tsx:1358 / 1973 の本文"],
  ["🔒 押せません：あと7文字 必要です", "app/private/page.tsx:983 'あと' + (10 - n) + '文字 必要です' (「押せません：」は押せない理由の札)"],
  ["11/10文字 ✓", "app/private/page.tsx:112 / 1925 n + '/10文字' + ' ✓'"],
  ["3/10文字", "app/private/page.tsx:112 / 1925 n + '/10文字' + ' ✓'"],
  ["🔒 押せません：紙に書いてからチェックします", "app/private/page.tsx:984 '紙に書いてからチェックします' (「押せません：」は押せない理由の札)"],
  ["戻す：コピーの内容を戻します（なくなるものはありません）：選手0人→6人・試合0つ→3つ。", "app/private/logic.ts:582-593 restoreBoxText + page.tsx:1960 head=\"戻す\""],
  ["失敗：戻せませんでした。パスワードがちがいます。日本語入力が全角になっていないか、前後に空白がないか見て、もう一度入れてください。", "app/private/logic.ts:563 + page.tsx:1017 '失敗：' + main (「今のデータは変えていません」は別の行)"],
  ["戻しました：『第3回 架空ジム大会』・選手6人・試合3つ。このパソコンに保存ずみです。", "app/private/page.tsx:344 '戻しました：『' + 名前 + '』・選手N人・試合Mつ。このパソコンに保存ずみです。'"],
  ["選手6人・試合3つ　✓ 保存済み", "app/private/page.tsx:1416 選手N人・試合M + line.short"],
  ["✕ 消える：いまの内容は消えて、コピーの内容に入れかわります：選手6人→4人・試合3つ→2つ。", "app/private/marks.tsx:99 '✕ ' + head + '：' + verdict; page.tsx:1964 head=\"消える\"; logic.ts:582-593"],
  ["⚠ 減ります：選手が6人から4人になります。", "app/private/logic.ts:577 '⚠ 減ります：選手が' + n2 + '人から' + n + '人になります。'"],
  ["このコピーは3日前のものです。", "app/private/logic.ts:669 'このコピーは' + days + '日前のものです' + page.tsx:1962 の '。'"],
  ["まちがえたときは「消した試合を元にもどす」を押します（このページを閉じるまで戻せます）", "app/private/page.tsx:565 'まちがえたときは「' + UNDO_REMOVE + '」を押します（このページを閉じるまで戻せます）'"],
  ["新しく入った人は1人です。", "app/private/page.tsx:762-770 名簿を取り込んだ知らせの文を組み立てる所"],
  ["写真がなかった6人には、写真を足しました。", "app/private/page.tsx:762-770 名簿を取り込んだ知らせの文を組み立てる所"],
  ["「申込原本（個人情報あり）」タブが見つからない（または、空になっている）ので、受付を止めています。", "public/templates/Tournament_OS_Google受付_v3.gs:189 '「' + タブ名 + '」タブ' + 'が見つからない（または、空になっている）ので、受付を止めています。'"],
  ["設定: 済み", "public/templates/Tournament_OS_Google受付_v3.gs:276 ⑤ いまの状態を見る の箱（行ごとに '設定: ' / '自動テスト: ' / '受付: ' / '締切: '）"],
  ["設定: まだ（① 最初の設定を押す）", "public/templates/Tournament_OS_Google受付_v3.gs:276 ⑤ いまの状態を見る の箱（行ごとに '設定: ' / '自動テスト: ' / '受付: ' / '締切: '）"],
  ["自動テスト: 済み", "public/templates/Tournament_OS_Google受付_v3.gs:276 ⑤ いまの状態を見る の箱（行ごとに '設定: ' / '自動テスト: ' / '受付: ' / '締切: '）"],
  ["受付: 受付中", "public/templates/Tournament_OS_Google受付_v3.gs:276 ⑤ いまの状態を見る の箱（行ごとに '設定: ' / '自動テスト: ' / '受付: ' / '締切: '）"],
  ["会場（B4）：▼から選び直す", "app/private/setup/page.tsx:169 cell + '▼から選び直す'（画面の既知のまちがい。会場の地図URL等もこの形で出る。マニュアル2567行目の説明どおり）"],
  ["大会名（B2）：▼から選び直す", "app/private/setup/page.tsx:169 cell + '▼から選び直す'（画面の既知のまちがい。会場の地図URL等もこの形で出る。マニュアル2567行目の説明どおり）"],
  ["「入場曲」は、あり／なし のどれかにしてください", "public/templates/Tournament_OS_Google受付_v3.gs:115,127,128 '「' + 名前 + '」は…'"],
  ["「上のクラスの条件」は60文字までにしてください", "public/templates/Tournament_OS_Google受付_v3.gs:115,127,128 '「' + 名前 + '」は…'"],
  ["「上のクラスの名前」は、「=」「+」「-」「@」で始めないでください", "public/templates/Tournament_OS_Google受付_v3.gs:115,127,128 '「' + 名前 + '」は…'"],
  ["できた：6人分を読み込みました（写真 0枚）。", "app/private/page.tsx:1602 「できた：」+ 762 行目 N人分を読み込みました（写真 M枚）。"],
  ["できた：6人分を読み込みました（写真 6枚）。", "app/private/page.tsx:1602 「できた：」+ 762 行目 N人分を読み込みました（写真 M枚）。"],
  ["できた：2人分を読み込みました（写真 2枚）。", "app/private/page.tsx:1602 「できた：」+ 762 行目 N人分を読み込みました（写真 M枚）。"],
  ["できた：3人分を読み込みました", "app/private/page.tsx:1602 「できた：」+ 762 行目 N人分を読み込みました（写真 M枚）。"],
  ["写真がない選手：6人（写真は、あとでOKです）", "app/private/page.tsx:1603 / 1677 '写真がない選手：' / '写真がない人 ' + 人数 + '人（写真は、あとでOKです）'"],
  ["写真がない人 6人（写真は、あとでOKです）", "app/private/page.tsx:1603 / 1677 '写真がない選手：' / '写真がない人 ' + 人数 + '人（写真は、あとでOKです）'"],
  ["1 選手の情報", "app/apply/page.tsx:678,878 丸の中の番号 + steps の名前"],
  ["2 連絡先", "app/apply/page.tsx:678,878 丸の中の番号 + steps の名前"],
  ["3 確認して送る", "app/apply/page.tsx:678,878 丸の中の番号 + steps の名前"],
  ["目安：戦績からは、Aクラスです", "core/classRules.ts:164 '戦績からは、' + 名前 + 'です' (「目安：」の見出しは画面側)"],
  ["目安：戦績からは、Bクラスです", "core/classRules.ts:164 '戦績からは、' + 名前 + 'です' (「目安：」の見出しは画面側)"],
  ["53kg契約", "core/privateTournament.ts:130 N + 'kg契約'"],
  ["戦績と合っていますか？ 戦績は2勝で、目安はBクラスです。", "core/classRules.ts:160 '戦績と合っていますか？ 戦績は' + 勝 + '勝で、目安は' + 名前 + 'です。'"],
  ["クラスを選んでください（AクラスかBクラス）。", "app/apply/page.tsx:186 'クラスを選んでください（' + 上 + 'か' + 下 + '）。'"],
  ["クラス：Aクラス", "app/private/cards.tsx:138 / page.tsx:1717 'クラス：' + 名前"],
  ["クラス：Bクラス", "app/private/cards.tsx:138 / page.tsx:1717 'クラス：' + 名前"],
  ["写真 0/6 あとでOK", "app/private/page.tsx:1854,1862 '写真 ' + 人数 + '/' + 全員 + 札『あとでOK』"],
  ["選手 6人 ✓", "app/private/page.tsx:1853,1855 '選手 ' + N + '人' / '試合 ' + M + 'つ' + 札『✓』"],
  ["試合 2つ ✓", "app/private/page.tsx:1853,1855 '選手 ' + N + '人' / '試合 ' + M + 'つ' + 札『✓』"],
  ["選手6人・試合2つ　✓ 保存済み", "app/private/page.tsx:1416 選手N人・試合M + line.short"],
  ["📍 いまここ：1 / 4　選手の情報", "app/apply/page.tsx:879 stepLine + 'いまここ：' + n + ' / 4　' + 名前 (スマホの狭い画面だけ)"],
  ["入力 11/11", "app/apply/page.tsx:977 '入力 ' + filled + '/' + total"],
];

const verifiedMap = new Map();
if (!flags.has("--no-verified")) for (const [t, why] of VERIFIED_COMPOSED) verifiedMap.set(trimEdge(collapse(t)).trim(), why);
const PLACEHOLDER = /[…⋯○◯△□＊]|\.{3}|〜〜|XX|○○/;
const cache = new Map();
function judge(raw) {
  if (cache.has(raw)) return cache.get(raw);
  const norm = trimEdge(collapse(raw)).trim();
  let res;
  if (!norm) {
    const bare = collapse(raw).trim(); // 絵文字・記号だけの 「🔒」「⌘」 は、そのまま探す
    if (!bare) res = { kind: "EMPTY", norm };
    else if (ui.c.includes(bare)) res = { kind: "UI", norm: bare };
    else if (doc.c.includes(bare)) res = { kind: "DOCS-ONLY", norm: bare };
    else res = { kind: "NONE", norm: bare };
  } else {
    const q = norm, qs = squeeze(norm);
    if (ui.c.includes(q)) res = { kind: "UI", norm };
    else if (doc.c.includes(q)) res = { kind: "DOCS-ONLY", norm };
    else if (ui.s.includes(qs)) res = { kind: "SPACE-ONLY", norm, where: "UI" };
    else if (doc.s.includes(qs)) res = { kind: "SPACE-ONLY", norm, where: "DOCS" };
    else if (verifiedMap.has(norm)) res = { kind: "VERIFIED", norm, why: verifiedMap.get(norm) };
    else {
      const t = templateMatch(norm);
      res = t ? { kind: "TEMPLATE", norm, snippet: t, abridged: /[…⋯]|\.{3}/.test(norm) } : { kind: "NONE", norm };
    }
  }
  cache.set(raw, res);
  return res;
}

// ---- 型の一致（{名前}・数字・… を「どんな文字でもよい所」として見る） ----
// 画面の文は、数や名前が入る「型」で作られていることが多い。型は合っていても、マニュアルの 「…」 は
// 「画面にそのまま出る文字」だけに使う決まりなので、実例の値入りのものは 『…』 にするのが正しい。
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function templateMatch(norm) {
  const frags = norm.split(/\{[^{}]*\}|[…⋯]|\.{3}|\d+/).map((x) => collapse(x).trim()).filter(Boolean);
  if (frags.length < 1 || frags.join("").length < 6 || Math.max(...frags.map((x) => x.length)) < 3) return null;
  let re;
  try { re = new RegExp(frags.map(escRe).join("[^\\n]{0,40}?")); } catch { return null; }
  const m = re.exec(ui.c);
  if (!m) return null;
  const from = Math.max(0, m.index - 6);
  return ui.c.slice(from, m.index + Math.min(m[0].length + 6, 160)).trim();
}

// ---- 部品ごとの一致（画面では2つ以上の部品がならんで出る文のヒント） ----
// 例：「次はここ：」の札 + 「作業1：…」の文。部品ごとには画面にあるが、つないだ形がソースに一続きでは無い場合。
// 直し方のヒント用（合否には使わない）：「部品A」「部品B」と分けて書けば、このロボットで確かめられる。
function ellipsisHint(norm) {
  if (!/[…⋯]|\.{3}/.test(norm)) return null;
  const segs = norm.split(/[…⋯]|\.{3}/).map((x) => trimEdge(collapse(x)).trim()).filter((x) => x.length >= 2);
  if (!segs.length) return null;
  return { hit: segs.filter((x) => ui.c.includes(x)), miss: segs.filter((x) => !ui.c.includes(x)) };
}
function partsHint(norm) {
  const parts = norm.split(/[：:→　 、。（）()／\/・]+/).map((x) => trimEdge(x).trim()).filter((x) => x.length >= 2);
  if (parts.length < 2) return null;
  const hit = parts.filter((x) => ui.c.includes(x));
  const miss = parts.filter((x) => !ui.c.includes(x));
  return { hit, miss };
}

// ---- ちかい候補（なおす文字の手がかり） ----
let candidates = null;
function buildCandidates() {
  const set = new Set();
  const jp = /[぀-ヿ㐀-鿿]/;
  const add = (s) => { s = collapse(decodeEscapes(s)).trim(); if (s.length >= 2 && s.length <= 120 && jp.test(s)) set.add(s); };
  for (const m of uiRaw.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) add(m[2]);
  for (const m of uiRaw.matchAll(/>([^<>{}\n][^<>{}]*)</g)) add(m[1]);
  // JSX の文字そのもの（行頭から始まる文）
  for (const m of uiRaw.matchAll(/^\s*([^\s<>{}=;()'"`\/][^<>{}=;]*)$/gm)) add(m[1]);
  candidates = [...set];
}
const bigrams = (s) => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); g.set(b, (g.get(b) ?? 0) + 1); } return g; };
function dice(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0, ta = 0, tb = 0;
  for (const v of a.values()) ta += v;
  for (const v of b.values()) tb += v;
  for (const [k, v] of a) if (b.has(k)) inter += Math.min(v, b.get(k));
  return (2 * inter) / (ta + tb);
}
function suggest(norm, n = 3) {
  if (!candidates) { buildCandidates(); candidates.bg = candidates.map((c) => bigrams(squeeze(c))); }
  const qb = bigrams(squeeze(norm));
  const top = [];
  for (let i = 0; i < candidates.length; i++) {
    const sc = dice(qb, candidates.bg[i]);
    if (sc < 0.4) continue;
    top.push([sc, candidates[i]]);
  }
  top.sort((x, y) => y[0] - x[0]);
  return top.slice(0, n).map(([sc, s]) => ({ score: sc, text: s }));
}

// ---- 結果 ----
const byKind = { VERIFIED: 0, UI: 0, "DOCS-ONLY": 0, "SPACE-ONLY": 0, TEMPLATE: 0, NONE: 0, EMPTY: 0 };
const problems = new Map(); // raw -> {res, lines[]}
const docsOnly = new Map();
const verifiedUsed = new Map();
const countAll = (n) => 1 + n.inner.reduce((c, k) => c + countAll(k), 0);
for (const f of found) {
  const res = judge(f.raw);
  byKind[res.kind]++;
  if (res.kind === "UI") continue;
  if (res.kind === "VERIFIED") { verifiedUsed.set(res.norm, res.why); continue; }
  const okTemplate = res.kind === "TEMPLATE" && flags.has("--allow-samples") && !res.abridged && !/\{[^{}]*\}/.test(res.norm);
  if (okTemplate) continue;
  const target = res.kind === "DOCS-ONLY" && !flags.has("--strict-docs") ? docsOnly : problems;
  if (!target.has(f.raw)) target.set(f.raw, { res, lines: [], inner: new Map() });
  const t = target.get(f.raw);
  t.lines.push(f.line);
  // 外側が見つからないとき、内側の 「…」 もそれぞれ調べて知らせる
  const walkInner = (n) => { for (const k of n.inner) { const r = judge(k.raw); if (r.kind !== "UI") t.inner.set(k.raw, r.kind); walkInner(k); } };
  walkInner(f);
}

const show = (s) => JSON.stringify(s).slice(1, -1);
console.log(`マニュアル: ${manualPath}`);
console.log(`画面フォルダ: ${builtDir}`);
console.log(`UI原本 ${uiFiles.length} ファイル / 資料 ${docFiles.length} ファイルを検索 (マニュアル自身 ${manualBase} は除外)`);
console.log(`「…」 の数(一番外側のみ): ${found.length} 個 (種類 ${new Set(found.map((f) => f.raw)).size})`);
console.log(`  UI一致 ${byKind.UI} / 手で確かめ済みの組み立て文 ${byKind.VERIFIED} / 資料のみ ${byKind["DOCS-ONLY"]} / 空白だけちがう ${byKind["SPACE-ONLY"]} / 画面の型は一致(実例の値あり) ${byKind.TEMPLATE} / 不一致 ${byKind.NONE} / 空 ${byKind.EMPTY}`);

if (flags.has("--list-verified")) {
  console.log(`\n== 手で確かめ済みの組み立て文 (${verifiedUsed.size}種類) ==`);
  for (const [t, why] of verifiedUsed) console.log(`  「${show(t)}」  ← ${why}`);
}

if (structural.length) {
  console.log(`\n== 「」の組み合わせの問題 (${structural.length}) ==`);
  for (const s of structural) console.log(`  L${s.line}: ${s.msg}`);
}

if (docsOnly.size && !flags.has("--strict-docs")) {
  console.log(`\n== 資料(docs)にだけある文字 (${docsOnly.size}種類) — 画面の文字か要確認。不一致ではありません ==`);
  for (const [raw, { lines }] of docsOnly) console.log(`  L${lines.slice(0, 8).join(",")}${lines.length > 8 ? ",…" : ""}  「${show(raw)}」`);
}

const list = [...problems.entries()].sort((a, b) => a[1].lines[0] - b[1].lines[0]);
if (list.length) {
  console.log(`\n== 見つからない文字 (${list.length}種類 / ${list.reduce((n, [, v]) => n + v.lines.length, 0)}か所) ==`);
  for (const [raw, { res, lines, inner }] of list) {
    const tag = res.kind === "TEMPLATE" ? (res.abridged ? "[省略…あり／画面の型には一致]" : "[実例の値入り／画面の型には一致]") : res.kind === "SPACE-ONLY" ? "[空白だけちがう]" : res.kind === "EMPTY" ? "[空]" : res.kind === "DOCS-ONLY" ? "[資料のみ]" : "[なし]";
    const ph = PLACEHOLDER.test(raw) ? " (伏せ字/省略あり)" : "";
    console.log(`  L${lines.slice(0, 10).join(",")}${lines.length > 10 ? `,…(計${lines.length})` : ""}  ${tag}${ph} 「${show(raw)}」`);
    for (const [ir, ik] of inner) console.log(`        内側の 「${show(ir)}」 も ${ik === "EMPTY" ? "空" : "見つかりません"}`);
    if (res.kind === "TEMPLATE") console.log(`        型の原本: …${res.snippet}…`);
    {
      const eh = res.kind === "NONE" || res.kind === "TEMPLATE" ? ellipsisHint(res.norm) : null;
      if (eh) console.log(`        …の前後: 画面にそのままある[${eh.hit.join(" | ")}] / 見つからない[${eh.miss.join(" | ")}]  → …の手前までを 「」 にし、あとは 「」 の外に書く`);
    }
    if (res.kind === "NONE") {
      const ph2 = partsHint(res.norm);
      if (ph2) console.log(`        部品: 画面にある[${ph2.hit.join(" | ")}] / 見つからない[${ph2.miss.join(" | ")}]`);
    }
    if (res.kind === "NONE" && !flags.has("--no-suggest")) {
      for (const s of suggest(res.norm)) console.log(`        近い候補(${s.score.toFixed(2)}): ${s.text}`);
    }
  }
}

const bad = list.length + structural.length;
console.log(bad ? `\nNG: ${bad} 件の問題があります。` : "\nOK: すべての 「…」 が見つかりました。");
process.exit(bad ? 1 : 0);
