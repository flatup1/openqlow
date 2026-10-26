/**
 * 採点で見つかった問題（設定の画面・他のジム用の入力画面）の直しを固定する試験。
 * 1) 受付の版が 3.20261024.1 のとき、黄色の注意を1つ出す（シートの戦績が「3勝2敗」の形のまま）。リンクは止めない
 * 2) Googleが答えないとき、20秒で待つのをやめる。待っている間に押した「もう一度確かめる」は、待っている確かめを止めて、新しく確かめる
 * 3) 他のジム用の入力画面：ZIPを作る部品は、開いたときに読みこむ。作れないときは、赤い文で言う
 * 4) 他のジム用の入力画面：閉じる・読み直す前に確認を出す（保存したあとは外す）
 * 5) 他のジム用の入力画面：「この選手を取り消す」は10秒だけ元にもどせる。文字は17px以上、ボタンは48px以上、黄色の「👉 次はここ」は1つ
 * 画面のふるまいは scripts/test-polish-setup.mjs の S22〜S26 が、本物のブラウザで確かめる。ここでは、関数の答えと、ソースの形を固定する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCEPTED_RECEPTION_BUILDS, diagnose, entryConfigFromPing, EXPECTED_RECEPTION_BUILD, parsePing, PING_TIMEOUT_MS, recordTextCaution, supportsRecordDetail, supportsRecordText, supportsWeightClasses } from '../core/setupV3.ts';
import { publicEntryConfig, publicEntryHash } from '../core/publicEntry.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const SETUP = read('app/private/setup/page.tsx');
const ENTRY = read('app/private/entry/page.tsx');
const endpoint = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const full = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: 'テスト大会', date: '2099-12-01', venue: '体育館', venueUrl: '', organizer: '主催ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
/** ソースの中の、ある文字から、次の空行（または終わり）までを切り出す */
const block = (source: string, start: string, end: string): string => { const at = source.indexOf(start); assert.ok(at >= 0, start + ' が見つからない'); const to = source.indexOf(end, at); return source.slice(at, to > at ? to : undefined); };

/* ───────── 1) 3.20261024.1 の黄色の注意 ───────── */

