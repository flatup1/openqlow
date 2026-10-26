// 採点（2026-10-22・60/100）からの最適化（R6）を、ソースと文書を読んで確かめる試験。
//   R6a 申し込みページ：測っていない「約3分」をやめる／締切を過ぎた本番は欄と送信を止める／確認画面のメールの折り返し／身長 1.70m の直し／「二重になりません」の言い過ぎ／使い道の文
//   R6b 文書：署名の置きかえ／クラスの表／締切 12/7／約30分／データの置き場／3勝ちょうど／古い数／名前の掃除／Vol.7
//   R6c 道具：ラベルのロボットの既定の場所
// 画面で動くこと（欄が灰色になる・メールが折り返す・1.70m が 170 になる）は、scripts/test-apply-deadline.mjs の本物の Chromium で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const noComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const PAGE = read('app/apply/page.tsx'), SETUP = read('app/private/setup/page.tsx'), MANUAL = read('docs/TOURNAMENT_OS_使い方マニュアル.md');
const PAGE_CODE = noComments(PAGE);
const docsOf = (): string[] => readdirSync(join(ROOT, 'docs')).filter((name) => name.endsWith('.md'));
/** 申し込みページの「使い道」の1行ずつ（<li>…</li> の文字）。{…} の式の行は、文字だけを取り出す */
const privacyItems = (): string[] => {
  const fold = PAGE.slice(PAGE.indexOf('<Fold id="privacy-fold"'), PAGE.indexOf('<Fold title="困ったとき"'));
  return Array.from(fold.matchAll(/<li>([^<{]+)<\/li>/g), (m) => m[1]);
};

/* ───────── R6a-1：約3分 → 事実の文 ───────── */

test('R6a-1: 申し込みページにも設定の画面にも「約3分」が無い。かわりに「用意するもの：顔写真1枚。入力は全部で◯個です。」を、「入力 N/M」と同じ数（total）から作る', () => {
  for (const [name, text] of [['申し込みページ', PAGE], ['セットアップ画面', SETUP]] as const) assert.doesNotMatch(text, /約3分/, name);
  for (const file of ['app/apply/page.tsx', 'app/private/page.tsx', 'app/private/live/page.tsx', 'app/private/sheet/page.tsx']) assert.doesNotMatch(read(file), /約3分で終わります/, file);
  assert.match(PAGE_CODE, /\{`用意するもの：顔写真1枚。入力は全部で\$\{total\}個です。`\}/, '固定の数字を書かず、total から出す');
  assert.match(PAGE_CODE, /入力 \{filled\}\/\{total\}/, '下の「入力 N/M」の M も、同じ total');
  assert.doesNotMatch(PAGE_CODE, /入力は全部で\d+個/, '数字を直接書かない');
});

test('R6a-1: 説明書にも、申し込みの所要時間の「約3分」が残っていない（ひな形のコピーなど、会長の手順の「約3分」は別）。画面の文は、説明書の例と同じ形', () => {
  for (const old of ['約3分で終わります', '1人あたり約3分', '保護者の方の入力は、約3分']) assert.ok(!MANUAL.includes(old), old);
  assert.ok(MANUAL.includes('用意するもの：顔写真1枚。入力は全部で14個です。'), '例（14は、この手順書の大会＝クラス分けあり・学年/年齢/意気込み必須。リンクの設定で変わる。1259の「14/14」と同じ）');
  assert.ok(!MANUAL.includes('入力は全部で13個です'), '13の例は残っていない（1259の「14/14」とそろえた）');
  assert.ok(MANUAL.includes('入力は全部で{入力の数}個です。'), '画面の文の表（184）');
  assert.ok(MANUAL.includes('約3分'), '会長の手順の「約3分」（ひな形のコピーなど）は、そのまま');
});

/* ───────── R6a-2：締切を過ぎた本番は、欄と送信を止める ───────── */

test('R6a-2: 締切を過ぎた本番（mode が test でない）は、欄（fieldset）・確認のボタン・送信を止め、理由を2か所に出す。テスト用は止めない。判定は deadlinePassed のまま', () => {
  assert.match(PAGE_CODE, /const deadlineLocked = deadlinePassed && config\.mode !== 'test';/);
  assert.match(PAGE_CODE, /<fieldset disabled=\{sending \|\| !endpointReady \|\| deadlineLocked\}/, '入力欄が止まる');
  assert.match(PAGE_CODE, /<button id="f-submit" disabled=\{sending\|\|photoLoading\|\|!endpointReady\|\|deadlineLocked\}/, '確認のボタンが止まる');
  assert.match(PAGE_CODE, /const locked = sending \|\| photoLoading \|\| !endpointReady \|\| deadlineLocked;/, 'ボタンは灰色の点線（tos-locked）になる');
  assert.match(PAGE_CODE, /if \(deadlineLocked\) return;/, 'submit の最初の守り（Enter 等でも通らない）');
  assert.match(PAGE_CODE, /const deadlineLockText = '申し込みの締切（' \+ deadlineShort \+ '）を過ぎました。主催者に連絡してください';/);
  assert.match(PAGE_CODE, /deadlineLocked \? deadlineLockText :/, 'ボタンの下に理由（LockReason）');
  assert.match(PAGE_CODE, /\{deadlineLockText\}/, 'ページの上にも同じ文');
  assert.match(PAGE_CODE, /if \(deadlineLocked\) nextKind = tel \? 'call' : 'none';/, '黄色の「次はここ」は、電話のところの1つだけ（電話番号が無ければ置かない）');
  assert.match(PAGE_CODE, /const cardNow = deadlineLocked \? card\.replace\('bg-white', 'bg-slate-100'\) : card;/, '欄の箱は灰色');
  // 締切が空のリンクは、今まで通り（deadlinePassed が立たない）
  assert.match(PAGE_CODE, /\} else setDeadlinePassed\(false\);/);
  // 判定は、今の deadlinePassed（日本時間・締切日の終わりまで有効）のまま
  assert.match(PAGE_CODE, /setDeadlinePassed\(today > dl\.y \* 10000 \+ dl\.m \* 100 \+ dl\.d\)/);
  assert.match(PAGE_CODE, /new Date\(Date\.now\(\) \+ 9 \* 60 \* 60 \* 1000\)/);
});

