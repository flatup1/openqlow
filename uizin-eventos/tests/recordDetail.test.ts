// くわしい戦績の決まり（core/recordDetail.ts）と、申し込みリンクの鍵（rd=on）・シートの版の判定。
// 名前・大会名・ジム名は、ぜんぶ架空。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EMPTY_KICK, RECORD_DETAIL_HEADERS, RECORD_DETAIL_LIMITS, RECORD_KIND,
  kickFromRecordText, kickRecordText, packRecordDetail, parseRecordDetail, parseRecordDetailCsv, recordDetailProblems, recordDetailRows, unguardRecordCell,
  type RecordDetail,
} from '../core/recordDetail.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryHash, type PublicEntryConfig } from '../core/publicEntry.ts';
import { ACCEPTED_RECEPTION_BUILDS, EXPECTED_RECEPTION_BUILD, supportsRecordDetail } from '../core/setupV3.ts';
import { detailFromText, countOf, kickTextOf, RECORD_LOSS_NOTE, recordIsWrong, recordLine, recordProblems, recordReviewPairs, type KickText } from '../app/components/recordDetailText.ts';
import { unguardCell } from '../core/privateTournament.ts';
import { DEFAULT_CLASS_SETTINGS, suggestClass } from '../core/classRules.ts';

const full = (over: Partial<RecordDetail> = {}): RecordDetail => ({
  v: 1,
  kick: { games: 4, win: 3, loss: 1, draw: 0 },
  others: [{ sport: '空手', games: 3, win: 1, loss: 1, draw: 0, noResult: 1 }],
  titles: [{ event: '架空カップ', year: 2025, class: '-60kg', result: '優勝' }],
  ...over,
});

test('キックの戦績の言い方（シートの一行も）：試合数0は「初試合」、ほかは「4戦3勝1敗」（2026-10-24 owner）。前の版の引き分けつきだけ「分」', () => {
  assert.equal(kickRecordText({ games: 0, win: 0, loss: 0, draw: 0 }), '初試合');
  assert.equal(kickRecordText({ games: 4, win: 3, loss: 1, draw: 0 }), '4戦3勝1敗');
  assert.equal(kickRecordText({ games: 5, win: 3, loss: 2, draw: 0 }), '5戦3勝2敗');
  assert.equal(kickRecordText({ games: 4, win: 2, loss: 1, draw: 1 }), '4戦2勝1敗1分', '前の版で引き分けが入っているデータ');
  assert.equal(kickRecordText({ games: 999, win: 0, loss: 999, draw: 0 }), '999戦0勝999敗');
  // 確認の画面の行（recordLine）と、シートの一行は、同じ字になる（いまの画面は引き分けを聞かないので、draw は 0）
  for (const [games, win] of [[1, 0], [1, 1], [4, 3], [12, 7], [999, 999]]) assert.equal(kickRecordText({ games, win, loss: games - win, draw: 0 }), recordLine(games, win));
  assert.deepEqual(kickFromRecordText('初試合'), EMPTY_KICK);
  assert.deepEqual(kickFromRecordText('4戦3勝1敗'), { games: 4, win: 3, loss: 1, draw: 0 });
  assert.deepEqual(kickFromRecordText('4戦2勝1敗1分'), { games: 4, win: 2, loss: 1, draw: 1 });
  assert.deepEqual(kickFromRecordText('2勝1敗1分'), { games: 4, win: 2, loss: 1, draw: 1 }, '前の言い方（2026-10-24 より前の下書き）も読む');
  assert.deepEqual(kickFromRecordText('3勝1敗'), { games: 4, win: 3, loss: 1, draw: 0 });
  assert.equal(kickFromRecordText('5戦3勝1敗'), null, '「戦」の数と、勝ち・負けの合計が合わないときは、数に戻さない');
  assert.equal(kickFromRecordText('0戦0勝0敗'), null, '試合数0は「初試合」の言い方だけ');
  for (const kick of [{ games: 1, win: 0, loss: 1, draw: 0 }, { games: 7, win: 7, loss: 0, draw: 0 }, { games: 9, win: 4, loss: 3, draw: 2 }]) assert.deepEqual(kickFromRecordText(kickRecordText(kick)), kick, '作った一行から、同じ数に戻る');
  assert.equal(kickFromRecordText('空手3年'), null, '数字の形でない言葉は、数に戻さない');
  assert.equal(kickFromRecordText(''), null);
});

