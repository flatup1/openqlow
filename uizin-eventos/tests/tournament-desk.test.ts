import test from 'node:test';
import assert from 'node:assert/strict';
import { audioSource, defaultPads, readPads, readVolumes } from '../core/audio.ts';
import { readSnapshotCache } from '../core/snapshotCache.ts';
import { initialState } from '../core/state.ts';
import { parseProgram } from '../core/sheet.ts';
import { cueForFighter, playPlan, youtubeVideoId } from '../core/walkout.ts';
import { judgeCue } from '../core/music.ts';
import { buildProgram, EVENT_CSV, MATCHES_CSV } from './fixtures.ts';

const now = 1_700_000_000_000;
test('profile columns are optional and import kana, measurements, stance and direct entrance music', () => {
  const program = parseProgram({ event: EVENT_CSV, music: 'no,title\n', matches:
    'no,red_name,blue_name,red_kana,red_age,red_height,red_weight,red_category,red_stance,red_entrance_music_url\n1,赤選手,青選手,あかせんしゅ,20,170,60,一般,右,https://example.com/music.mp3' }, now);
  const f = program.matches[0].red;
  assert.deepEqual([f.kana, f.age, f.height, f.weight, f.category, f.stance], ['あかせんしゅ', '20', '170', '60', '一般', '右']);
  const cue = cueForFighter(program, program.matches[0], 'red');
  assert.ok(cue);
  assert.equal(playPlan(cue).kind, 'audio');
  assert.equal(judgeCue(cue, []).status, 'audio');
  assert.equal(program.matches[0].blue.kana, '');
});
test('unsafe links never become clickable or audio sources, including fake YouTube hosts', () => {
  for (const raw of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a.mp3', 'https://user:password@example.com/a.mp3']) {
    assert.equal(audioSource(raw).kind, 'invalid');
  }
  assert.equal(youtubeVideoId('https://attacker.example/?v=abcdefghijk'), '');
  assert.equal(youtubeVideoId('https://youtu.be.attacker.example/abcdefghijk'), '');
  assert.equal(audioSource('https://music.apple.com/jp/album/x/1').label, 'Apple Musicで開く');
  assert.equal(audioSource('https://youtu.be/abcdefghijk').label, 'YouTubeで開く');
  assert.equal(audioSource('https://example.com/song.WAV?signature=x').kind, 'audio');
  assert.equal(audioSource('').kind, 'empty');
});
test('ambiguous names and music assigned to another match never select the wrong entrance', () => {
  const p = buildProgram(now);
  p.cues = [p.cues[0], { ...p.cues[0], no: 20 }].map(c => ({ ...c, kind: 'other', fighterName: p.matches[0].red.name, matchNo: null }));
  assert.equal(cueForFighter(p, p.matches[0], 'red'), null);
  p.cues = [{ ...p.cues[0], matchNo: 2, kind: 'walkout_red' }];
  assert.equal(cueForFighter(p, p.matches[0], 'red'), null);
});
test('a damaged or incomplete cache is ignored; an intact one restores match and phase', () => {
  const p = buildProgram(now), s = initialState(now, p);
  s.matchIndex = 1; s.phase = 'result';
  const value = { serverNow: now, program: p, state: s, musicReport: null };
  const recovered = readSnapshotCache(JSON.stringify(value));
  assert.equal(recovered?.state.matchIndex, 1);
  assert.equal(recovered?.state.phase, 'result');
  assert.equal(readSnapshotCache('{broken'), null);
  assert.equal(readSnapshotCache(JSON.stringify({ ...value, state: { ...s, roundTimer: null } })), null);
  assert.equal(readSnapshotCache(JSON.stringify({ ...value, program: { ...p, matches: [{ no: 1 }] } })), null);
  assert.equal(readSnapshotCache(JSON.stringify({ ...value, state: { ...s, programRevision: 'wrong' } })), null);
});
test('corrupt settings cannot create invalid volume, arbitrary pads or lost defaults', () => {
  assert.deepEqual(readVolumes({ master: 20, red: -2, blue: 'loud', pads: NaN }), { master: 1, red: 0, blue: 1, pads: 0.7 });
  assert.equal(defaultPads().filter(p => p.group === 'winner').length, 5);
  assert.equal(defaultPads().filter(p => p.group === 'sampler').length, 6);
  const pads = readPads([{ id: 'sampler-0', label: '歓声2', url: 'https://example.com/cheer.mp3' }, null]);
  assert.equal(pads.length, 11); assert.equal(pads[5].label, '歓声2');
});
test('duplicate match numbers are excluded rather than made into ambiguous navigation targets', () => {
  const p = parseProgram({ event: EVENT_CSV, music: 'no,title', matches: MATCHES_CSV + '\n1,A,B,2,60,60,重複赤,,,,重複青,,,' }, now);
  assert.equal(p.matches.length, 2);
  assert.ok(p.warnings.some(w => w.includes('重複')));
});

test('legacy title/note name matching survives while names contained in other fighters are rejected', () => {
  const p = buildProgram(now);
  p.cues = [{ ...p.cues[0], kind: 'other', fighterName: '', title: p.matches[0].red.name + ' 入場曲', note: '' }];
  assert.equal(cueForFighter(p, p.matches[0], 'red')?.no, p.cues[0].no);
  p.matches[0].red.name = '山田'; p.matches[0].blue.name = '山田太郎';
  p.cues[0].title = '山田太郎 入場曲';
  assert.equal(cueForFighter(p, p.matches[0], 'red'), null);
});