test('R6a-2: 説明書に、止まったときの画面（理由の文・テスト用は止まらない）が書いてある', () => {
  assert.match(MANUAL, /締切を過ぎたあとに開くと：本物のリンクでは、入力する欄と「入力内容を確認する →」が灰色になり、押せません/);
  assert.match(MANUAL, /テスト用のリンクでは、止まりません/);
  assert.ok(MANUAL.includes('申し込みの締切（{M月D日}）を過ぎました。主催者に連絡してください'));
});

/* ───────── R6a-3：確認画面のメールアドレス ───────── */

test('R6a-3: 確認画面のメールアドレスは [overflow-wrap:anywhere]（break-words ではない）で、1つの文字列として折り返す。折れてよい所は「@のあと」と「.のまえ」だけ（<wbr> は文字を足さない）', () => {
  assert.match(PAGE_CODE, /<dd id="review-email" className="\[overflow-wrap:anywhere\] text-2xl font-black">\{emailBreaks\(email\)\}<\/dd>/);
  assert.doesNotMatch(PAGE_CODE, /<dd[^>]*className="break-words text-2xl font-black">\{(?:email|emailBreaks\(email\))\}/);
  // 折れ目の入れ方：トークン（@・.・それ以外の連なり）に分け、「.」のまえと「@」のあとに <wbr> を置く。文字は1つも変えない・足さない
  assert.match(PAGE_CODE, /const emailBreaks = \(value: string\): ReactNode\[\] => \(value\.match\(\/\[\^@\.\]\+\|@\|\\\.\/g\) \?\? \[\]\)\.map\(/);
  assert.match(PAGE_CODE, /token === '\.' \? <wbr \/> : null\}\{token\}\{token === '@' \? <wbr \/> : null/);
});

/* ───────── R6a-4：身長 ───────── */

test('R6a-4: 身長は、m で入れた形（1.70m・1.7m・1m70・メートル）だけ cm に直す。範囲の外の身長は「cm で入れてください。例：170」と言う', () => {
  assert.match(PAGE_CODE, /function normalizeHeight\(value: string\): string \{/);
  assert.match(PAGE_CODE, /height: normalizeHeight\(f\.height\),/);
  assert.match(PAGE_CODE, /\^\(\[12\]\)\[\.,\]\(\\d\{1,2\}\)m\$/);
  assert.match(PAGE_CODE, /\^\(\[12\]\)m\(\\d\{2\}\)\$/);
  assert.match(PAGE_CODE, /text: '身長は cm で入れてください。例：170'/);
  assert.doesNotMatch(PAGE_CODE, /身長は\$\{low\}から/, '身長の範囲の文は、体重の文と分けた');
  // 体重の文は、今まで通り
  assert.match(PAGE_CODE, /`\$\{label\}は\$\{low\}から\$\{high\}の間の数字です。例：\$\{example\}`/);
});

/* ───────── R6a-5：二重 ───────── */

test('R6a-5: 「困ったとき」は、「同じ画面から送り直した分は、二重になりません。（もう一度ページを開いて入れ直した分は、別の申し込みになります）」と、言い過ぎない', () => {
  assert.ok(PAGE.includes('同じ画面から送り直した分は、二重になりません。（もう一度ページを開いて入れ直した分は、別の申し込みになります）'));
  assert.ok(!PAGE.includes('同じ申し込みは、二重になりません。'));
  // 説明書の画面の一覧表（252）も、同じ2つの文（古い言い過ぎが残っていない）
  assert.ok(MANUAL.includes('同じ画面から送り直した分は、二重になりません。（もう一度ページを開いて入れ直した分は、別の申し込みになります）'));
  assert.ok(!MANUAL.includes('同じ申し込みは、二重になりません。'), '説明書にも、古い言い過ぎが残っていない');
  // 同じ画面での再送を言う、ボタンと一文は、そのまま
  assert.ok(PAGE.includes("'もう一度送る（二重になりません）'")); assert.ok(PAGE.includes('前と同じ内容なので、二重にはなりません。'));
});

/* ───────── R6a-6 / 7：使い道 ───────── */

test('R6a-6/7: 使い道の文は、実際の画面（会場の画面とA3の表）と合う。見る人の言い方は1つ。花道の1行は「アナウンスで読み上げることがある」。説明書の同じ文と1字も違わない', () => {
  const items = privacyItems();
  assert.ok(items.includes('見る人：申し込みの元データは、主催者と運営スタッフだけが見ます'), items.join(' | '));
  assert.ok(items.includes('使うこと：組み合わせ作り、大会の連絡、当日の会場の画面（名前・写真・ジム名・クラス・階級・一言）と、掲示する対戦一覧表（名前・ジム名・写真）での紹介'));
  assert.ok(items.includes('電話番号とメールは、会場の画面にも、掲示する対戦一覧表にも出ません。'));
  assert.ok(PAGE.includes('<li>花道の質問の答え（フリガナ・リングネーム・生年月日・キック歴・練習頻度・他格闘歴・職業・趣味・始めた理由・メッセージ）は、会場のアナウンスで読み上げることがあります。会場の画面や掲示する表には、出ません。</li>'));
  // 送る前の確認の文も、同じ言い方
  assert.match(PAGE_CODE, /（主催者と運営スタッフだけが見ます）。/);
  for (const wrong of ['戦績・一言', '主催者と、大会の運営の人', '主催者だけが見ます', '主催者だけが見られます']) assert.ok(!PAGE.includes(wrong), wrong);
  // 説明書（画面の文の表 219）と同じ文
  for (const text of [...items.filter((item) => /^(見る人|使うこと)：|^電話番号とメールは/.test(item)), '花道の質問の答え（フリガナ・リングネーム・生年月日・キック歴・練習頻度・他格闘歴・職業・趣味・始めた理由・メッセージ）は、会場のアナウンスで読み上げることがあります。会場の画面や掲示する表には、出ません。']) assert.ok(MANUAL.includes(text), '説明書に同じ文がある：' + text.slice(0, 30));
  for (const wrong of ['名前・写真・戦績・一言', '主催者と、大会の運営の人']) assert.ok(!MANUAL.includes(wrong), '説明書に古い文が残っていない：' + wrong);
  assert.ok(read('docs/追加要件_04_花道用プロフィールの別枠.md').includes('申し込みの元データは、主催者と運営スタッフだけが見ます'));
});

/* ───────── R6b：15分 → 約30分 ───────── */

test('R6b: セットアップは「約30分（はじめての人）」。画面・章の見出し・目次・説明書の画面の文の表・「できた目印」が同じ文で、「15分くらい」が残っていない', () => {
  const said = SETUP.match(/\{step === 1 \? <><p className="mt-2">([^<]+)<\/p><p className="mt-1 text-\[17px\] text-slate-700">([^<]+)<\/p><\/> : null\}/);
  assert.equal(said?.[1], 'はじめての人は、約30分かかります。順番にボタンを押すだけです。');
  assert.equal(said?.[2], '約30分は目安です。まだ測っていません。人によって変わります。', '測っていない時間は、目安（見積もり）と言う');
  assert.ok(MANUAL.includes('約30分は目安です。まだ測っていません。人によって変わります。'), '説明書にも同じ文');
  assert.ok(!SETUP.includes('15分くらい'));
  assert.ok(MANUAL.split(said![1]).length - 1 >= 2, '説明書に、画面と同じ文が2か所（できた目印・画面の文の表）');
  assert.equal(MANUAL.match(/第3章　大会ごとの最初のセットアップ（約30分・はじめての人）/g)?.length, 2, '目次と章の見出し');
  for (const old of ['セットアップ（約15分）', '15分くらいで終わります', '約20〜30分']) assert.ok(!MANUAL.includes(old), old);
  assert.ok(MANUAL.includes('10＋5＋7＋8＝30分'), '「これだけ読めばOK」の表の足し算');
  // 会長本人テストの「15分」（作成→再開→引継ぎ）は、別の話なので残る
  assert.ok(MANUAL.includes('15分以内'));
});

/* ───────── R6b：文書のくいちがい ───────── */

test('R6b: 署名は置きかえ済み。02 の署名の段落に印があり、決定ログが1か所（02の末尾）。03・04 はそこを指す', () => {
  const d02 = read('docs/追加要件_02_誓約書の掲載と同意必須.md'), d03 = read('docs/追加要件_03_誓約書の同意記録の保存.md'), d04 = read('docs/追加要件_04_花道用プロフィールの別枠.md');
  const mark = '（置きかえ済み：2026-10-22 の決定で署名は作らない。`docs/追加要件_02` 末尾の決定ログを見る）';
  assert.ok(d02.split(mark).length - 1 >= 3, '署名の案・指で書く署名・署名の画像の保存、の3か所に印');
  assert.equal(d02.match(/^## 決定ログ（2026-10-22）/gm)?.length, 1, '決定ログは1か所');
  const log = d02.slice(d02.indexOf('## 決定ログ（2026-10-22）'));
  for (const word of ['署名は作らない', 'チェックだけ', '名前＋携帯電話＋「許可をとっている」念押しのチェック', 'owner が原本から貼った文字', '会長の確認ゲート', 'pledgeconfirm', '誓約記録']) assert.ok(log.includes(word), word);
  assert.ok(d02.indexOf(mark) < d02.indexOf('## 決定ログ（2026-10-22）'));
  assert.match(d03, /置きかえ済み（2026-10-22）[\s\S]*決定ログ（2026-10-22）/);
  assert.match(d04, /決定ログ（2026-10-22）/);
  assert.match(d03, /### 作らないもの\n手書き・電子の署名/, '03の「作らないもの」は、そのまま（02と同じ向き）');
});

test('R6b: クラスの要件の表は、初期値（DEFAULT_CLASS_SETTINGS）と同じ文。古い文は「置きかえ済み」として残る。ヘッダは実際の状態', () => {
  const doc = read('docs/次回大会_クラス区分_要件.md');
  const now = doc.slice(doc.indexOf('## クラスの定義（いまの初期値'), doc.indexOf('## 置きかえ済み：2026-10-10 の古い文')).replace(/\*\*/g, '');
  for (const text of [DEFAULT_CLASS_SETTINGS.upper.rule, DEFAULT_CLASS_SETTINGS.lower.rule, DEFAULT_CLASS_SETTINGS.upper.condition, DEFAULT_CLASS_SETTINGS.lower.condition.replace(/（例：初出場、2勝1敗、1勝3敗）/, '')]) assert.ok(now.includes(text), text);
  assert.ok(!now.includes('パンチとキックのみ'), 'いまの表に、古い「パンチとキックのみ」は無い');
  assert.ok(doc.includes('置きかえ済み：2026-10-10 の古い文') && doc.includes('パンチとキックのみ'));
  assert.match(doc.split('\n').slice(0, 5).join('\n'), /作成ずみ/);
  assert.ok(!doc.split('\n').slice(0, 5).join('\n').includes('要件は確定'));
  assert.ok(doc.includes('3勝ちょうどは、Aクラス') && doc.includes('owner 回答 2026-10-22'));
});

test('R6b: 申込締切は 12/7（owner 決定・確認待ち）。階級分けの清書・整理案・追加要件00・06が、同じ向き。食い違いの一覧の元は、整理案の8章だけ', () => {
  const classDoc = read('docs/次回大会_階級分け_要件.md'), plan = read('docs/募集要項_整理案_会長確認前・提案版.md'), d00 = read('docs/追加要件_00_一覧と順番.md'), d06 = read('docs/追加要件_06_メディカルフォーム.md');
  const six = classDoc.split('\n').find((line) => line.startsWith('6. **次回大会の「設定」タブに書く文'))!;
  assert.ok(six.includes('申込締切＝**2026年12月7日**') && six.includes('owner 決定・確認待ち') && six.includes('前の清書の「2026年12月11日」は置きかえ済み'));
  assert.ok(six.includes('大会名＝**会長に確認**') && six.includes('試合の始まる時刻＝**10:30**（決定：owner 回答 2026-10-22'), '時刻は、00・整理案と同じ「決定：10:30」（「会長に確認」と言う文書が残っていない）');
  assert.ok(!six.includes('試合の始まる時刻＝**会長に確認**'));
  assert.ok(!/申込締切＝2026年12月11日/.test(classDoc));
  assert.ok(plan.includes('owner 決定（2026-10-22）：12/7。確認待ち。') && !plan.includes('これまで設定に入れた値は12月11日'));
  assert.ok(d00.includes('| 申込締切 | **2026年12月7日**') && d00.includes('| 試合の開始時刻 | **10:30**（owner 回答。原本には書いていない'));
  assert.ok(d06.includes('owner 決定・確認待ち') && !d06.includes('12/7（会長のメモ）と12/11'));
  assert.ok(d00.includes('募集要項_整理案_会長確認前・提案版.md` の8章') && !d00.includes('## 食い違い（どちらかに決めつけない）'), '00 は一覧を写さず、8章を指す');
  assert.ok(!d00.includes('学年差1〜2年、体重差'), '「すでにわかっていること」から学年差を外した');
  assert.ok(!plan.includes('システムの初期の表は、この表と**同じ**です（確認ずみ）。') && plan.includes('階級の数字は同じ'));
});

test('R6b: 説明書の言い過ぎを直した（データの置き場・年れい体重・3勝ちょうど・ブラウザ）', () => {
  assert.ok(!MANUAL.includes('インターネットのどこかに送られることはありません'));
  assert.ok(MANUAL.includes('このアプリには、名簿と写真が、このパソコンの中にだけ保存されます。申し込みの元データは、会長さんのGoogleのシートとドライブにあります。'));
  // 第8章の最初の文も同じ（「パソコンの中にだけ入っています…どこかに預けてはいません」と言い切らない）
  assert.ok(!MANUAL.includes('会長さんの**パソコンの中**にだけ入っています'));
  assert.ok(MANUAL.includes('このアプリには、大会のデータ（選手・写真・対戦カード）が、会長さんの**パソコンの中**にだけ保存されます。') && MANUAL.includes('申し込みの元データは、会長さんのGoogleのシートとドライブにあります。名簿のZIPにも、同じ選手の情報が入っています。'));
  assert.ok(!MANUAL.includes('アプリは、年れいや体重を調べません。'));
  assert.ok(MANUAL.includes('年れいは1〜120、身長は50〜250、体重は10〜250'));
  assert.ok(MANUAL.includes('3勝以上＝Aクラス。3勝ちょうども Aクラス') && MANUAL.includes('Bクラスは2勝以下'));
  assert.ok(!MANUAL.includes('**3勝以上はAクラス、2勝以下はBクラス**'));
  assert.ok(MANUAL.includes('EdgeとWindowsは、まだ試していません。'));
});

test('R6b: 到達度の文書の「いまの数」は、古い数だと分かる。本物のGoogleで動かした build は、履歴で言えること（2026-10-03 は v3 より前の 2.20261002.4。v3 は未確認）だけ書く', () => {
  const doc = read('docs/TOURNAMENT_OS_V3_指示書と到達度.md');
  assert.match(doc, /いまの数（2026-10-12 の時点）/);
  assert.ok(doc.includes('（古い数。最新は verify の出力を見る。）'));
  // 2026-10-03 の確認は、履歴では v3 より前の受付（build 2.20261002.4）。v3 の build 3.20261004.2 は 2026-10-04 の作なので、「10-03 に 3.20261004.2 で確認した」とは言わない
  assert.ok(doc.includes('build `2.20261002.4`') && doc.includes('v3 の build は未確認'));
  assert.ok(!doc.includes('最後に本物のGoogleで動かした build は `3.20261004.2`'));
  assert.ok(!/2026-10-03[^\n]{0,120}build `3\.20261004\.2` まで/.test(doc), '日付と build が食い違う言い方が残っていない');
  assert.equal(readFileSync(join(ROOT, 'public/templates/Tournament_OS_Google受付.gs'), 'utf8').match(/RECEPTION_BUILD = '([^']+)'/)?.[1], '2.20261002.4', '旧い受付の build（文書が言う build の元）');
});

test('R6b: Vol.6 は Vol.7（2026年12月20日大会）にそろえた（会長が見る文・docs・試験の名前）。個人の名前・パソコンの名前は置きかえ語になった', () => {
  const places = [...docsOf().filter((name) => !name.includes('付録_ユーザー原文')).map((name) => 'docs/' + name), 'tests/weightClass.test.ts', 'app/apply/page.tsx', 'app/private/setup/page.tsx', 'core/weightClass.ts'];
  for (const file of places) assert.doesNotMatch(read(file), /Vol\.6/, file);
  assert.ok(MANUAL.includes('Vol.7（2026年12月20日大会）') && MANUAL.includes('Vol.7〔2026年12月20日大会〕'));
  assert.match(read('tests/weightClass.test.ts'), /CKA Vol\.7（2026年12月20日大会）の要項どおり/);
  for (const file of docsOf().filter((name) => !name.includes('付録_ユーザー原文'))) {
    const text = read('docs/' + file);
    // 守る物（人の名前・パソコンのユーザー名）は、この表の中でもつながった形では書かない（二つに分けて足す）
    for (const word of ['あい' + 'かさん', 'jinno' + 'MacBook', 'matsumoto' + 'hitoshi', 'jin' + '@']) assert.ok(!text.includes(word), file + ' に個人の名前らしい語');
  }
  assert.ok(read('docs/TOURNAMENT_OS_引継ぎ指示書.md').includes('〈パソコンのユーザー名〉@〈パソコンのホスト名〉'));
  assert.ok(read('docs/追加要件_06_メディカルフォーム.md').includes('〈確認先の担当者〉'));
});

/* ───────── R6c：ラベルのロボットの既定の場所 ───────── */

test('R6c: ラベルのロボットは、引数なしなら いまの作業フォルダの out-private-pages を見る（外のスナップショットは見ない）。無ければ、はっきりしたエラーで止まる', () => {
  const script = read('scripts/check-manual-labels.mjs');
  assert.doesNotMatch(noComments(script), /snap-r1|\/tmp\//, '外のフォルダの名前が無い');
  assert.match(script, /const DEFAULT_BUILT = path\.join\(root, "out-private-pages"\);/);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tos-labels-')));
  try {
    mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'docs'));
    copyFileSync(join(ROOT, 'scripts/check-manual-labels.mjs'), join(dir, 'scripts/check-manual-labels.mjs'));
    writeFileSync(join(dir, 'docs/TOURNAMENT_OS_使い方マニュアル.md'), '# 架空の手引き\n\nボタンは『例』です。\n');
    const run = (...args: string[]) => spawnSync(process.execPath, [join(dir, 'scripts/check-manual-labels.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    const none = run();
    assert.equal(none.status, 2, none.stdout + none.stderr);
    assert.match(none.stderr, /画面フォルダが見つかりません: .*out-private-pages/); assert.match(none.stderr, /npm run build:private/);
    // 作業フォルダに out-private-pages があれば、それを見る（空でも、ロボットは動いて「不一致なし」で終わる）
    mkdirSync(join(dir, 'out-private-pages'));
    const some = run();
    assert.equal(some.status, 0, some.stdout + some.stderr);
    assert.ok(some.stdout.includes(join(dir, 'out-private-pages')), '画面フォルダ：作業フォルダの out-private-pages');
    // 引数で渡した場所が、そのまま使われる
    const other = run(join(dir, 'docs/TOURNAMENT_OS_使い方マニュアル.md'), join(dir, 'nowhere'));
    assert.equal(other.status, 2); assert.ok(other.stderr.includes(join(dir, 'nowhere')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R6c: Chromium の行数で確かめる手動の道具（fuzz-wrap-chromium.mjs）が、リポジトリにある。冒頭に使い方と「verify-private-all には入れない」。1500件・種は元のまま', () => {
  const script = read('scripts/fuzz-wrap-chromium.mjs');
  assert.ok(existsSync(join(ROOT, 'scripts/fuzz-wrap-chromium.mjs')));
  const header = script.slice(0, script.indexOf('import '));
  assert.ok(header.includes('手動の確認用です。verify-private-all.sh（npm run verify:all）には入れません。') && header.includes('使い方'));
  assert.ok(script.includes('for (let i = 0; i < 1500; i++)') && script.includes('let seed = 12345;'));
  assert.ok(script.includes("import { wrapLines } from '../core/boutSheet.ts';"));
  assert.ok(!read('scripts/verify-private-all.sh').includes('fuzz-wrap'), 'verify-private-all には入れない');
  assert.ok(!/\/tmp\/|bs-wt/.test(script), '外のフォルダの名前が無い');
});