test('決まり：正しい入力は、問題が無い。キックの合計が試合数と違うと、直す言葉が出る', () => {
  assert.deepEqual(recordDetailProblems(full()), []);
  assert.deepEqual(recordDetailProblems(full({ kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] })), [], '未経験（試合数0）は入力完了');
  const wrong = recordDetailProblems(full({ kick: { games: 4, win: 3, loss: 0, draw: 0 } }));
  assert.ok(wrong.some((t) => t.includes('キックボクシングの勝ち・負け・引き分けの合計が、試合数と合っていません')), wrong.join(' / '));
  const zeroWithWins = recordDetailProblems(full({ kick: { games: 0, win: 1, loss: 0, draw: 0 } }));
  assert.ok(zeroWithWins.some((t) => t.includes('未経験（試合数0）のときは')));
});

test('決まり：他の格闘技は、勝敗なしを足して試合数と合う。件数は5つまで。競技名が空はだめ', () => {
  const sumWrong = recordDetailProblems(full({ others: [{ sport: '柔道', games: 2, win: 1, loss: 0, draw: 0, noResult: 0 }] }));
  assert.ok(sumWrong.some((t) => t.includes('「柔道」の勝ち・負け・引き分け・勝敗なしの合計が、試合数と合っていません')), sumWrong.join(' / '));
  const five = Array.from({ length: 6 }, () => ({ sport: '空手', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }));
  assert.ok(recordDetailProblems(full({ others: five })).some((t) => t.includes('他の格闘技は、5つまでです')));
  assert.ok(recordDetailProblems(full({ others: [{ sport: '  ', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] })).some((t) => t.includes('競技名を入れてください')));
});

test('決まり：タイトル・入賞歴は、大会名・4けたの年・階級・成績が要る。5つまで', () => {
  assert.ok(recordDetailProblems(full({ titles: [{ event: '架空カップ', year: 99, class: '-60kg', result: '優勝' }] })).some((t) => t.includes('獲得年は、4けたの数字')));
  assert.ok(recordDetailProblems(full({ titles: [{ event: '架空カップ', year: 2025, class: '', result: '優勝' }] })).some((t) => t.includes('階級を入れてください')));
  assert.ok(recordDetailProblems(full({ titles: [{ event: '', year: 2025, class: '-60kg', result: '優勝' }] })).some((t) => t.includes('大会名を入れてください')));
  assert.ok(recordDetailProblems(full({ titles: [{ event: 'a', year: 2025, class: 'b', result: '' }] })).some((t) => t.includes('タイトル名または入賞成績を入れてください')));
  const six = Array.from({ length: 6 }, () => ({ event: 'a', year: 2025, class: 'b', result: 'c' }));
  assert.ok(recordDetailProblems(full({ titles: six })).some((t) => t.includes('タイトル・入賞歴は、5つまでです')));
  assert.ok(RECORD_DETAIL_LIMITS.titles === 5 && RECORD_DETAIL_LIMITS.others === 5);
});

test('送る形：JSON はキーの順が決まっていて、前後の空白を落とす。決まりに合わないと、空（送らない）', () => {
  const text = packRecordDetail(full({ others: [{ sport: ' 空手 ', games: 3, win: 1, loss: 1, draw: 0, noResult: 1 }] }));
  assert.equal(text, '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[{"sport":"空手","games":3,"win":1,"loss":1,"draw":0,"noResult":1}],"titles":[{"event":"架空カップ","year":2025,"class":"-60kg","result":"優勝"}]}');
  assert.equal(packRecordDetail(full({ kick: { games: 4, win: 1, loss: 1, draw: 0 } })), '', '合わない入力は、JSON にしない');
  assert.deepEqual(parseRecordDetail(text), JSON.parse(text));
  assert.equal(parseRecordDetail('{"v":2}'), null, '版が違う');
  assert.equal(parseRecordDetail('壊れた文字'), null);
  assert.equal(parseRecordDetail(''), null);
  assert.equal(parseRecordDetail(text.replace('"games":4', '"games":"4"')), null, '数字は数字で');
  assert.equal(parseRecordDetail('x'.repeat(20001)), null, '大きすぎるものは読まない');
});

test('受付の表：見出しは12列。キックは必ず1行、他の格闘技とタイトルは1件1行', () => {
  assert.equal(RECORD_DETAIL_HEADERS.length, 12);
  assert.equal(RECORD_DETAIL_HEADERS[0], '受付番号');
  const rows = recordDetailRows('ENT-TEST000001', '2026/10/24 08:00:00', full());
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r[2]), [RECORD_KIND.kick, RECORD_KIND.other, RECORD_KIND.title]);
  assert.equal(rows[0][3], 'キックボクシング');
  assert.deepEqual(rows[0].slice(4, 8), ['4', '3', '1', '0']);
  assert.equal(rows[1][3], '空手');
  assert.equal(rows[1][8], '1', '勝敗なし');
  assert.equal(rows[2][9], '2025');
  assert.equal(rows[2][11], '優勝');
  assert.ok(rows.every((r) => r.length === 12 && r[0] === 'ENT-TEST000001'));
  assert.equal(recordDetailRows('ENT-X', 't', full({ others: [], titles: [] })).length, 1, 'キックだけでも1行');
});

