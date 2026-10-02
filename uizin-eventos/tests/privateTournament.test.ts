import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { contractWeight, importFighters, safeMusicUrl, validateTournament, emptyTournament } from '../core/privateTournament.ts';
import { entryConfigFromSearch, entryConfigSearch, entryCsv, entryErrors } from '../core/entryPackage.ts';

test('汎用CSVの日本語見出しを選手情報へ変換する', () => {
  const csv = 'ジム名,名前,戦績,学年,年齢,身長,体重,意気込み,入場曲URL\n青空ジム,山田太郎,2戦1勝,小5,11,145cm,38.5kg,最後まで戦う,https://music.apple.com/jp/song/1';
  const result = importFighters(csv);
  assert.equal(result.blockedHeaders.length, 0);
  assert.equal(result.fighters.length, 1);
  assert.equal(result.fighters[0].name, '山田太郎');
  assert.equal(result.fighters[0].weight, '38.5kg');
});

test('電話やメールを含むCSVは取り込み前に拒否する', () => {
  const result = importFighters('名前,電話番号,メールアドレス\n山田太郎,09000000000,a@example.com');
  assert.deepEqual(result.fighters, []);
  assert.deepEqual(result.blockedHeaders, ['電話', '電話番号', 'メール', 'メールアドレス']);
});

test('契約体重は重い側だけを簡潔に表示する', () => {
  const fighter = (weight: string) => ({ id:'x',gym:'',name:'',grade:'',age:'',height:'',weight,record:'',comment:'',musicUrl:'',photoDataUrl:'' });
  assert.equal(contractWeight(fighter('51.0kg'), fighter('57.0 kg')), '57kg契約');
});

test('同じ選手を赤青に置いた試合を拒否する', () => {
  const data = emptyTournament();
  data.bouts = [{ id: '1', redId: 'same', blueId: 'same', className: '', rule: '' }];
  assert.match(validateTournament(data)[0], /同じ選手/);
});

test('入場曲はApple MusicとYouTubeのHTTPSだけを開く', () => {
  assert.match(safeMusicUrl('https://music.apple.com/jp/song/1'), /^https:\/\/music\.apple\.com/);
  assert.match(safeMusicUrl('https://youtu.be/abc'), /^https:\/\/youtu\.be/);
  assert.equal(safeMusicUrl('javascript:alert(1)'), '');
  assert.equal(safeMusicUrl('https://example.com/song'), '');
});

test('完全ローカル画面には外部送信APIがない', () => {
  const files = ['app/private/page.tsx', 'app/private/live/page.tsx', 'app/private/entry/page.tsx', 'app/lib/privateStore.ts'];
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /\/api\//];
  for (const file of files) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, file + ' contains ' + pattern);
  }
});

test('エントリー画面はOSと同じ10列のCSVを作る', () => {
  const fighter = { id:'WM-001',gym:'青空ジム',name:'山田太郎',grade:'小5',age:'11',height:'145',weight:'38.5',record:'1戦',comment:'最後まで戦う',musicUrl:'https://music.apple.com/jp/song/1' };
  const csv = entryCsv([fighter]);
  const result = importFighters(csv);
  assert.equal(result.fighters.length, 1);
  assert.equal(result.fighters[0].id, 'WM-001');
  assert.equal(result.fighters[0].weight, '38.5');
  assert.doesNotMatch(csv.split(/\r?\n/, 1)[0], /電話|メールアドレス|住所|生年月日|保護者/);
});

test('エントリーは写真・身長・体重・戦績を必須にし、入場曲は主催者設定に従う', () => {
  const blank = { id:'1',gym:'',name:'',grade:'',age:'',height:'',weight:'',record:'',comment:'',musicUrl:'' };
  assert.equal(entryErrors(blank, false, { music:false, grade:'optional', age:'optional', comment:'optional' }).length, 6);
  assert.deepEqual(entryErrors({ ...blank, gym:'青空', name:'山田', height:'145', weight:'40', record:'初試合' }, true, { music:false, grade:'off', age:'off', comment:'off' }), []);
  assert.match(entryErrors({ ...blank, gym:'青空', name:'山田', height:'145', weight:'40', record:'1戦' }, true, { music:true, grade:'optional', age:'optional', comment:'optional' })[0], /URL/);
});

test('主催者の募集設定をURLにして同じ内容へ戻せる', () => {
  const config = { music:false, grade:'required' as const, age:'off' as const, comment:'optional' as const };
  assert.deepEqual(entryConfigFromSearch('?' + entryConfigSearch(config)), config);
});

test('標準のエントリーシートでは入場曲を表示しない', () => {
  assert.equal(entryConfigFromSearch('').music, false);
  assert.equal(entryConfigFromSearch('?music=on').music, true);
});

test('他ジム向け入力シートを迷わず保存して、そのままExcelで読み込める', () => {
  const source = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /選手入力シートを保存する/);
  assert.match(source, /返ってきたZIPを選ぶだけです/);
  assert.match(source, /\.zip,\.xlsx,\.csv/);
  assert.match(source, /電話番号・メール・住所・生年月日・保護者名は入れません/);
  assert.equal(readFileSync(new URL('../public/templates/Tournament_OS_選手入力テンプレート.xlsx', import.meta.url)).length > 5_000, true);
});
