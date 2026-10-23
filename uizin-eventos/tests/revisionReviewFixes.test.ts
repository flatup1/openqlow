// 修正願（R1〜R9）のあと、5人の点検者が見つけた食い違いを直した所を、ソースと文書を読んで確かめる試験。
//   画面で動くこと（黄色の札がかぶらない・文字が17px・欄が出る／消える・黄色が1つ）は、scripts/test-pledge-apply.mjs（本物の Chromium）の R で確かめる。
//   .gs（Googleの受付）の直し（古いシートの花道のルール・再送の比べ方・リンクのあとで厳しくなった設定）は、tests/hanamichiClass.test.ts・gasV3Failure.test.ts・gasPledge.test.ts が持つ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ageKnown, guardianNeeded } from '../core/pledge.ts';
import { blankPledgeAnswers, pledgeIssues, pledgeLockReason, pledgeOrder, pledgePlan } from '../app/components/pledgeForm.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const noComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const PAGE = read('app/apply/page.tsx'), SETUP = read('app/private/setup/page.tsx'), MANUAL = read('docs/TOURNAMENT_OS_使い方マニュアル.md'), CSS = read('app/globals.css');
const PAGE_CODE = noComments(PAGE);

const FAKE = { items: ['テスト用の文です1', 'テスト用の文です2'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18' as const, gymMode: true, confirmed: true };

/* ───────── 申し込みページ ───────── */

test('F-lock-17px: 灰色の🔒の理由（.tos-locked-reason）は17px以上（誓約書の「あと○つ」もここに出る）', () => {
  const rule = CSS.match(/\.tos-locked-reason\{([^}]*)\}/)?.[1] ?? '';
  const size = rule.match(/font-size:\s*([\d.]+)(rem|px)/);
  assert.ok(size, 'font-size がある');
  const px = size![2] === 'rem' ? Number(size![1]) * 16 : Number(size![1]);
  assert.ok(px >= 17, '17px以上（いま ' + px + 'px）');
});

test('F-badge-room: 黄色の札（👉）は□の上に浮かぶ。上の文にかぶらないよう、誓約書の最初の□・保護者の□・ジム責任者の最初の欄の上は、広くあけてある（mt-16）', () => {
  // 誓約書の項目は、文の一覧のあとに□1つ（owner 2026-10-23）。その□の上を広くあける
  assert.match(PAGE, /<div className="mt-16">\{tickBox\('pledge1'/);
  assert.match(PAGE, /<div className="mt-16">\{tickBox\('pledgeGuardian'/);
  assert.match(PAGE, /<div className="mt-16 grid gap-8">\s*<Field id="f-gymName"/);
  // 札が2行（約62px）になる細い画面で、ふつうの欄の上の文にもかぶっていた（ジム名の上の「必須のところは…」・写真の上の注意・連絡先の上の注意・確認ボタンの上の「ぜんぶ入りました」）。手書きCSSの .tos-badge-room（広い画面 2rem／560px以下 4rem）を使う
  const css = CSS.match(/\.tos-badge-room\{margin-top:([\d.]+)rem\}\s*@media \(max-width:560px\)\{\.tos-badge-room\{margin-top:([\d.]+)rem\}\}/);
  assert.ok(css, '.tos-badge-room がある');
  assert.ok(Number(css![1]) === 2 && Number(css![2]) * 16 >= 62, '広い画面は今まで（2rem）、細い画面は札の高さ（約62px）より広い');
  assert.equal((PAGE.match(/tos-badge-room/g) || []).length, 5, '選手の情報・写真・花道・連絡先・確認ボタン');
  assert.match(PAGE, /<div className="tos-badge-room grid gap-8">\s*\{fighterField\('gym', 'ジム名 必須'\)\}/);
  assert.match(PAGE, /<NextBox on=\{markKey === 'photo'\} label=\{nextLabel\('photo'\)\} prefix=\{prefix\} float className="tos-badge-room">/);
  assert.match(PAGE, /<div id="contact-fields" className="tos-badge-room grid scroll-mt-24 gap-8">/);
  assert.match(PAGE, /<NextBox id="f-submit-box" flush float on=\{nextKind === 'confirm' \|\| nextKind === 'resend'\} className="tos-badge-room"/);
  assert.ok(!/@layer/.test(CSS.slice(CSS.indexOf('.tos-badge-room'), CSS.indexOf('.tos-badge-room') + 300)), '手書きCSSに @layer を書かない（Safari 15）');
  // 昔の狭いあき（mt-8／mt-6）は、この3か所に残っていない
  assert.doesNotMatch(PAGE, /aria-label="誓約書の項目" className="mt-8/);
  assert.doesNotMatch(PAGE, /<div className="mt-6">\{tickBox\('pledgeGuardian'/);
});

test('F-gym-phone: 入れたが携帯電話の形ではない電話は、「まだです」ではなく「直す」。👉は「…を直す」、赤い帯は「直す所」、🔒の理由は「携帯電話の番号になっていません」', () => {
  const plan = pledgePlan(FAKE, '15', 'live');
  const all = { ...blankPledgeAnswers(), ticks: [true, true], guardian: true, gymName: '架空 責任者', gymPermission: true, gymConsent: true };
  // 電話が空と、入れたが形がちがう：順の上ではどちらも「まだ」。問題の empty が分ける
  const wrong = { ...all, gymPhone: '0312345678' }, empty = { ...all, gymPhone: '' };
  assert.equal(pledgeOrder(plan, wrong).find(([key]) => key === 'gymPhone')?.[1], false);
  assert.equal(pledgeIssues(plan, wrong).gymPhone?.empty, false, '入れた：empty ではない');
  assert.equal(pledgeIssues(plan, empty).gymPhone?.empty, true, '空：empty');
  assert.equal(pledgeLockReason(plan, wrong), 'ジム責任者の電話が、携帯電話の番号になっていません');
  assert.equal(pledgeLockReason(plan, empty), 'ジム責任者の名前と電話が、まだです', '空のときの言い方は、今までのまま');
  assert.doesNotMatch(pledgeLockReason(plan, wrong), /まだです/);
  // 画面：ふつうの電話番号の欄と同じ考え方（typedWrong）で、「直す」と数える
  assert.match(PAGE_CODE, /const typedWrong = \(key: Key\): boolean => isPledgeKey\(key\) && pledgeProblems\[key\]\?\.empty === false;/);
  assert.match(PAGE_CODE, /const empty = order\.find\(\(\[k\]\) => k === key\)\?\.\[1\] === false && !typedWrong\(key\);/, '👉の札：直すか、入れるか');
  assert.match(PAGE_CODE, /order\.filter\(\(\[key, ok\]\) => !ok && fields\[key\] && !typedWrong\(key\)\)/, '赤い帯：足りない所に数えない（直す所に入る）');
});

test('F-blocked-link: 本番なのに主催者が文を確認していないリンク。入力がぜんぶ済んだら、確認ボタンのそばにも赤✕。黄色の👉は「確認のボタン」ではなく、電話（電話が無いときは置かない）。確認画面は、電話が無いとき連絡先の文を出す', () => {
  assert.match(PAGE_CODE, /if \(plan\.blocked && \(nextKind === 'confirm' \|\| nextKind === 'resend'\)\) nextKind = callFirst \? 'call' : 'none';/);
  assert.match(PAGE, /id="form-pledge-blocked"/);
  assert.match(PAGE_CODE, /endpointReady && plan\.blocked && !sending && !deadlineLocked && left === 0 && !badKeys\.length/, '入力がぜんぶ済んだときだけ');
  assert.match(PAGE_CODE, /<ErrorLine id="form-pledge-unconfirmed" alert>\{PLEDGE_BLOCKED_TEXT\}<\/ErrorLine>/);
  assert.match(PAGE_CODE, /\{tel \? <NextBox on=\{nextKind === 'call'\} label="主催者に電話する"/);
  assert.match(PAGE_CODE, /<p className="mt-2 font-bold">\{noContactText\}<\/p>/, '電話が無いとき：連絡先の文');
  // 確認画面
  assert.match(PAGE_CODE, /\{plan\.blocked && !tel \? <p id="review-pledge-contact" className="mt-2 font-bold">\{noContactText\}<\/p> : null\}/);
  // 文は、元の1つ（PLEDGE_BLOCKED_TEXT）だけ
  assert.equal(PAGE_CODE.split('主催者が、誓約書の文をまだ確認していません。送れません。').length - 1, 0, '文は pledgeForm.ts の定数から出す');
});

test('F-guardian-age: 年齢が空・読めないために保護者の欄が出ているときだけ、「年齢を入れると、18歳以上の方は、この欄が出なくなります」と言う', () => {
  for (const age of ['', ' ', 'あ', '0', '121', '15.5']) assert.equal(ageKnown(age), false, JSON.stringify(age));
  for (const age of ['1', '15', '17', '18', '45', '120', '１７']) assert.equal(ageKnown(age), true, JSON.stringify(age));
  // 保護者の欄が出る（安全側）のは、ageKnown が false のとき。出る理由を、画面が分けて言える
  for (const age of ['', 'あ', '121']) assert.ok(guardianNeeded('under18', age) && !ageKnown(age));
  assert.ok(guardianNeeded('under18', '17') && ageKnown('17'), '17歳は、年齢が分かっていて、欄が出る（このときは言わない）');
  assert.match(PAGE_CODE, /const guardianAgeUnknown = plan\.guardian && config\.pledge\?\.mode === 'under18' && config\.age !== 'off' && !ageKnown\(ageStr\);/, '花道では、生年月日から出した年齢で見る（画面に年齢の欄が無いため）');
  assert.match(PAGE, /\{guardianAgeUnknown \? <Note id="pledge-guardian-age-note" className="mt-3">\{hanamichiOn \? '生年月日を選ぶと' : '年齢を入れると'\}、18歳以上の方は、この欄が出なくなります。<\/Note> : null\}/, '花道は「生年月日を選ぶと」、ふつうは「年齢を入れると」');
});

test('F-count-note: 「入力は全部で◯個」は「いま」の数。花道の区分・年齢で出る保護者の欄・ジム責任者の欄があるリンクだけ、「…によって、入力の数が変わることがあります。」を1行そえる（昔のリンクは、見た目が今のまま）', () => {
  assert.match(PAGE_CODE, /\{`用意するもの：顔写真1枚。入力は全部で\$\{total\}個です。`\}/, '1行目は今までのまま');
  assert.match(PAGE_CODE, /\{endpointReady && countMayChange \? <p id="count-note"/);
  const block = PAGE_CODE.slice(PAGE_CODE.indexOf('const countMayChange = ['), PAGE_CODE.indexOf('const kitExtra'));
  assert.match(block, /config\.hanamichi && weights && weights\.divisions\.some\(\(d\) => isHanamichiDivision\(d\.name\)\) \? DIVISION_LABEL : ''/);
  assert.match(block, /config\.pledge\?\.mode === 'under18' && config\.age !== 'off' \? \(hanamichiOn \? '生年月日' : '年齢'\) : ''/);
  assert.doesNotMatch(block, /ジム名/, 'ジムに入っていない人は申し込めないので、ジム名で入力の数は変わらない');
  assert.doesNotMatch(block, /config\.weights\b|config\.classes\b/, '花道・誓約書が無い昔のリンクでは、いつも空（見た目が今のまま）');
});

test('F-memory-honest: 覚える物を、正直に言う。途中の入力＝選手の欄だけ（残さない物は、このリンクにある物だけ名前を出す）。送ったあと60分＝ジム名・連絡先・同意のチェック（と、ジム責任者の名前・電話）。保存先＝Googleのシートとドライブ', () => {
  // 申し込みページ：残さない物の一覧は、リンクにある物だけ（誓約書も花道も無い昔のリンクに、その言葉を出さない）
  assert.match(PAGE_CODE, /const keptNot = \['連絡先', '写真', '同意のチェック', \.\.\.\(hanamichiOn \? \['花道の答え'\] : \[\]\), \.\.\.\(config\.pledge \? \['誓約書の✔'\] : \[\]\), \.\.\.\(config\.pledge\?\.gymMode \? \['ジム責任者の欄'\] : \[\]\)\]\.join\('・'\);/);
  assert.equal((PAGE.match(/\{keptNot\}/g) || []).length, 4, '上の注意・下書きの案内・連絡先のそば・使い道');
  assert.equal((PAGE.match(new RegExp('入力の途中では、選手の欄（ジム名・選手名・身長・体重など）だけを、このスマホのこのページの中にだけ、一時的に覚えておけます。\\{keptNot\\}は、途中では覚えません。', 'g')) || []).length, 2, '連絡先のそば・使い道');
  assert.ok(PAGE.includes('更新したときは、選手の欄（ジム名・選手名・身長・体重など）の入力だけ、残っていることがあります（上に「戻す」が出ます）。{keptNot}は、入れ直しになります。'));
  assert.ok(PAGE.includes('残しているのは、選手の欄だけです。{keptNot}は、残していません。'));
  assert.equal((PAGE.match(/\{kitExtra\}共用の端末/g) || []).length, 2, '連絡先のそばと使い道の「60分」の文の次に、同意のチェック（とジム責任者）も覚えると言う');
  assert.match(PAGE_CODE, /const kitExtra = \(config\.pledge\?\.gymMode \? '個人情報の同意のチェックと、ジム責任者の名前・電話' : '個人情報の同意のチェック'\) \+ 'も、いっしょに覚えます。';/);
  assert.match(PAGE, /\{kitRef\.current\?\.consent \? '個人情報の同意のチェックも入っています。' : null\}\{kitRef\.current\?\.gymName \? 'ジム責任者の名前・電話も入っています。' : null\}/, '入れた物だけ、案内の枠で言う');
  assert.ok(PAGE.includes('送った内容は、主催者のGoogleのシートとドライブにだけ保存されます（これは変わりません）。'));
  assert.ok(!PAGE.includes('Googleの表にだけ'), '写真はドライブに入る。「表にだけ」とは言わない');
  assert.ok(!/電話・メール・写真いがい|途中の入力（電話・メール・写真は除く）|電話・メール・写真は、残していません/.test(PAGE + SETUP + MANUAL), '古い言い方（お名前・同意なども残るように読める）は残っていない');
  // 設定の画面の「選手に送る前の説明」：このシートにある物だけ名前を出す（「なし」のシートに、花道・誓約書の言葉を出さない。scripts/test-pledge-setup.mjs の S5 が見る）
  assert.match(noComments(SETUP), /const keptNot = \['連絡先', '写真', '同意のチェック', \.\.\.\(ping\?\.hanamichiMode && supportsHanamichi\(ping\) \? \['花道の答え'\] : \[\]\), \.\.\.\(pledgeDiag \? \['誓約書の✔'\] : \[\]\), \.\.\.\(pledgeDiag\?\.gym \? \['ジム責任者の欄'\] : \[\]\)\]\.join\('・'\);/);
  assert.ok(SETUP.includes('選手の申し込み画面は、入力の途中では、選手の欄（ジム名・選手名・身長・体重など）だけを、そのスマホのそのページの中にだけ、一時的に覚えておけます。{keptNot}は、途中では覚えません。'));
  assert.ok(SETUP.includes("{pledgeDiag?.gym ? '個人情報の同意のチェックと、ジム責任者の名前・電話も、いっしょに覚えます。' : '個人情報の同意のチェックも、いっしょに覚えます。'}"));
  // 説明書の画面の一覧表（162-2・194・194-2・194-3・216・219）。画面の文は、リンクで変わる所を { } で書く
  for (const text of ['入力の途中では、選手の欄（ジム名・選手名・身長・体重など）だけを', '{残さない物}は、残していません。', '{残さない物}は、途中では覚えません。', '個人情報の同意のチェックも、いっしょに覚えます。（誓約書で「ジム責任者の同意」を使うシートでは「個人情報の同意のチェックと、ジム責任者の名前・電話も、いっしょに覚えます。」）', '送った内容は、主催者のGoogleのシートとドライブにだけ保存されます（これは変わりません）。', '個人情報の同意のチェックも入っています。']) assert.ok(MANUAL.includes(text), text.slice(0, 30));
  assert.ok(MANUAL.includes('このリンクにある物だけ名前が出ます'), '説明書は、画面の文が「リンクにある物だけ」だと言う');
});

test('F-3rd-party-kit: 覚える中身（core/applyDraft.ts）と画面の文が合う。NEXT_TEXT_KEYS に、ジム責任者の名前・電話が入っている', () => {
  const core = read('core/applyDraft.ts');
  const keys = core.match(/NEXT_TEXT_KEYS[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? '';
  for (const key of ['gym', 'contactName', 'contactPhone', 'contactEmail', 'gymName', 'gymPhone']) assert.ok(keys.includes("'" + key + "'"), key);
  assert.ok(!keys.includes('gymPermission') && !keys.includes('pledge'), '念押しのチェックと誓約書の✔は覚えない');
});

/* ───────── A3（会長の画面）の言葉 ───────── */

test('R6a-8: 会長の画面（A3）は「ジム名」。「所属ジム」は、Googleの列見出し・原本の引用・花道の別紙の見出しだけ', () => {
  const sheet = noComments(read('app/private/sheet/page.tsx'));
  assert.ok(!sheet.includes('所属ジム'), 'A3 の画面に「所属ジム」が残っていない');
  assert.match(sheet, /\['gym', 'ジム名'\]/);
  assert.ok(sheet.includes('名前・ジム名・顔写真は、会場に貼る紙に載ります。') && sheet.includes('は、名前・ジム名・クラスの文字が長くて、紙の上で一部が「…」と切れます。') && sheet.includes('書き方（名前・ジム名）を確かめます。'));
  // 準備画面と同じ言葉
  assert.ok(read('app/private/cards.tsx').includes('ジム名'));
  // 説明書の画面の文（A3 の表示の選択・「…と切れます」の黄色の注意）も、同じ
  for (const text of ['「ジム名」「クラス・区分・階級」のチェックを外すと', '「名前・ジム名・クラスの文字が長くて、紙の上で一部が「…」と切れます」', '名前・ジム名・顔写真は、載せると、会場']) assert.ok(MANUAL.includes(text), text);
  assert.ok(!/名前・所属ジム|「所属ジム」「クラス/.test(MANUAL), '説明書の A3 の説明に「所属ジム」が残っていない');
  // Google の列見出し・花道の別紙の見出しは、そのまま
  assert.ok(MANUAL.includes('D：「所属ジム」') && MANUAL.includes('C：「所属ジム」'));
  assert.match(read('core/hanamichi.ts'), /'所属ジム', '選手名'/);
});

/* ───────── 文書 ───────── */

const doc = (name: string): string => read('docs/' + name);
const docsOf = (): string[] => readdirSync(join(ROOT, 'docs')).filter((name) => name.endsWith('.md'));

test('F-doc-02: 追加要件_02 は、文がリポジトリ・Cloudflareに無い、という前の約束が「置きかえ済み」だと言う。決定ログ4に、.gs の初期値の置き場がある。写真の読み取りは置きかえ済みで、写した文を引用しない', () => {
  const d02 = doc('追加要件_02_誓約書の掲載と同意必須.md');
  const line = (needle: string): string => d02.split('\n').find((l) => l.includes(needle)) ?? '';
  for (const needle of ['ひな形にも、リポジトリにも、例文を入れない', 'リポジトリ・Cloudflareには置かない', '17. リポジトリに、誓約書の文が入っていない']) assert.match(line(needle), /置きかえ済み：2026-10-22/, needle);
  assert.match(line('17. リポジトリに'), /アプリのコード（app\/・core\/・tests\/・scripts\/）に、誓約書の文が入っていない/);
  assert.match(d02, /\*\*初期値の置き場所（正直に）：\*\* 受付プログラムのひな形 `public\/templates\/Tournament_OS_Google受付_v3\.gs` の定数 `PLEDGE_INITIAL_ITEMS`／`PLEDGE_INITIAL_GUARDIAN`／`PLEDGE_INITIAL_GYM`/);
  assert.match(d02, /公開サイト（Cloudflare）の `templates\/` にも、そのまま出る/);
  assert.ok(d02.split('\n')[2].startsWith('状態：作成ずみ'), '状態は「案」のままではない');
  // 写真の読み取り：2語がちがっていた引用を、残さない。docs 02 に、.gs の初期の文（owner が貼った原本の文字）を写したものが、1つも無い（12字ずつの窓で見る。文そのものは、この試験に書かない）
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  const quoted = [...gs.slice(gs.indexOf('const PLEDGE_INITIAL_ITEMS'), gs.indexOf('const PLEDGE_HEADINGS_')).matchAll(/'([^'\n]{12,})'/g)].map((m) => m[1]);
  assert.equal(quoted.length, 7, '項目5つ・保護者の文・ジム責任者の文');
  const copied: string[] = [];
  for (const text of quoted) for (let k = 0; k + 12 <= text.length; k++) if (d02.includes(text.slice(k, k + 12))) { copied.push(text.slice(k, k + 12)); break; }
  assert.deepEqual(copied, [], '写真の読み取りの引用が、docs 02 に残っている');
  assert.match(d02, /置きかえ済み（2026-10-22）：\*\* 下の「読み取り」は写真からの書き起こしで、2か所が原本とちがっていた/);
});

test('F-doc-manual: 説明書の画面の一覧表（252）は、直した2つの文。第8章の「データはどこ」は、シートとドライブも言う。誓約書の設定を変えたら新しいURL。件数の見くらべ', () => {
  assert.ok(MANUAL.includes('同じ画面から送り直した分は、二重になりません。（もう一度ページを開いて入れ直した分は、別の申し込みになります）'));
  assert.ok(!MANUAL.includes('同じ申し込みは、二重になりません。'));
  assert.ok(!MANUAL.includes('パソコンの中**にだけ入っています'));
  assert.ok(MANUAL.includes('設定タブの「保護者の同意」「ジム責任者の同意」を変えたときも同じです') && MANUAL.includes('この2つを変えたら、新しいURLを作ります。'));
  assert.ok(MANUAL.includes('申し込みの件数と、誓約記録の件数を、ときどき見比べてください'));
  assert.match(doc('追加要件_02_誓約書の掲載と同意必須.md'), /設定タブの「保護者の同意」「ジム責任者の同意」を変えたときも同じ/);
});

test('F-doc-times: 約30分は「目安・まだ測っていない」と言う。表の足し算が合う（ひとまとまり7番＝3-8の約1分＋4-1の約5分＝約6分、足すと約27分）', () => {
  assert.ok(SETUP.includes('約30分は目安です。まだ測っていません。人によって変わります。'));
  assert.ok(MANUAL.includes('| 7 | 選手に渡すURLをコピーして、LINEで送る | 会長さん | 約6分（3-8が約1分、4-1が約5分） | 3-8、4-1 |'));
  assert.ok(MANUAL.includes('手順ごとの時間を足すと約27分です') && !MANUAL.includes('手順ごとの時間を足すと約24分です'));
  assert.ok(MANUAL.includes('どの時間も見積もりで、まだ会長さんが測ったものではありません'));
  // 説明書の表の行と、その行の時間（3-1〜3-8 の章の表）から、足し算を確かめる
  const part3 = MANUAL.split('\n').filter((l) => /^\| 3-[1-8] \|/.test(l)).map((l) => Number(l.match(/約(\d+)分\s*\|$/)?.[1]));
  assert.equal(part3.length, 8); assert.equal(part3.reduce((a, b) => a + b, 0), 23, '3章の表は合計23分（4-1のLINEは入っていない）');
});

test('F-doc-hanamichi-optional: 花道の必須／任意は、「原本どおり」と言い過ぎない。職業の任意は原本の「差支えのない範囲で」、他格闘歴の任意はこちらの選択', () => {
  const code = read('core/hanamichi.ts'), d04 = doc('追加要件_04_花道用プロフィールの別枠.md');
  assert.ok(!code.includes('原本の「必須選手情報」のとおり、職業と他格闘歴だけ任意'));
  assert.match(code, /他格闘歴を任意にしたのは、こちらの選択（原本には任意の印が無い。会長に聞くこと）/);
  assert.ok(!d04.includes('原本に合わせて、職業と他格闘歴だけ任意') && !d04.includes('「記入漏れが無いように」に合わせて、職業と他格闘歴だけが任意'));
  assert.ok(d04.includes('他格闘歴を任意にしたのは、こちらの選択で、原本どおりではない'));
});

test('F-doc-state: 文書どうしの「いま」が合う（00・クラス区分・階級分け・V3の到達度）', () => {
  const d00 = doc('追加要件_00_一覧と順番.md'), cls = doc('次回大会_クラス区分_要件.md'), wt = doc('次回大会_階級分け_要件.md');
  assert.ok(d00.includes('階級の数字は、申込システムの初期の表と同じ。区分の名前は、画面に出す用に変えてある') && !d00.includes('区分・階級の表は申込システムの初期の表と同じ'));
  assert.ok(d00.includes('自動テストは、このパソコンの Chromium で通った。実機・Safari・印刷は、まだ確かめていない') && !d00.includes('**作成ずみ**（テスト合格。点検・実機確認が残る）'));
  assert.ok(!cls.includes('この決定の作りと文書は、別の作業で書く') && cls.includes('追加要件_04_花道用プロフィールの別枠.md` の「9. 花道の選手には、クラス（A／B）を選ばせない」'));
  assert.ok(cls.includes('## 作るもの（できた：クラス分けの仕組みは作成ずみ') && !cls.includes('## 作るもの（案）'));
  assert.ok(wt.includes('試合の始まる時刻＝**10:30**（決定：owner 回答 2026-10-22') && !wt.includes('試合の始まる時刻＝**会長に確認**'));
  const v3 = doc('TOURNAMENT_OS_V3_指示書と到達度.md');
  assert.ok(!v3.includes('最後に本物のGoogleで動かした build は `3.20261004.2`') && v3.includes('build `2.20261002.4`'));
});

test('F-doc-checks: 公開前の自動チェックの文書は、「1つでも駄目なら止まる」の例外（TypeScript が無い環境で、古いSafariの検査を省く）を言う。じゅんびの画面は「4つ」と言う', () => {
  const rules = doc('TOURNAMENT_OS_公開とCodex連携の決まり.md');
  assert.ok(rules.includes('ただし1つだけ例外があります：TypeScript が使えない環境（公開用の取り出し先など）では、「古いSafari向けの文法の検査」'));
  assert.ok(read('scripts/check-private-build.mjs').includes('TypeScript が無い環境（公開用の取り出し先など）では、この検査だけ省く'), '文書の言うことが、道具のコードと同じ');
  const prep = read('app/private/page.tsx');
  assert.ok(prep.includes('じゅんびの4つは、ぜんぶできました。') && !prep.includes("'じゅんびは、ぜんぶできました。"));
});

test('F-doc-wording: 選手に見える所の「区分」は「出場区分」（説明書の用語集・追加要件_01・階級分けの手順書）。会長側の画面・Googleの列見出しは「区分」のまま', () => {
  assert.ok(MANUAL.includes('選手に、出場区分と階級を選んでもらうかどうかの設定です。「設定」タブのB21を「あり」にすると、申し込みページに、出場区分と階級を選ぶ欄が出ます。'));
  assert.ok(doc('追加要件_01_小学生のマッチメイクの説明.md').includes('小学生の保護者が申し込む画面の「出場区分」（会長側の画面では「区分」）のすぐ下に'));
  assert.ok(doc('階級分け_設定の入れ方.md').includes('申し込みページと同じ「出場区分」と階級の選び方が出ます'));
  assert.ok(read('core/entryPackage.ts').includes("weightChoiceError(fighter.division ?? '', fighter.weightClass ?? '', config.weights);"), 'entryWeightError は、言い方を渡さない（出場区分）');
  // 会長側の列見出しは、そのまま
  assert.deepEqual(docsOf().filter((name) => /^追加要件_0[0-6]/.test(name)).length > 0, true);
});