test('records.csv を読む：見出しが同じなら受付番号ごとにまとまる。見出しが違えば、ぜんぶ読まない', () => {
  const rows = recordDetailRows('ENT-A', '2026/10/24 08:00', full());
  const q = (cell: string) => '"' + cell.replace(/"/g, '""') + '"';
  const csv = '﻿' + [RECORD_DETAIL_HEADERS.map(q).join(',')].concat(rows.map((r) => r.map(q).join(','))).join('\r\n') + '\r\n';
  const parsed = parseRecordDetailCsv(csv);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.byReceipt.get('ENT-A'), full(), '行を読み直すと、同じ決まりの形に戻る');
  }
  assert.equal(parseRecordDetailCsv('受付番号,別の見出し\r\nENT-A,x').ok, false);
  const empty = parseRecordDetailCsv(RECORD_DETAIL_HEADERS.map(q).join(','));
  assert.ok(empty.ok && empty.byReceipt.size === 0, '見出しだけなら、空');
  const unknownKind = parseRecordDetailCsv(RECORD_DETAIL_HEADERS.map(q).join(',') + '\r\n' + ['ENT-B', 't', '別の種類', 'x', '', '', '', '', '', '', '', ''].map(q).join(','));
  assert.ok(unknownKind.ok && unknownKind.byReceipt.size === 0, '知らない種類の行は、読まない');
});

