/** Only loopback endpoints and synthetic data. No real email login or Google access. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { decryptPayload, encryptBackup } from '../app/lib/privateStore.ts';
import { emptyTournament } from '../core/privateTournament.ts';
const { chromium }=await import(process.env.TOS_PLAYWRIGHT_MODULE||'playwright');
const workerPort=Number(process.env.TOS_WORKER_PORT||8871),previewPort=Number(process.env.TOS_BROWSER_PORT||4427);
if(![workerPort,previewPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw new Error('Local test ports only');
const workerBase='http://127.0.0.1:'+workerPort;const root=resolve('out');
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')) {
   const bytes=[];for await(const chunk of req)bytes.push(chunk);
   const response=await fetch(workerBase+url.pathname+url.search,{method:req.method,headers:{'content-type':'application/json','x-operator-key':req.headers['x-operator-key']||''},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(bytes)});
   res.writeHead(response.status,{'content-type':'application/json'});res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  const bytes=await readFile(path);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream';res.writeHead(200,{'content-type':mime});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(previewPort,'127.0.0.1',r));
const base='http://127.0.0.1:'+previewPort,event='browser-'+Date.now();
const browser=await chromium.launch({headless:true,channel:'chrome'});
let ctxA,ctxB,ctxEntry;
try{
 const errors=[],external=[];
 const context=async()=>{
  const c=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  await c.addInitScript(()=>{if(location.hostname==='127.0.0.1')localStorage.setItem('uizin.eventos.operatorKey','test-only-operator');});
  await c.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')&&!route.request().url().startsWith('data:')){external.push(route.request().url());return route.abort();}return route.continue();});
  c.on('page',p=>p.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);}));return c;
 };
 ctxA=await context();ctxB=await context();
 const pageA=await ctxA.newPage();await pageA.goto(base+'/setup/?event='+event);
 await pageA.getByLabel('大会名',{exact:true}).fill('架空の検証大会');
 await pageA.getByLabel('開催日',{exact:true}).fill('２０２７１００３');await pageA.getByLabel('会場',{exact:true}).click();
 check(await pageA.getByLabel('開催日',{exact:true}).inputValue()==='2027年10月3日','date normalization');
 await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();
 check(await pageA.locator('nav button').count()===6,'six steps');check(await pageA.getByLabel('管理用パスワード',{exact:true}).count()===0&&await pageA.locator('input[type=password]').count()===1,'only encrypted-handoff password, no admin password');
 const pageB=await ctxB.newPage();await pageB.goto(base+'/setup/?event='+event);await pageB.getByLabel('大会名',{exact:true}).waitFor();
 check(await pageB.getByLabel('大会名',{exact:true}).inputValue()==='架空の検証大会','separate context reopened cloud state');
 const backendRead=async(id=event)=>{const r=await fetch(workerBase+'/api/private-event?event='+id,{headers:{'x-operator-key':'test-only-operator'}});return (await r.json()).event;};
 let data=await backendRead();
 data={...data,fighters:[{id:'DUMMY1',gym:'架空ジム',name:'架空選手',grade:'',age:'',height:'170',weight:'60',record:'',comment:'',musicUrl:'',photoDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6cAAAAABJRU5ErkJggg=='}]};
 const upload=await fetch(workerBase+'/api/private-event?event='+event,{method:'PUT',headers:{'x-operator-key':'test-only-operator'},body:JSON.stringify(data)});check(upload.status===200,'fixture saved with photo');
 await pageB.goto(base+'/cloud-manage/?event='+event+'&storage=cloud');await pageB.getByRole('heading',{name:'大会当日の名簿をクラウドに保存'}).waitFor();
 check((await pageB.getByRole('link',{name:'大会画面を開く'}).getAttribute('href')).includes('storage=cloud'),'live preserves cloud mode');
 const backupData={...await backendRead(),title:'復元した架空大会'};
 const encrypted=await encryptBackup(backupData,'Dummy-backup-password');
 await pageB.getByPlaceholder('10文字以上のパスワード').fill('Dummy-backup-password');
 pageB.on('dialog',d=>d.accept());
 await pageB.locator('input[accept=".enc"]').setInputFiles({name:'dummy.tournament.enc',mimeType:'application/octet-stream',buffer:Buffer.from(encrypted)});
 await pageB.getByRole('status').filter({hasText:'復元しました。'}).waitFor();
 check((await backendRead()).title==='復元した架空大会','backup restored through second context');
 await pageA.reload();await pageA.getByLabel('大会名',{exact:true}).waitFor();check(await pageA.getByLabel('大会名',{exact:true}).inputValue()==='復元した架空大会','first context sees restore');
 check((await backendRead('other-'+event))===null,'different tournament isolated');
 const unauth=await fetch(workerBase+'/api/private-event?event='+event);check(unauth.status===401,'unauth rejected');
 // The public entry context receives no operator key. Real browser form -> local Worker -> same roster.
 await pageA.getByRole('button',{name:'2. 選手を募集',exact:true}).click();
 await pageA.getByLabel('大会の説明',{exact:true}).fill('架空の募集説明');
 await pageA.getByLabel('申し込みを受け付ける',{exact:true}).check();
 await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();
 const entryHref=await pageA.getByRole('link',{name:'選手に渡す募集ページを開く',exact:true}).getAttribute('href');check(entryHref.startsWith('/cloud-entry/?code='),'public recruitment link after explicit open');
 ctxEntry=await browser.newContext({viewport:{width:390,height:844}});
 await ctxEntry.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')&&!route.request().url().startsWith('data:')){external.push(route.request().url());return route.abort();}return route.continue();});
 const entryPage=await ctxEntry.newPage();entryPage.on('pageerror',e=>errors.push(e.message));
 let submitted;entryPage.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/cloud-entry'))submitted=r.postDataJSON();});
 await entryPage.goto(base+entryHref);await entryPage.getByRole('heading',{name:'復元した架空大会',exact:true}).waitFor();
 check(await entryPage.evaluate(()=>localStorage.getItem('uizin.eventos.operatorKey'))===null,'public entrant has no operator credential');
 for(const [label,value] of [['ジム名 必須','架空受付ジム'],['選手名 必須','架空受付選手'],['身長（cm）必須','170'],['体重（kg）必須','62'],['戦績・競技歴 必須','初試合']])await entryPage.getByLabel(label,{exact:true}).fill(value);
 const picture=await entryPage.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/png').split(',')[1];});
 await entryPage.locator('input[type=file]').setInputFiles({name:'dummy.png',mimeType:'image/png',buffer:Buffer.from(picture,'base64')});await entryPage.getByRole('status').filter({hasText:'写真を選びました。'}).waitFor();
 await entryPage.getByRole('button',{name:'この選手を追加',exact:true}).click();await entryPage.getByRole('button',{name:'大会へ申し込む',exact:true}).click();await entryPage.getByRole('status').filter({hasText:'申し込みを受け付けました。'}).waitFor();
 data=await backendRead();check(data.fighters.length===2&&data.fighters.some(f=>f.name==='架空受付選手'&&f.photoDataUrl.startsWith('data:image/')),'online submission joins same cloud roster with photo');
 const publicUrl=workerBase+'/api/cloud-entry'+entryHref.slice(entryHref.indexOf('?'));
 check((await fetch(publicUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(submitted)})).status===200&&(await backendRead()).fighters.length===2,'lost-response retry is idempotent');
 const publicData=await (await fetch(publicUrl)).json();check(!JSON.stringify(publicData).includes('fighters')&&!JSON.stringify(publicData).includes('架空受付選手'),'public config never exposes roster');
 // Apply numeric rules through the setup UI, then operate a persisted shared clock.
 data=await backendRead();const entryFighter=data.fighters.find(f=>f.name==='架空受付選手');
 const card=await fetch(workerBase+'/api/private-event?event='+event,{method:'PUT',headers:{'x-operator-key':'test-only-operator'},body:JSON.stringify({...data,bouts:[{id:'DUMMY-BOUT',redId:'DUMMY1',blueId:entryFighter.id,className:'62kg',rule:'架空の時間設定'}]})});check(card.status===200,'synthetic card fixture added');
 await pageA.reload();await pageA.getByLabel('大会名',{exact:true}).waitFor();await pageA.getByRole('button',{name:'5. 対戦を作る',exact:true}).click();
 await pageA.getByLabel('ラウンド数',{exact:true}).fill('2');await pageA.getByLabel('1ラウンドの秒数',{exact:true}).fill('10');await pageA.getByLabel('休憩の秒数',{exact:true}).fill('1');await pageA.getByRole('button',{name:'全試合にこの時間を設定する',exact:true}).click();
 await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();check((await backendRead()).schedule[0].roundSeconds===10,'timer settings saved through setup');
 await pageA.goto(base+'/cloud-manage/live/?event='+event+'&storage=cloud');await pageA.getByRole('button',{name:'時計を開始',exact:true}).waitFor();
 check(await pageA.getByLabel('残り時間',{exact:true}).textContent()==='00:10','saved rule applied to live timer');
 await pageA.getByRole('button',{name:'時計を開始',exact:true}).click();await pageA.getByLabel('時計の状態',{exact:true}).filter({hasText:'進行中'}).waitFor();
 await pageB.goto(base+'/cloud-manage/live/?event='+event+'&storage=cloud');await pageB.getByLabel('時計の状態',{exact:true}).filter({hasText:'進行中'}).waitFor();check((await backendRead()).timer.status==='running','second context reopened running timer');
 await pageB.getByRole('button',{name:'時計を止める',exact:true}).click();await pageB.getByLabel('時計の状態',{exact:true}).filter({hasText:'停止中'}).waitFor();
 await pageA.reload();await pageA.getByLabel('時計の状態',{exact:true}).filter({hasText:'停止中'}).waitFor();const remaining=await pageA.getByLabel('残り時間',{exact:true}).textContent();check(remaining===await pageB.getByLabel('残り時間',{exact:true}).textContent(),'paused remaining time agrees across contexts');
 // A paused timer and recruitment settings also survive an encrypted browser restore.
 const timerBackup=await encryptBackup(await backendRead(),'Dummy-backup-password');
 await pageB.goto(base+'/cloud-manage/?event='+event+'&storage=cloud');await pageB.getByPlaceholder('10文字以上のパスワード').fill('Dummy-backup-password');
 await pageB.locator('input[accept=".enc"]').setInputFiles({name:'dummy-clock.enc',mimeType:'application/octet-stream',buffer:Buffer.from(timerBackup)});await pageB.getByRole('status').filter({hasText:'復元しました。'}).waitFor();check((await backendRead()).timer.status==='paused'&&(await backendRead()).recruitment.open,'backup restore preserves timer and recruitment');
 await pageA.reload();await pageA.getByRole('button',{name:'時計を開始',exact:true}).waitFor();pageA.on('dialog',d=>d.accept());await pageA.getByRole('button',{name:'時計を最初へ戻す',exact:true}).click();await pageA.getByLabel('残り時間',{exact:true}).filter({hasText:'00:10'}).waitFor();check((await backendRead()).timer.round===1,'timer reset persisted');
 // A missed first-round end must wait for the chair; it may never auto-start round two.
 data=await backendRead();const elapsed=await fetch(workerBase+'/api/private-event?event='+event,{method:'PUT',headers:{'x-operator-key':'test-only-operator'},body:JSON.stringify({...data,timer:{...data.timer,status:'running',startedAt:Date.now()-25000}})});check(elapsed.status===200,'elapsed timer fixture saved');
 await pageA.reload();await pageA.getByLabel('時計の状態',{exact:true}).filter({hasText:'停止中'}).waitFor();check(await pageA.getByLabel('残り時間',{exact:true}).textContent()==='00:10'&&await pageA.getByText('ラウンド 2',{exact:true}).isVisible(),'next round waits for chair after reopening');
 await pageA.getByRole('button',{name:'時計を開始',exact:true}).click();await pageA.getByLabel('時計の状態',{exact:true}).filter({hasText:'進行中'}).waitFor();data=await backendRead();check(data.timer.round===2&&data.timer.status==='running','chair explicitly starts round two');
 const finalElapsed=await fetch(workerBase+'/api/private-event?event='+event,{method:'PUT',headers:{'x-operator-key':'test-only-operator'},body:JSON.stringify({...data,timer:{...data.timer,startedAt:Date.now()-15000}})});check(finalElapsed.status===200,'elapsed final round fixture saved');
 await pageA.reload();await pageA.getByText('試合時間が終了しました',{exact:true}).waitFor();check(await pageA.getByLabel('残り時間',{exact:true}).textContent()==='00:00','final clock remains complete after reopening');
 await pageA.goto(base+'/setup/?event='+event);await pageA.getByLabel('大会名',{exact:true}).waitFor();await pageA.getByRole('button',{name:'2. 選手を募集',exact:true}).click();await pageA.getByLabel('申し込みを受け付ける',{exact:true}).uncheck();await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();check((await fetch(publicUrl)).status===404&&(await fetch(publicUrl,{method:'POST',body:JSON.stringify(submitted)})).status===404,'closing recruitment stops old public link');
 await pageA.getByRole('button',{name:'6. リンクを渡す',exact:true}).click();await pageA.getByLabel('観客には氏名・所属・体重だけを公開する',{exact:true}).check();await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();
 const viewerHref=await pageA.getByRole('link',{name:'観客に渡す画面を開く',exact:true}).getAttribute('href');const viewer=await ctxEntry.newPage();viewer.on('pageerror',e=>errors.push(e.message));await viewer.goto(base+viewerHref);await viewer.getByRole('heading',{name:'架空受付選手',exact:true}).waitFor();
 check(await viewer.locator('img').count()===0&&await viewer.getByText('架空受付ジム',{exact:true}).isVisible(),'spectator shows allowed identity without photos');
 const viewerUrl=workerBase+'/api/cloud-view'+viewerHref.slice(viewerHref.indexOf('?'));const minimal=await (await fetch(viewerUrl)).json();check(Object.keys(minimal.view.blue).sort().join(',')==='gym,name,weight'&&!JSON.stringify(minimal).includes('photoDataUrl'),'spectator API returns only selected fields');
 await pageA.getByLabel('観客には氏名・所属・体重だけを公開する',{exact:true}).uncheck();await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();await viewer.reload();await viewer.getByRole('status').filter({hasText:'観客向け画面は開いていません。'}).waitFor();check((await fetch(viewerUrl)).status===404,'closing spectator view disables old link');
 check(await pageA.locator('section[id^="setup-"]').count()===6,'all setup sections share one page');
 check(await pageA.getByLabel('次にすること',{exact:true}).isVisible(),'next action guidance visible');
 await pageA.getByRole('button',{name:'新しい大会を作る',exact:true}).click();await pageA.getByRole('status').filter({hasText:'前回の基本設定を使います。'}).waitFor();
 check(await pageA.getByLabel('大会の説明',{exact:true}).inputValue()==='架空の募集説明','new event reuses previous description');
 check(await pageA.getByLabel('1ラウンドの秒数',{exact:true}).inputValue()==='10'&&await pageA.getByLabel('ラウンド数',{exact:true}).inputValue()==='2','time controls display the inherited settings');
 check(!await pageA.getByLabel('申し込みを受け付ける',{exact:true}).isChecked()&&!await pageA.getByLabel('観客には氏名・所属・体重だけを公開する',{exact:true}).isChecked(),'copied event starts with reception and audience closed');
 await pageA.getByLabel('大会名',{exact:true}).fill('新しい架空大会');await pageA.getByLabel('開催日',{exact:true}).fill('２０２７１１０３');await pageA.getByLabel('会場',{exact:true}).fill('架空体育館');await pageA.getByRole('button',{name:'大会をクラウドに保存する',exact:true}).click();await pageA.getByRole('status').filter({hasText:/^クラウドに保存しました。$/}).waitFor();
 const copiedId=new URL(pageA.url()).searchParams.get('event');const copied=await backendRead(copiedId);check(copiedId!==event&&copied.fighters.length===0&&copied.bouts.length===0&&copied.schedule[0].roundSeconds===10,'new event inherits time settings without roster or cards');
 await pageA.reload();await pageA.getByLabel('大会名',{exact:true}).waitFor();check(await pageA.getByLabel('大会名',{exact:true}).inputValue()==='新しい架空大会'&&(await backendRead()).fighters.length===2,'reload opens the saved new event and preserves old roster');
 await pageA.getByLabel('途中保存の状態',{exact:true}).filter({hasText:/途中保存があります|途中までクラウドに保存しました/}).waitFor();check(!await pageA.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),'reopening unchanged saved time settings does not show a false closing warning');
 await pageA.setViewportSize({width:390,height:844});check(await pageA.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'single-page setup has no horizontal overflow at mobile width');
 await pageA.screenshot({path:'/tmp/tournament-ui-single-page-mobile.png',fullPage:true});await pageA.setViewportSize({width:1280,height:900});
 await pageA.screenshot({path:'/tmp/tournament-cloudflare-six-steps.png',fullPage:true});
 // Local mode must not send any tournament data to an API.
 const local=await ctxA.newPage();let localApi=0;local.on('request',r=>{if(r.url().includes('/api/'))localApi++;});await local.goto(base+'/private/?event=local-'+event);await local.getByRole('heading',{name:'4つの手順で、対戦カードを作ります。'}).waitFor();check(localApi===0,'local mode has no API traffic');
 {
 // Unfinished auto-save is separate from the published event; encrypted handoff works offline.
 const draftId='draft-'+Date.now(),unfinished=await ctxA.newPage();await unfinished.goto(base+'/setup/?storage=cloud&event='+draftId);await unfinished.getByLabel('大会名',{exact:true}).waitFor();
 await unfinished.getByLabel('大会名',{exact:true}).fill('途中の架空大会');await unfinished.getByLabel('開催日',{exact:true}).fill('202710');await unfinished.getByLabel('申し込み締切（空欄は締切なし）',{exact:true}).fill('202709');await unfinished.getByLabel('1ラウンドの秒数',{exact:true}).fill('120');
 await unfinished.getByLabel('途中保存の状態',{exact:true}).filter({hasText:'途中までクラウドに保存しました。'}).waitFor();
 check((await backendRead(draftId))===null,'unfinished draft never writes the published event');
 const resumed=await ctxB.newPage();await resumed.goto(base+'/setup/?storage=cloud&event='+draftId);await resumed.getByRole('button',{name:'続きから開く',exact:true}).waitFor();resumed.once('dialog',dialog=>dialog.accept());await resumed.getByRole('button',{name:'続きから開く',exact:true}).click();
 check(await resumed.getByLabel('開催日',{exact:true}).inputValue()==='202710'&&await resumed.getByLabel('申し込み締切（空欄は締切なし）',{exact:true}).inputValue()==='202709','second browser resumes incomplete date and deadline');
 check(await resumed.getByLabel('1ラウンドの秒数',{exact:true}).inputValue()==='120','draft preserves unapplied timer controls');
 await unfinished.getByText('困ったら製作者に引き継ぐ',{exact:true}).click();await unfinished.getByLabel('引継ぎの合言葉（10文字以上）',{exact:true}).fill('test-only-handoff');const downloadPromise=unfinished.waitForEvent('download');await unfinished.getByRole('button',{name:'製作者に渡すファイルを作る',exact:true}).click();const download=await downloadPromise,downloadPath=await download.path(),encrypted=await readFile(downloadPath,'utf8'),pack=await decryptPayload(encrypted,'test-only-handoff');
 check(!encrypted.includes('途中の架空大会')&&pack.document.date==='202710'&&pack.controls.roundSeconds===120,'encrypted handoff contains current unfinished data');
 const handoff=await ctxA.newPage();await handoff.goto(base+'/setup/?storage=cloud&event=handoff-'+Date.now());await handoff.getByLabel('大会名',{exact:true}).waitFor();await handoff.getByText('困ったら製作者に引き継ぐ',{exact:true}).click();await handoff.getByLabel('引継ぎの合言葉（10文字以上）',{exact:true}).fill('test-only-handoff');handoff.once('dialog',dialog=>dialog.accept());await handoff.getByLabel('製作者：受け取ったファイルを開く',{exact:true}).setInputFiles(downloadPath);await handoff.getByRole('status').filter({hasText:'引継ぎ内容を開きました。'}).waitFor();
 check(await handoff.getByLabel('大会名',{exact:true}).inputValue()==='途中の架空大会'&&await handoff.getByLabel('開催日',{exact:true}).inputValue()==='202710','designer resumes from the encrypted handoff file');
 check((await backendRead(draftId))===null,'importing handoff does not publish or overwrite the event');
 }
 {
 const safety=await ctxA.newPage();await safety.goto(base+'/setup/?storage=cloud&event=safety-'+Date.now());await safety.getByLabel('大会名',{exact:true}).waitFor();await safety.getByLabel('途中保存の状態',{exact:true}).filter({hasText:'途中までクラウドに保存しました。'}).waitFor();
 const warns=()=>safety.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 check(!await warns(),'no closing warning after confirmed draft save');
 await safety.route('**/api/private-draft?*',route=>route.request().method()==='PUT'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,reason:'テスト用の接続失敗'})}):route.continue());
 await safety.getByLabel('大会名',{exact:true}).fill('保存失敗時の架空入力');check(await warns(),'closing warning while changed draft is unsaved');
 await safety.getByLabel('途中保存の状態',{exact:true}).filter({hasText:'テスト用の接続失敗'}).waitFor();check(await safety.getByLabel('大会名',{exact:true}).inputValue()==='保存失敗時の架空入力'&&await warns(),'failed save retains input and closing warning');
 }
 check(external.length===0,'no external requests');check(errors.length===0,'no browser errors: '+JSON.stringify(errors));
 console.log(JSON.stringify({checks,contexts:3,result:'PASS',backend:'local Cloudflare Durable Object emulator',externalRequests:external.length,browserErrors:errors.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
