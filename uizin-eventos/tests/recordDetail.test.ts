// くわしい戦績の決まり（core/recordDetail.ts）と、申し込みリンクの鍵（rd=on）・シートの版の判定。
// 名前・大会名・ジム名は、ぜんぶ架空。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_KICK, RECORD_DETAIL_HEADERS, RECORD_DETAIL_LIMITS, RECORD_KIND,
  kickFromRecordText, kickRecordText, packRecordDetail, parseRecordDetail, parseRecordDetailCsv, recordDetailProblems, recordDetailRows,
  type RecordDetail,
} from '../core/recordDetail.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryHash, type PublicEntryConfig } from '../core/publicEntry.ts';
import { ACCEPTED_RECEPTION_BUILDS, EXPECTED_RECEPTION_BUILD, supportsRecordDetail } from '../core/setupV3.ts';
import { detailFromText, countOf, recordReviewPairs, type KickText } from '../app/components/recordDetailText.ts';

const full = (over: Partial<RecordDetail> = {}): RecordDetail => ({
  v: 1,
  kick: { games: 4, win: 3, loss: 1, draw: 0 },
  others: [{ sport: '空手', games: 3, win: 1, loss: 1, draw: 0, noResult: 1 }],
  titles: [{ event: '架空カップ', year: 2025, class: '-60kg', result: '優勝' }],
  ...over,
});

test('キックの戦績の言い方：試合数0は「初試合」、勝ち負けは「3勝1敗」、引き分けがあるときだけ「分」', () => {
  assert.equal(kickRecordText({ games: 0, win: 0, loss: 0, draw: 0 }), '初試合');
  assert.equal(kickRecordText({ games: 4, win: 3, loss: 1, draw: 0 }), '3勝1敗');
  assert.equal(kickRecordText({ games: 4, win: 2, loss: 1, draw: 1 }), '2勝1敗1分');
  assert.deepEqual(kickFromRecordText('初試合'), EMPTY_KICK);
  assert.deepEqual(kickFromRecordText('2勝1敗1分'), { games: 4, win: 2, loss: 1, draw: 1 });
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

test('画面の数字：全角も読む。読めない字は NaN（決まりの確認で直す所になる）。未経験の勝ち負けは 0 にそろえる', () => {
  assert.equal(countOf('３'), 3);
  assert.equal(countOf(' 1,000 '), 1000);
  assert.ok(Number.isNaN(countOf('ぜろ')));
  assert.ok(Number.isNaN(countOf('')));
  const kick: KickText = { games: '0', win: '5', loss: '', draw: '' };
  assert.deepEqual(detailFromText(kick, [], []).kick, { games: 0, win: 0, loss: 0, draw: 0 }, '未経験は、勝ち負けの入力を見ずに 0');
  const kick2: KickText = { games: '3', win: '2', loss: '', draw: '' };
  assert.ok(recordDetailProblems(detailFromText(kick2, [], [])).length > 0, '空の欄があれば直す');
});

test('確認の行：キック・他の格闘技・タイトルの順に、見出しと中身を出す', () => {
  const pairs = recordReviewPairs(full());
  assert.equal(pairs[0][0], 'キックボクシング');
  assert.ok(pairs[0][1].includes('試合 4'));
  assert.ok(pairs[1][0].startsWith('他の格闘技：空手'));
  assert.ok(pairs[2][0].startsWith('タイトル・入賞：'));
  assert.equal(recordReviewPairs(full({ kick: EMPTY_KICK, others: [], titles: [] }))[0][1], '未経験（試合数 0）');
});

test('申し込みリンク：rd=on は、protocol 3 のときだけ読む。付けないリンク（古いリンク）には、rd が無い', () => {
  const base: PublicEntryConfig = { endpoint: 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec', eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
  const oldLink = publicEntryHash(base);
  assert.equal(oldLink.includes('rd='), false, '古いリンクには rd が無い（今までと1字も変わらない）');
  assert.equal(publicEntryConfig(oldLink).recordDetail, undefined);
  const newLink = publicEntryHash({ ...base, recordDetail: true });
  assert.ok(newLink.includes('rd=on'));
  assert.equal(publicEntryConfig(newLink).recordDetail, true);
  const old2 = publicEntryHash({ ...base, protocol: '2', recordDetail: true }).replace('protocol=2', 'protocol=2');
  assert.equal(publicEntryConfig(old2).recordDetail, undefined, 'protocol 2 の受付では、rd を読まない');
  assert.ok(LINK_END_KEY.length > 0);
});

test('シートの版：くわしい戦績は 3.20261024.1 以降だけ。前の版はそのまま使える（一覧に残っている）', () => {
  assert.equal(EXPECTED_RECEPTION_BUILD, '3.20261024.1');
  assert.ok((ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes('3.20261022.7'), '花道と誓約書の版は、まだ受け付ける');
  assert.equal(supportsRecordDetail({ build: '3.20261022.7' }), false);
  assert.equal(supportsRecordDetail({ build: '3.20261024.1' }), true);
  assert.equal(supportsRecordDetail({ build: '3.20261099.9' }), false, '知らない版は、くわしい戦績を付けない');
  assert.equal(supportsRecordDetail(null), false);
});