test('画面の数字：全角も読む。読めない字は NaN。聞くのは試合数と勝ちだけ：負け＝試合数−勝ち、引き分け・勝敗なし＝0（2026-10-24 owner）', () => {
  assert.equal(countOf('３'), 3);
  assert.equal(countOf(' 1,000 '), 1000);
  assert.ok(Number.isNaN(countOf('ぜろ')));
  assert.ok(Number.isNaN(countOf('')));
  const none: KickText = { games: '0', win: '5' };
  assert.deepEqual(detailFromText(none, [], []).kick, { games: 0, win: 0, loss: 0, draw: 0 }, '未経験は、勝ちの入力を見ずに 0');
  const three: KickText = { games: '4', win: '3' };
  assert.deepEqual(detailFromText(three, [], []).kick, { games: 4, win: 3, loss: 1, draw: 0 }, '負け＝試合数−勝ち');
  assert.deepEqual(recordDetailProblems(detailFromText(three, [], [])), [], '決まりに合う（Googleの受付も、そのまま受ける）');
  for (const win of ['', 'ぜろ', '5']) assert.ok(recordDetailProblems(detailFromText({ games: '4', win }, [], [])).length > 0, '勝ち「' + win + '」（空・数でない・試合数より多い）は、直す');
  const others = detailFromText({ games: '0', win: '' }, [{ sport: ' 空手 ', games: '12', win: '7' }], []).others;
  assert.deepEqual(others, [{ sport: '空手', games: 12, win: 7, loss: 5, draw: 0, noResult: 0 }], '他の格闘技も、試合数と勝ちだけ');
  assert.deepEqual(kickTextOf({ games: 4, win: 3, loss: 1, draw: 0 }), { games: '4', win: '3', draw: '' }, '下書きを戻すとき、引き分け0は空に戻す');
  // 送る JSON：Googleの受付（.gs）が、これまでと同じ決まりで受ける形（負けは試合数−勝ち、引き分け・勝敗なしは 0）
  assert.equal(
    packRecordDetail(detailFromText({ games: '4', win: '3' }, [{ sport: '空手', games: '3', win: '1' }], [])),
    '{"v":1,"kick":{"games":4,"win":3,"loss":1,"draw":0},"others":[{"sport":"空手","games":3,"win":1,"loss":2,"draw":0,"noResult":0}],"titles":[]}',
  );
});

test('直す所の言葉：画面には勝ちしか無いので、「負け・引き分け・勝敗なし」とは言わない（勝ちが数でない／試合数より多い）', () => {
  const title = { event: '架空カップ', year: '2025', class: '-60kg', result: '優勝' };
  assert.deepEqual(recordProblems({ games: '4', win: '3' }, [{ sport: '空手', games: '3', win: '1' }], [title]), [], '正しい入力は、問題が無い');
  assert.deepEqual(recordProblems({ games: '0', win: '' }, [], []), [], '未経験は、勝ちを入れなくてよい');
  assert.deepEqual(recordProblems({ games: '4', win: '' }, [], []), ['キックボクシングの勝ちを、数字で入れてください。']);
  assert.deepEqual(recordProblems({ games: '4', win: '5' }, [], []), ['キックボクシングの勝ちが、試合数（4）より多くなっています。']);
  assert.deepEqual(recordProblems({ games: '', win: '3' }, [], []), ['キックボクシングの試合数を、数字で入れてください（未経験は「0」）。'], '試合数が読めないときは、試合数だけ言う');
  const many = recordProblems({ games: '0', win: '' }, [{ sport: '柔道', games: '2', win: '3' }, { sport: '', games: '2', win: '' }, { sport: '空手', games: '0', win: '1' }], [{ ...title, year: '99' }]);
  assert.deepEqual(many, [
    '他の格闘技の競技名を入れてください（20字まで）。',
    '他の格闘技の試合数は、1以上の数字で入れてください。',
    '「柔道」の勝ちが、試合数（2）より多くなっています。',
    '他の格闘技の勝ちを、数字で入れてください。',
    '獲得年は、4けたの数字で入れてください。',
  ]);
  assert.ok(many.every((text) => !/負け|引き分け|勝敗なし/.test(text)), '画面にない言葉は、使わない');
  // 決まりの確認（core/recordDetail.ts）の言葉も、勝ちに関すること以外は、そのまま出る
  assert.ok(recordProblems({ games: '0', win: '' }, Array.from({ length: 6 }, () => ({ sport: '空手', games: '1', win: '1' })), []).some((text) => text.includes('他の格闘技は、5つまでです')));
});

