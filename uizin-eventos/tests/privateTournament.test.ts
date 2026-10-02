import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { contractWeight, importFighters, safeMusicUrl, validateTournament, emptyTournament } from '../core/privateTournament.ts';

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
  const files = ['app/private/page.tsx', 'app/private/live/page.tsx', 'app/lib/privateStore.ts'];
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /\/api\//];
  for (const file of files) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, file + ' contains ' + pattern);
  }
});

test('他ジム向け入力シートを迷わず保存して、そのままExcelで読み込める', () => {
  const source = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /選手入力シートを保存する/);
  assert.match(source, /返ってきたExcelをそのまま選べます/);
  assert.match(source, /\.xlsx,\.csv/);
  assert.match(source, /電話番号・メール・住所・生年月日・保護者名は入れません/);
  assert.equal(readFileSync(new URL('../public/templates/Tournament_OS_選手入力テンプレート.xlsx', import.meta.url)).length > 5_000, true);
});
