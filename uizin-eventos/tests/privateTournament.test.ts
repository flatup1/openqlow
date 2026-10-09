import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { boutWarnings, contractWeight, importFighters, mergeFighters, safeMusicUrl, validateTournament, emptyTournament, isLocalTournament } from '../core/privateTournament.ts';
import { entryConfigFromSearch, entryConfigSearch, entryCsv, entryErrors } from '../core/entryPackage.ts';
import { isAppsScriptUrl, isVenueUrl, publicEntryConfig, publicEntryHash } from '../core/publicEntry.ts';

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

test('空・負数・不正な片側体重から契約体重を作らない',()=>{
  const f={id:'x',gym:'',name:'',grade:'',age:'',height:'',weight:'51kg',record:'',comment:'',musicUrl:'',photoDataUrl:''};
  for(const weight of ['','-57kg','abc57','51/57kg','300'])assert.equal(contractWeight(f,{...f,weight}),'');
  assert.equal(contractWeight(f,undefined),'');
});
test('選手の重複番号・名簿にいない対戦相手を検出する',()=>{
  assert.throws(()=>importFighters('管理番号,選手名\nX,赤\nX,青'),/重複/);
  const data=emptyTournament();data.bouts=[{id:'bout',redId:'missing',blueId:'other',className:'',rule:''}];
  assert.match(validateTournament(data).join(''),/名簿にいない/);
});
test('復元前に大会ID・配列・試合位置・写真の形式を検証する',()=>{
  const data=emptyTournament('local-test');assert.equal(isLocalTournament(data),true);
  for(const changes of [{schema:2},{fighters:{}},{currentBout:1},{currentBout:-1},{eventId:'../../other'},{title:undefined}])assert.equal(isLocalTournament({...data,...changes}),false);
  const f={id:'x',gym:'',name:'',grade:'',age:'',height:'',weight:'51',record:'',comment:'',musicUrl:'',photoDataUrl:'https://example.com/tracking.jpg'};
  assert.equal(isLocalTournament({...data,fighters:[f]}),false);
});
test('募集項目は名簿と一緒に保存・復元でき、旧バックアップも読める',()=>{
  const data=emptyTournament('local-test');assert.equal(isLocalTournament(data),true);
  const entryConfig={music:true,grade:'required',age:'optional',comment:'off'};
  assert.equal(isLocalTournament({...data,entryConfig}),true);
  for(const entryConfig of [null,{music:'yes',grade:'required',age:'optional',comment:'off'},{music:true,grade:'wrong',age:'optional',comment:'off'}])assert.equal(isLocalTournament({...data,entryConfig}),false);
  const admin=readFileSync(new URL('../app/private/page.tsx',import.meta.url),'utf8');
  assert.match(admin,/data\.entryConfig \?\? DEFAULT_ENTRY_CONFIG/);assert.match(admin,/if\(await save\(\)\)location\.href=googleSetup/);
});
test('写真の選び直しは古い写真・遅れて終わる加工を送らず、加工中に送信できない',()=>{
  const source=readFileSync(new URL('../app/apply/page.tsx',import.meta.url),'utf8');
  assert.match(source,/setPhotoLoading\(true\); setPhoto\(''\)/);assert.match(source,/version !== photoVersionRef\.current/);assert.match(source,/if \(photoLoadingRef\.current\)/);assert.match(source,/disabled=\{sending\|\|photoLoading\|\|!endpointReady\}/);
});
test('読み込み失敗・空名簿・別大会復元・進行保存失敗で元データを上書きしない',()=>{
  const admin=readFileSync(new URL('../app/private/page.tsx',import.meta.url),'utf8');
  assert.match(admin,/setLoadError/);assert.match(admin,/!result\.fighters\.length/);assert.match(admin,/restored\.eventId !== mine\.eventId/);assert.match(admin,/setAsk\(\{ kind: 'restore', restored/);assert.match(admin,/id="confirm-restore"/);assert.ok(admin.indexOf('restored.eventId !== mine.eventId')<admin.indexOf("setAsk({ kind: 'restore'"),'別の大会かどうかは、確認より先に見る');
  const live=readFileSync(new URL('../app/private/live/page.tsx',import.meta.url),'utf8');
  assert.match(live,/const saved=await writePrivateEvent\(next\);setData\(saved\)/);assert.match(live,/savingRef\.current/);
});
test('再取り込みは管理番号で更新・追加し、写真・元の選手・対戦カード・試合順を消さない',()=>{
  const original=importFighters('管理番号,選手名,体重\nF1,赤,55\nF2,青,58').fighters;
  original[0].photoDataUrl='data:image/jpeg;base64,/9j/2Q==';
  const snapshot=JSON.stringify(original),incoming=importFighters('管理番号,選手名,体重\nF1,赤,56\nF3,赤,60').fighters;
  const merged=mergeFighters(original,incoming);assert.equal(merged.length,3);assert.equal(merged[0].weight,'56');assert.equal(merged[0].photoDataUrl,original[0].photoDataUrl);assert.deepEqual(merged[1],original[1]);assert.equal(merged[2].id,'F3');assert.equal(JSON.stringify(original),snapshot);
  assert.throws(()=>mergeFighters(original,[incoming[0],incoming[0]]),/同じ管理番号/);
  const source=readFileSync(new URL('../app/private/page.tsx',import.meta.url),'utf8');assert.match(source,/mergeKeepExisting\(current, fighters\)/);assert.ok(!/\bmergeFighters\(/.test(source),'名簿の読み込みは、前からいる人を黙って書きかえない');assert.ok(!source.includes('fighters, bouts: [], currentBout:0'));
});

test('入場曲を使わない大会では曲リンクを出さず、同じ注意文を重ねない',()=>{
  const source=readFileSync(new URL('../app/private/live/page.tsx',import.meta.url),'utf8');
  assert.match(source,/musicEnabled=data\.entryConfig\?\.music \?\? true/);
  assert.match(source,/musicEnabled \? safeMusicUrl/);
  assert.match(source,/この大会は入場曲なし/);assert.ok(!source.includes('曲なし・URL要確認'));
  assert.equal((source.match(/musicEnabled=\{musicEnabled\}/g)||[]).length,2);
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

test('ローカル画面は同じサイトの説明ファイルだけ読めて、外部送信先を許可しない', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const privateRules = headers.split('/apply/*', 1)[0];
  assert.match(privateRules, /connect-src 'self'/);
  assert.doesNotMatch(privateRules, /connect-src[^;\n]*https:/);
  assert.match(privateRules, /form-action 'none'/);
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

test('一般公開フォームの設定はURLの#内だけで受け渡す', () => {
  const config = { endpoint:'https://script.google.com/macros/s/ABC_123/exec', eventId:'cup-2027', title:'大会', organizer:'主催ジム', date:'2027-09-23', venue:'体育館', venueUrl:'https://share.google/example', deadline:'2027-09-01', contact:'公式LINE', music:true, grade:'required' as const, age:'optional' as const, comment:'off' as const };
  const hash = publicEntryHash(config);
  assert.ok(hash.startsWith('#'));
  assert.deepEqual(publicEntryConfig(hash), config);
  assert.equal(isAppsScriptUrl(config.endpoint), true);
  assert.equal(isAppsScriptUrl('https://evil.example/exec'), false);
  assert.equal(isVenueUrl(config.venueUrl), true);
  assert.equal(isVenueUrl('javascript:alert(1)'), false);
});

test('一般公開フォームはCloudflare APIへ個人情報を送らない', () => {
  const source = readFileSync(new URL('../app/apply/page.tsx', import.meta.url), 'utf8');
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /\/api\//]) assert.equal(pattern.test(source), false, String(pattern));
  assert.match(readFileSync(new URL('../core/publicEntry.ts', import.meta.url), 'utf8'), /script\\\.google\\\.com/);
  assert.match(source, /顔写真 必須/);
  assert.match(source, /連絡先のお名前 必須/);
  assert.match(source, /setTimeout\(\(\) =>/);
  assert.match(source, /target="_self"/);
  assert.doesNotMatch(source, /postMessage|<iframe/);
  assert.match(source, /old \|\| crypto.randomUUID/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /aria-label="送る前の確認"/);
  assert.match(source, /if \(!confirmed\) \{ setReviewing\(true\)/);
  assert.match(source, /confirmed && !reviewing/);
  assert.match(source, /戻って直す（送信しません）/);
});

test('Google受付は主催者アカウント内へSheetと写真フォルダを作り重複を防ぐ', () => {
  const source = readFileSync(new URL('../public/templates/Tournament_OS_Google受付.gs', import.meta.url), 'utf8');
  for (const required of ['Session.getEffectiveUser()', 'SETTINGS.expectedOwner', 'SpreadsheetApp.create', 'DriveApp.createFolder', 'LockService.getScriptLock', 'リクエストID', 'OS取込用（連絡先なし）']) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /申し込みが完了しました/);
  assert.doesNotMatch(source, /parent\.postMessage/);
});

test('Google初回設定は専門用語を一度に見せず、5段階で1つずつ案内する', () => {
  const source = readFileSync(new URL('../app/private/google-setup/page.tsx', import.meta.url), 'utf8');
  for (const text of ['主催者本人のGoogleを確認', 'プログラムをコピー', 'Googleの白い画面を開く', '実行完了', '受付用URLを作る', 'テスト申込画面を開く', '選手へ渡すURLをコピー']) assert.match(source, new RegExp(text));
  assert.match(source, /「関数なし ▼」を押す/);
  assert.match(source, /コピーする文字ではありません/);
  for (const text of ['verifyGoogleConnection', 'connection?.testComplete', 'connection.accepting', '他の会長が作った受付URLは使い回しません']) assert.ok(source.includes(text));
  assert.match(source, /SETTINGS\.expectedOwner|expectedOwner/);
  for (const text of ['createGoogleConnectionRequest', 'Googleの受付URL', 'Googleの接続を確かめる', 'googleConnectionFresh']) assert.ok(source.includes(text));
  assert.match(source,/target="_blank"/);assert.match(source,/name="action" value="verifyConnection"/);
  assert.match(source,/method="post" target="_self"/);
  assert.ok(source.includes("request:draftRequest,code:''"));
  const submissionTail=source.slice(source.indexOf("setCode('');setRequest(draftRequest)"),source.indexOf('<input type="hidden" name="action"'));
  assert.ok(!submissionTail.includes('setRequestVersion'), '送信時にGoogleへ送る確認番号を再生成しない');
  assert.ok(source.includes('exportTestTournament'));
  assert.ok(!source.includes('confirmedWebAppUrl'));
  assert.match(source,/Date\.parse\(deadlineIso\(deadline\)\+'T23:59:59\+09:00'\)>=now/);
});
test('Cloudflareの重複ヘッダーでGoogle接続確認を止めず、選手データ画面の送信禁止は維持する',()=>{
  const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
  const blocks=headers.trim().split(/\n\s*\n/).map(block=>{const lines=block.split('\n');return{path:lines[0],policy:lines.find(line=>line.trim().startsWith('Content-Security-Policy:'))||''};});
  const policies=(path:string)=>blocks.filter(block=>block.path.endsWith('*')?path.startsWith(block.path.slice(0,-1)):block.path===path).map(block=>block.policy);
  const setup=policies('/private/google-setup/');assert.equal(setup.length,1);assert.match(setup[0],/form-action https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/);assert.doesNotMatch(setup[0],/form-action 'none'/);
  for(const path of ['/private/','/private/entry/','/private/live/']){const matched=policies(path);assert.equal(matched.length,1);assert.match(matched[0],/form-action 'none'/);assert.match(matched[0],/connect-src 'self';/);}
});

test('限定公開ビルドは一般公開フォームだけを追加し、旧公開画面は混ぜない', () => {
  const source = readFileSync(new URL('../scripts/build-private-pages.sh', import.meta.url), 'utf8');
  assert.match(source, /SOURCE_DIR\/apply/);
  assert.doesNotMatch(source, /SOURCE_DIR\/entry/);
  assert.doesNotMatch(source, /SOURCE_DIR\/admin/);
});

test('対戦カードの注意：体重差・同じジム・複数試合を警告するが保存は止めない', () => {
  const f = (id: string, gym: string, weight: string) => ({ id, gym, name: id, grade: '', age: '', height: '', weight, record: '', comment: '', musicUrl: '', photoDataUrl: '' });
  const fighters = [f('A', 'x', '60'), f('B', 'y', '82kg'), f('C', 'x', '61')];
  const bout = (id: string, redId: string, blueId: string) => ({ id, redId, blueId, className: '', rule: '' });
  assert.equal(boutWarnings(bout('1', 'A', 'C'), fighters, [bout('1', 'A', 'C')]).length, 1);
  assert.ok(boutWarnings(bout('1', 'A', 'C'), fighters, [bout('1', 'A', 'C')])[0].includes('同じジム'));
  assert.ok(boutWarnings(bout('2', 'A', 'B'), fighters, [bout('2', 'A', 'B')])[0].includes('22kg'));
  const two = [bout('1', 'A', 'B'), bout('2', 'A', 'C')];
  assert.ok(boutWarnings(two[0], fighters, two).some((w) => w.includes('2 試合')));
  assert.deepEqual(boutWarnings(bout('3', '', ''), fighters, []), []);
});