test('確認の行：キック・他の格闘技・タイトルの順に、見出しと中身を出す。「4戦3勝1敗」の形（2026-10-24 owner。敗＝試合数−勝ち）', () => {
  const pairs = recordReviewPairs(full());
  assert.equal(pairs[0][0], 'キックボクシング');
  assert.equal(pairs[0][1], '4戦3勝1敗');
  assert.ok(pairs[1][0].startsWith('他の格闘技：空手'));
  assert.equal(pairs[1][1], '3戦1勝2敗', '敗は、試合数−勝ち（引き分け・勝敗なしも入る）。表の「負け」の数ではない');
  assert.ok(pairs[2][0].startsWith('タイトル・入賞：'));
  assert.equal(recordReviewPairs(full({ kick: EMPTY_KICK, others: [], titles: [] }))[0][1], '未経験（試合数 0）');
  // 画面が作る形（試合数と勝ちだけ）から通しで：試合数5・勝ち3 → 5戦3勝2敗
  const typed = recordReviewPairs(detailFromText({ games: '5', win: '3' }, [{ sport: '柔道', games: '12', win: '7' }], []));
  assert.deepEqual(typed.map((pair) => pair[1]), ['5戦3勝2敗', '12戦7勝5敗']);
});

test('recordLine：○戦○勝○敗。敗＝試合数−勝ち。全勝は0敗、全敗は0勝', () => {
  assert.equal(recordLine(5, 3), '5戦3勝2敗');
  assert.equal(recordLine(1, 1), '1戦1勝0敗');
  assert.equal(recordLine(2, 0), '2戦0勝2敗');
  assert.equal(recordLine(999, 0), '999戦0勝999敗');
});

test('「敗」の一言：試合数から勝ちを引いた数で、引き分けも入る、と言う。確認の画面は、戦に出る行があるときだけ出す', () => {
  assert.equal(RECORD_LOSS_NOTE, '「敗」は、試合数から勝ちと引き分けを引いた数です。');
  const page = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /\{recordOn && \(detailNow\.kick\.games > 0 \|\| detailNow\.others\.length > 0\) \? <p id="review-record-note" className="mt-2 text-\[1\.0625rem\] text-slate-700">\{RECORD_LOSS_NOTE\}<\/p> : null\}/, '新しいリンクで、戦に出る行があるときだけ');
  // 送る形・シート・準備の画面は、変えていない（出す場所は確認の画面だけ）
  assert.equal(kickRecordText({ games: 4, win: 3, loss: 1, draw: 0 }), '4戦3勝1敗', 'シートの戦績の一行も、同じ ○戦○勝○敗（2026-10-24 owner。『分』は出さない）');
});