test('1-correctness: 受付の版が 3.20261024.1 のときだけ、シートの戦績を「5戦3勝2敗」にする方法の黄色の注意を出す（新しい版・古い版・知らない版には出さない）', () => {
  const before = '3.20261024.1';
  assert.ok((ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes(before));
  const note = recordTextCaution({ build: before });
  assert.ok(note, '3.20261024.1 には注意を出す');
  const text = note.lead + note.body;
  assert.match(note.lead, /^シートの戦績を「5戦3勝2敗」の形にするには、/);
  assert.ok(text.includes('新しい版（' + EXPECTED_RECEPTION_BUILD + '）'), '貼る版の番号を言う');
  assert.match(text, /「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」/);
  assert.match(text, /そのあと、シートのメニュー「Tournament OS」→「① 最初の設定」を押します。/);
  assert.match(text, /今のままでも、申し込みは受け付けます/, 'リンクは止めないと言う');
  assert.doesNotMatch(text, /黄色|赤い|クラス/);
  // 新しい版・くわしい戦績の無い古い版（その版には、前からある別の注意が出る）・知らない版・ping が無いときは、出さない
  for (const build of [EXPECTED_RECEPTION_BUILD, '3.20261022.7', '3.20261019.6', '3.20261010.5', '3.20261004.4', '3.0.0', '3.20261099.9', '']) assert.equal(recordTextCaution({ build }), undefined, build);
  assert.equal(recordTextCaution(null), undefined); assert.equal(recordTextCaution(undefined), undefined);
  assert.equal(supportsRecordText({ build: EXPECTED_RECEPTION_BUILD }), true);
  assert.equal(supportsRecordText({ build: before }), false);
  // 3.20261024.1 は、ほかの黄色の注意（クラス・階級分け・くわしい戦績の欄）の対象ではない → 注意は、この1つだけ
  assert.equal(supportsWeightClasses({ build: before }), true);
  assert.equal(supportsRecordDetail({ build: before }), true);
  assert.notEqual(before, ACCEPTED_RECEPTION_BUILDS[0], 'クラス分けの無い、いちばん古い版ではない');
});

test('1-correctness: 3.20261024.1 でも、受付できる・選手に渡すリンクは作れる（注意は止めない）。画面は、その注意を手順3の「選手に渡すURL」に1つだけ出す', () => {
  const ping = parsePing({ ...full, build: '3.20261024.1' });
  assert.equal(diagnose(ping).stage, 'ready');
  const live = entryConfigFromPing(ping, endpoint, 'live');
  assert.equal(live.recordDetail, true, 'くわしい戦績の欄は、今までどおり付く');
  assert.equal(publicEntryConfig(publicEntryHash(live)).recordDetail, true);
  // 画面：注意は recordTextCaution から作る。前からある「くわしい戦績は新しい版で使えます」より先に見て、2つ同時には出さない
  const caution = block(SETUP, 'const recordText = recordTextCaution(ping);', '</Caution>;\n');
  assert.match(caution, /recordText \? <div id="record-text-note"><Caution className="mt-3" lead=\{recordText\.lead\}><p>\{recordText\.body\}<\/p><\/Caution><\/div>/);
  assert.match(caution, /: supportsRecordDetail\(ping\) \? null\s*\n\s*: <Caution className="mt-3" lead="くわしい戦績（キック・他の格闘技・タイトル）は、新しい版のシートで使えます。">/, '古い版の注意は、今までのまま');
  assert.equal((SETUP.match(/\{recordCaution\}/g) ?? []).length, 1, '出す場所は、手順3の1か所');
  // 次へ進む・URLのコピーを止める条件（blocked・urlReady）には、入っていない
  const blocked = block(SETUP, 'const blocked = ', ';\n');
  assert.doesNotMatch(blocked, /record/i);
  assert.doesNotMatch(block(SETUP, 'const urlReady = ', ';\n'), /record/i);
});

/* ───────── 2) Googleが答えないとき ───────── */

test('9-errors: 接続の確かめは、20秒で待つのをやめる（AbortController）。止まったときは、つながらないときと同じ案内（net）。手で押したら、待っている確かめを止めて、新しく確かめる', () => {
  assert.equal(PING_TIMEOUT_MS, 20_000);
  const check = block(SETUP, 'const check = async (mode', '\n  };\n');
  assert.match(check, /if \(mode === 'manual'\) pendingPing\.current\?\.abort\(\);\s*\n\s*const mine = \+\+seq\.current;/, '手で押したときは、前の確かめを止めてから、番号を進める');
  assert.match(check, /const controller = new AbortController\(\);\s*\n\s*pendingPing\.current = controller;\s*\n\s*const timer = window\.setTimeout\(\(\) => controller\.abort\(\), PING_TIMEOUT_MS\);/);
  assert.match(check, /await fetch\(url, \{ cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(check, /finally \{\s*\n\s*window\.clearTimeout\(timer\);\s*\n\s*if \(pendingPing\.current === controller\) pendingPing\.current = null;/, '終わったら、時計を止める');
  assert.equal((SETUP.match(/fetch\(/g) ?? []).length, 3, 'Googleへ出る通信は、ふえていない');
  // 止めたときのエラー（AbortError）は、SyntaxError でも「Tournament OS」の文でもないので、classifyPingError は 'net' と読む
  assert.match(SETUP, /function classifyPingError\(error: unknown\): PingError \{\s*\n\s*if \(error instanceof SyntaxError\) return 'access';\s*\n\s*if \(error instanceof Error && error\.message\.includes\('Tournament OS'\)\) return 'wrong-app';\s*\n\s*return 'net';/);
  const aborted = new AbortController(); aborted.abort();
  const reason = aborted.signal.reason as Error;
  assert.equal(reason instanceof SyntaxError, false); assert.equal(String(reason?.message ?? '').includes('Tournament OS'), false);
  // net になると「自動で確かめられないとき（貼って確かめる）」が開き、黄色は「もう一度確かめる」
  assert.match(SETUP, /openSignal=\{pingError === 'net' \|\|/);
  assert.match(SETUP, /if \(pingError === 'net'\) return \{ id: 'recheck', label: 'もう一度確かめる' \};/);
  // 「もう一度確かめる」：確かめている間も押せる（押しても何も起きない、をやめた）。1秒の間の2回押し・3回押しは、1回にまとめる
  const btn = block(SETUP, 'const recheckBtn = ', '}} className={cls}>もう一度確かめる</button>;');
  assert.doesNotMatch(btn, /if \(checking\) return;/);
  assert.match(btn, /aria-disabled=\{!urlOk \|\| undefined\} aria-busy=\{checking\}/);
  assert.match(btn, /if \(checking && Date\.now\(\) - manualAt\.current < 1000\) return;\s*\n\s*manualAt\.current = Date\.now\(\);\s*\n\s*void check\('manual'\);/);
});

/* ───────── 3) ZIPを作れないとき ───────── */

test('9-errors: 他のジム用の入力画面は、ZIPを作る部品を開いたときに読みこむ（押したときに読みこまない）。作れないときは赤い文を出し、入れた選手を消さない', () => {
  assert.match(ENTRY, /^import \{ strToU8, zipSync \} from 'fflate';$/m, 'ファイルの上で読みこむ');
  assert.doesNotMatch(ENTRY, /import\(['"]fflate['"]\)/, '押したときに読みこまない');
  const download = block(ENTRY, 'const download = () => {', '\n  };\n');
  assert.doesNotMatch(download, /await|async/, '待つものが無い（押した、その場で作る）');
  assert.match(download, /try \{[\s\S]*zipSync\(files, \{ level: 6 \}\)[\s\S]*anchor\.click\(\);[\s\S]*setSavedList\(fighters\);[\s\S]*\} catch \{[\s\S]*setMessage\(\{ kind: 'error', head: '保存できませんでした：', lines: \[ZIP_FAILED\] \}\);/);
  assert.match(ENTRY, /const ZIP_FAILED = 'ZIPファイルを作れませんでした。入れた選手は、消えていません。この画面は閉じずに、[^']*もう一度「📥 提出ファイルを保存する」を押します。';/);
  assert.doesNotMatch(download.slice(download.indexOf('catch')), /setFighters|setSavedList/, '失敗したときは、選手も、保存の印も変えない');
  assert.match(ENTRY, /\{message\.head \?\? \(message\.lines\.length > 1 \?/, '見出しは、ふだんは今までどおり「まちがい：」');
  assert.match(ENTRY, /onClick=\{\(\) => download\(\)\}/);
});

/* ───────── 4) 閉じる前の確認 ───────── */

test('9-errors / 3-ux: 他のジム用の入力画面は、保存していない選手・入れている途中の欄があるあいだ、閉じる前に確認を出す。保存したあとは外す。上の説明に1行', () => {
  assert.match(ENTRY, /const formHasInput = !!photo \|\| Object\.entries\(current\)\.some\(\(\[key, value\]\) => key !== 'id' && key !== 'gym' && typeof value === 'string' && value\.trim\(\) !== ''\);/, '前の選手から引きついだジム名だけでは、聞かない');
  assert.match(ENTRY, /const unsaved = \(fighters\.length > 0 && fighters !== savedList\) \|\| formHasInput;/);
  const guard = block(ENTRY, 'useEffect(() => {\n    // 入れた選手と写真は', '}, [unsaved]);');
  assert.match(guard, /if \(!unsaved\) return;/);
  assert.match(guard, /event\.preventDefault\(\); event\.returnValue = '';/);
  assert.match(guard, /window\.addEventListener\('beforeunload', guard\);\s*\n\s*return \(\) => window\.removeEventListener\('beforeunload', guard\);/);
  assert.equal((ENTRY.match(/setSavedList\(/g) ?? []).length, 1, '保存の印を付けるのは、ZIPを保存できたときだけ');
  assert.match(ENTRY, /<p id="entry-close-note"[^>]*>閉じると、入れた選手は消えます。先に「提出ファイルを保存する」を押します。<\/p>/);
  assert.ok(ENTRY.includes('インターネットへ送信されません'), '前からの説明は、そのまま');
});

/* ───────── 5) 取り消しの「元にもどす」・文字とボタンの大きさ・黄色の「次はここ」 ───────── */

test('3-ux: 「この選手を取り消す」は、すぐ消して「消しました：○○さん（元にもどす）」を10秒だけ出す。2回押しで、となりの選手まで消さない', () => {
  assert.match(ENTRY, /const UNDO_MS = 10_000;/);
  const remove = block(ENTRY, 'const remove = (index: number) => {', '\n  };\n');
  assert.match(remove, /if \(now - lastRemoveAt\.current < 700\) return;/);
  assert.match(remove, /setFighters\(\(old\) => old\.filter\(\(_, i\) => i !== index\)\);\s*\n\s*setMessage\(\{ kind: 'removed', fighter, index \}\);/);
  assert.match(remove, /getElementById\('entry-undo'\)\?\.focus\(\)/, '押したボタンは消えるので、目印を「元にもどす」へ');
  const undo = block(ENTRY, 'const undo = () => {', '\n  };\n');
  assert.match(undo, /\[\.\.\.old\.slice\(0, index\), fighter, \.\.\.old\.slice\(index\)\]/, '元の場所に、写真ごと戻す');
  assert.match(undo, /old\.some\(\(item\) => item\.id === fighter\.id\) \? old :/, '2回押しても、2人にならない');
  assert.match(ENTRY, /if \(message\?\.kind !== 'removed'\) return;\s*\n\s*const timer = window\.setTimeout\(\(\) => setMessage\(\(now\) => \(now === message \? null : now\)\), UNDO_MS\);/);
  assert.match(ENTRY, /消しました：\{message\.fighter\.name\}さん。まちがえたときは、10秒のあいだに「元にもどす」を押します。<\/p><button id="entry-undo" type="button" onClick=\{undo\} className="tos-safe-btn /);
  assert.match(ENTRY, /onClick=\{\(\) => remove\(index\)\} className="tos-danger-btn mt-3 text-\[17px\]">この選手を取り消す<\/button>/);
  assert.doesNotMatch(ENTRY, /old\.filter\(\(_,i\)=>i!==index\)\)\} className/, 'その場で消すだけのボタンは無い');
});

test('3-ux: 他のジム用の入力画面の文字は17px以上（text-sm・text-base を使わない）。ボタンは48px以上。黄色の「👉 次はここ」は、ほかの画面と同じ部品で、1つだけ', () => {
  assert.doesNotMatch(ENTRY, /\btext-(?:xs|sm|base)\b/);
  assert.match(ENTRY, /const input = 'mt-1 w-full rounded-xl border-2 border-slate-500 bg-white p-3 text-\[17px\]';/);
  assert.match(ENTRY, /<main className="min-h-screen bg-slate-50 px-4 py-8 text-\[17px\] text-slate-950">/, 'ふつうの文字（見出し・欄の名前）も17px');
  const css = read('app/globals.css');
  assert.match(css, /\.tos-danger-btn\{min-height:48px;/); assert.match(css, /\.tos-safe-btn\{min-height:56px;/);
  // 黄色の「👉 次はここ」は、準備の画面と同じ NextSlot（.tos-next と札）。置く場所は2つで、どちらか1つだけが光る
  assert.match(ENTRY, /^import \{ NextSlot \} from '\.\.\/marks\.tsx';$/m);
  assert.equal((ENTRY.match(/<NextSlot /g) ?? []).length, 2);
  assert.match(ENTRY, /<NextSlot active=\{nextSpot === 'add'\} label="上の欄を入れたら、「この選手を追加」を押す"><button type="button" onClick=\{add\} className="[^"]*">この選手を追加<\/button><\/NextSlot>/);
  assert.match(ENTRY, /<NextSlot active=\{nextSpot === 'save'\} label="全員入れたら、「提出ファイルを保存する」を押す"><button type="button" onClick=\{\(\) => download\(\)\} className="[^"]*text-white">📥 提出ファイルを保存する<\/button><\/NextSlot>/, '黄色の枠の中でも、ボタンの字は白のまま');
  assert.match(ENTRY, /const nextSpot: 'add' \| 'save' \| null = formHasInput \|\| !fighters\.length \? 'add' : fighters !== savedList \? 'save' : null;/);
});