test('申し込みリンク：rd=on は、protocol 3 のときだけ読む。付けないリンク（古いリンク）には、rd が無い', () => {
  const base: PublicEntryConfig = { endpoint: 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec', eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
  const oldLink = publicEntryHash(base);
  assert.equal(oldLink.includes('rd='), false, '古いリンクには rd が無い（今までと1字も変わらない）');
  assert.equal(publicEntryConfig(oldLink).recordDetail, undefined);
  const newLink = publicEntryHash({ ...base, recordDetail: true });
  assert.ok(newLink.includes('rd=on'));
  assert.equal(publicEntryConfig(newLink).recordDetail, true);
  const old2 = publicEntryHash({ ...base, protocol: '2', recordDetail: true });
  assert.ok(old2.includes('rd=on') && old2.includes('protocol=2'), 'rd=on が付いた protocol 2 のリンク（試す材料が、ほんとうにそうなっている）');
  assert.equal(publicEntryConfig(old2).recordDetail, undefined, 'protocol 2 の受付では、rd を読まない');
  assert.ok(LINK_END_KEY.length > 0);
});

test('シートの版：くわしい戦績は 3.20261024.1 以降だけ（.2 も同じ）。前の版はそのまま使える（一覧に残っている）', () => {
  assert.equal(EXPECTED_RECEPTION_BUILD, '3.20261026.3');
  assert.ok((ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes('3.20261024.1'), '前の版（3.20261024.1）も、まだ受け付ける');
  assert.ok((ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes('3.20261022.7'), '花道と誓約書の版は、まだ受け付ける');
  assert.equal(supportsRecordDetail({ build: '3.20261022.7' }), false);
  assert.equal(supportsRecordDetail({ build: '3.20261024.1' }), true);
  assert.equal(supportsRecordDetail({ build: '3.20261024.2' }), true);
  assert.equal(supportsRecordDetail({ build: '3.20261099.9' }), false, '知らない版は、くわしい戦績を付けない');
  assert.equal(supportsRecordDetail(null), false);
});

/* ───────── 見直し（2026-10-24）で直した所 ───────── */

test('records.csv の「\'」: = + - @ で始まる文字の前の守りの \' を、1つだけ外す。名簿の unguardCell と同じ答え（本物の \' は外さない）', () => {
  for (const value of ["'-60kg", "'+80kg", "'=架空", "'@優勝", "'-", "'--", "'''-x"]) assert.equal(unguardRecordCell(value), unguardCell(value), JSON.stringify(value));
  assert.equal(unguardRecordCell("'-60kg"), '-60kg');
  assert.equal(unguardRecordCell("''-60kg"), "''-60kg", "守りは先頭の1つだけ。先頭の \' のあとが \' なので（= + - @ ではない）、外さない");
  for (const value of ['-60kg', 'abc', "'abc", "O'Brien", '', "'"]) assert.equal(unguardRecordCell(value), unguardCell(value), JSON.stringify(value) + '：外さない');
});

test('parseRecordDetailCsv: 文字の欄（競技名・大会名・階級・成績）は守りの \' を外す。数の欄・受付番号・種類は、そのまま', () => {
  const head = RECORD_DETAIL_HEADERS.map((cell) => '"' + cell + '"').join(',');
  const row = (cells: string[]) => cells.map((cell) => '"' + cell + '"').join(',');
  const csv = [head,
    row(['R-1', '2026-10-01', 'キック', 'キックボクシング', '4', '3', '1', '0', '', '', '', '']),
    row(['R-1', '2026-10-01', '他の格闘技', "'-柔道", '2', '1', '1', '0', '0', '', '', '']),
    row(['R-1', '2026-10-01', 'タイトル・入賞', "'=架空カップ", '', '', '', '', '', '2025', "'-60kg", "'@優勝"]),
  ].join('\r\n');
  const parsed = parseRecordDetailCsv(csv);
  assert.ok(parsed.ok);
  const detail = parsed.ok ? parsed.byReceipt.get('R-1') : null;
  assert.equal(detail?.others[0].sport, '-柔道');
  assert.deepEqual(detail?.titles[0], { event: '=架空カップ', year: 2025, class: '-60kg', result: '@優勝' });
  assert.deepEqual(detail?.kick, { games: 4, win: 3, loss: 1, draw: 0 });
});

test('kickTextOf: 初試合（試合数0）の勝ちは空に戻す。ふつうの勝ちは、そのまま', () => {
  assert.deepEqual(kickTextOf({ games: 0, win: 0, loss: 0, draw: 0 }), { games: '0', win: '', draw: '' });
  assert.deepEqual(kickTextOf({ games: 4, win: 0, loss: 4, draw: 0 }), { games: '4', win: '0', draw: '' }, '4戦0勝は、勝ち0を入れた人');
  assert.deepEqual(kickTextOf({ games: 4, win: 3, loss: 1, draw: 0 }), { games: '4', win: '3', draw: '' });
  assert.deepEqual(kickTextOf({ games: 5, win: 3, loss: 1, draw: 1 }), { games: '5', win: '3', draw: '1' }, '引き分けがあれば、そのまま戻す');
});

test('recordIsWrong: 入れたのにまちがっているときだけ true。空・入力の途中は false（黄色の札を「入れる」でなく「直す」にする目安）', () => {
  const none: KickText = { games: '', win: '' };
  assert.equal(recordIsWrong(none, [], []), false, '何も入れていない');
  assert.equal(recordIsWrong({ games: '3', win: '' }, [], []), false, '試合数だけ：入力の途中');
  assert.equal(recordIsWrong({ games: '0', win: '' }, [], []), false, '未経験');
  assert.equal(recordIsWrong({ games: '3', win: '5' }, [], []), true, '勝ちが試合数より多い');
  assert.equal(recordIsWrong({ games: '3', win: 'あ' }, [], []), true, '勝ちが数字でない');
  assert.equal(recordIsWrong({ games: 'あ', win: '' }, [], []), true, '試合数が数字でない');
  assert.equal(recordIsWrong({ games: '1000', win: '' }, [], []), true, '試合数が上限をこえる');
  assert.equal(recordIsWrong({ games: '３', win: '２' }, [], []), false, '全角の数字は読める');
  const ok: KickText = { games: '5', win: '3' };
  assert.equal(recordIsWrong(ok, [{ sport: '', games: '', win: '' }], []), false, '足したばかりの空の行は、まちがいではない');
  assert.equal(recordIsWrong(ok, [{ sport: '柔道', games: '', win: '' }], []), false, '競技名だけ：入力の途中');
  assert.equal(recordIsWrong(ok, [{ sport: '柔道', games: '3', win: '4' }], []), true, '勝ちが試合数より多い');
  assert.equal(recordIsWrong(ok, [{ sport: '柔道', games: '0', win: '' }], []), true, '他の格闘技の試合数は1以上');
  assert.equal(recordIsWrong(ok, [{ sport: 'あ'.repeat(21), games: '1', win: '1' }], []), true, '競技名が長すぎる');
  assert.equal(recordIsWrong(ok, [{ sport: 'あ'.repeat(20), games: '1', win: '1' }], []), false, '競技名がちょうど20字');
  assert.equal(recordIsWrong(ok, [], [{ event: '', year: '', class: '', result: '' }]), false, '空のタイトルの行');
  assert.equal(recordIsWrong(ok, [], [{ event: '架空', year: '25', class: '', result: '' }]), true, '4けたでない年');
  assert.equal(recordIsWrong(ok, [], [{ event: '架空', year: '2025', class: '', result: '' }]), false, '年はよい。ほかはまだ');
  assert.equal(recordIsWrong(ok, [], [{ event: 'あ'.repeat(61), year: '', class: '', result: '' }]), true, '大会名が長すぎる');
});


/* ───────── 引き分け（2026-10-25 owner：引き分けも表示できる作りに） ───────── */
test('引き分け：欄は空なら0。負け＝試合数−勝ち−引き分け。一行は「5戦3勝1敗1分」、0なら「5戦3勝2敗」。Googleの受付は、そのまま受ける', () => {
  const k: KickText = { games: '5', win: '3', draw: '1' };
  assert.deepEqual(detailFromText(k, [], []).kick, { games: 5, win: 3, loss: 1, draw: 1 });
  assert.deepEqual(detailFromText({ games: '5', win: '3', draw: ' ' }, [], []).kick, { games: 5, win: 3, loss: 2, draw: 0 }, '空白だけは0');
  assert.deepEqual(detailFromText({ games: '5', win: '3', draw: '１' }, [], []).kick.draw, 1, '全角も読む');
  assert.deepEqual(detailFromText({ games: '0', win: '', draw: '2' }, [], []).kick, { games: 0, win: 0, loss: 0, draw: 0 }, '未経験は引き分けも見ない');
  assert.deepEqual(recordDetailProblems(detailFromText(k, [], [])), []);
  assert.equal(kickRecordText(detailFromText(k, [], []).kick), '5戦3勝1敗1分', 'シートの一行（.gs の recordDetailKickText_ も同じ形）');
  assert.equal(kickRecordText(detailFromText({ games: '5', win: '3', draw: '' }, [], []).kick), '5戦3勝2敗');
  assert.equal(recordLine(5, 3, 1), '5戦3勝1敗1分');
  assert.equal(recordLine(5, 3, 2), '5戦3勝0敗2分');
  assert.equal(recordLine(5, 3), '5戦3勝2敗');
  assert.deepEqual(recordReviewPairs(detailFromText(k, [{ sport: '空手', games: '4', win: '1', draw: '2' }], []))[0], ['キックボクシング', '5戦3勝1敗1分']);
  assert.deepEqual(recordReviewPairs(detailFromText(k, [{ sport: '空手', games: '4', win: '1', draw: '2' }], []))[1], ['他の格闘技：空手', '4戦1勝1敗2分']);
  assert.equal(
    packRecordDetail(detailFromText(k, [{ sport: '空手', games: '4', win: '1', draw: '2' }], [])),
    '{"v":1,"kick":{"games":5,"win":3,"loss":1,"draw":1},"others":[{"sport":"空手","games":4,"win":1,"loss":1,"draw":2,"noResult":0}],"titles":[]}',
  );
  assert.deepEqual(kickFromRecordText('5戦3勝1敗1分'), { games: 5, win: 3, loss: 1, draw: 1 }, '一行から戻せる（準備の画面・下書き）');
});

test('引き分け：直す所の言い方。数字でない・勝ちと合わせて試合数より多い。空は直さない', () => {
  assert.deepEqual(recordProblems({ games: '5', win: '3', draw: '' }, [], []), []);
  assert.deepEqual(recordProblems({ games: '5', win: '3', draw: 'いち' }, [], []), ['キックボクシングの引き分けを、数字で入れてください（無ければ、空のままにします）。']);
  assert.deepEqual(recordProblems({ games: '5', win: '3', draw: '3' }, [], []), ['キックボクシングの勝ちと引き分けを合わせた数が、試合数（5）より多くなっています。']);
  assert.deepEqual(recordProblems({ games: '5', win: '6', draw: '' }, [], []), ['キックボクシングの勝ちが、試合数（5）より多くなっています。'], '勝ちだけで多いときは、今までの言い方');
  assert.deepEqual(recordProblems({ games: '0', win: '' }, [{ sport: '空手', games: '3', win: '2', draw: '2' }], []), ['「空手」の勝ちと引き分けを合わせた数が、試合数（3）より多くなっています。']);
  assert.equal(recordIsWrong({ games: '5', win: '3', draw: '' }, [], []), false);
  assert.equal(recordIsWrong({ games: '5', win: '', draw: '1' }, [], []), false, '勝ちがまだ：入力の途中');
  assert.equal(recordIsWrong({ games: '5', win: '3', draw: '3' }, [], []), true);
  assert.equal(recordIsWrong({ games: '5', win: '3', draw: 'x' }, [], []), true);
  assert.equal(recordIsWrong({ games: '0', win: '' }, [{ sport: '空手', games: '3', win: '1', draw: '5' }], []), true);
});

test('引き分けがあっても、A・Bクラスのすすめは勝ちの数だけで決める', () => {
  const settings = { ...DEFAULT_CLASS_SETTINGS, enabled: true };
  assert.deepEqual(suggestClass('5戦3勝1敗1分', settings), suggestClass('5戦3勝2敗', settings));
  assert.equal(suggestClass('5戦3勝1敗1分', settings)?.wins, 3);
  assert.deepEqual(suggestClass('5戦2勝0敗3分', settings), suggestClass('2勝0敗', settings));
});
