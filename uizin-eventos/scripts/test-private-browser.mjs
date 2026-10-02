/** Local-only browser checks. Google POSTs are intercepted; no real account/data is used. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { publicEntryHash } from '../core/publicEntry.ts';
import { GOOGLE_RECEPTION_BUILD } from '../core/googleConnection.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TOS_TEST_BASE || 'http://127.0.0.1:4421';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw new Error('This test must run against a local preview.');
const endpoint='https://script.google.com/macros/s/TOS_BROWSER_SIMULATION/exec';
const browser=await chromium.launch({headless:true,channel:process.env.TOS_BROWSER_CHANNEL||'chrome'});
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
try {
  for(const mobile of [false,true]) {
    const eventId=mobile?'browser-mobile':'browser-desktop';
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,permissions:['clipboard-read','clipboard-write']});
    const network=[],errors=[],posts=[];
    let settings,lastConnectionRequest,connectionPosts=0;
    const makeCode=(done)=>{
      const policy=JSON.stringify({title:settings.tournamentName,deadline:settings.deadline,music:settings.music,grade:settings.grade,age:settings.age,comment:settings.comment});
      const payload=JSON.stringify({protocol:2,build:GOOGLE_RECEPTION_BUILD,checkedVia:'web-app',challenge:lastConnectionRequest.nonce,eventId,owner:settings.expectedOwner,endpoint,policy,sheetPrivate:true,folderPrivate:true,testComplete:done,accepting:done,entryKey:'e'.repeat(64),testKey:'t'.repeat(64),issuedAt:Date.now()});
      return 'TOS2.'+JSON.stringify({payload,signature:createHmac('sha256',settings.setupKey).update(payload).digest('hex')});
    };
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    await context.route('**/*',async route=>{
      const request=route.request();network.push({url:request.url(),method:request.method(),body:request.postData()});
      if(request.url().startsWith(base+'/'))return route.continue();
      if(request.url()===endpoint&&request.method()==='POST') {
        const fields=new URLSearchParams(request.postData()||'');
        if(fields.get('action')==='verifyConnection'){
          connectionPosts++;lastConnectionRequest=JSON.parse(fields.get('payload'));
          check(fields.get('signature')===createHmac('sha256',settings.setupKey).update(fields.get('payload')).digest('hex'),'Connection request authenticates this organizer');
          check(!fields.has('setupKey')&&!fields.has('contactEmail')&&!fields.has('photoDataUrl'),'Connection POST does not contain the setup secret or applicant data');
          const safe=makeCode(false).replaceAll('&','&amp;').replaceAll('<','&lt;');
          return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>Google受付の接続を確認できました</h1><textarea aria-label="Googleの接続確認コード" readonly>'+safe+'</textarea>'});
        }
        posts.push(fields);
        return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>申し込みが完了しました</h1><p>TEST-RECEIPT</p>'});
      }
      return route.abort();
    });
    const page=await context.newPage();
    page.on('console',entry=>{if(entry.type()==='error')console.log('Browser console:',entry.text().slice(0,500));});
    await page.goto(base+'/private/google-setup/?'+new URLSearchParams({event:eventId,title:'架空テスト大会',date:'2099-12-20',venue:'架空会場'}));
    await page.getByLabel('主催者本人のGoogleメールアドレス',{exact:true}).fill('organizer@example.com');
    await page.getByLabel('申込締切',{exact:true}).fill('2099-11-30');
    await page.getByLabel('主催者本人のGoogleになっています',{exact:true}).check();
    await page.getByRole('button',{name:'確認できた → プログラムをコピー',exact:true}).click();
    const program=await page.evaluate(()=>navigator.clipboard.readText());
    check(program.includes('"expectedOwner":"organizer@example.com"'),'Program uses the organizer, not Jin');
    settings=JSON.parse(program.match(/^const SETTINGS = (.*);$/m)[1]);
    await page.reload();
    check(await page.getByRole('heading',{name:'Googleの白い画面へ貼る'}).isVisible(),'Wizard survives reload');
    await page.getByRole('button',{name:'貼って保存できた →',exact:true}).click();
    await page.getByRole('button',{name:'「実行完了」が出た →',exact:true}).click();
    await page.getByRole('button',{name:'URLが出た →',exact:true}).click();
    await page.getByLabel('Googleの受付URL',{exact:true}).fill(endpoint.replace('/exec','/dev'));
    check(await page.getByRole('button',{name:'Googleの接続を確かめる',exact:true}).isDisabled(),'Development URL is rejected before any Google request');
    await page.getByLabel('Googleの受付URL',{exact:true}).fill(endpoint);
    await page.getByRole('button',{name:'Googleの接続を確かめる',exact:true}).waitFor();
    await page.getByRole('button',{name:'Googleの接続を確かめる',exact:true}).click();
    const verificationPopup=page;
    await verificationPopup.getByRole('heading',{name:'Google受付の接続を確認できました',exact:true}).waitFor();
    const connectionCode=await verificationPopup.getByLabel('Googleの接続確認コード',{exact:true}).inputValue();
    await page.goBack();
    check(connectionPosts===1,'Native form opens exactly one verification page without CORS or an iframe');
    await page.getByLabel('Googleの接続確認コード').fill(connectionCode);
    await page.getByRole('button',{name:'この大会の保存先を確認する',exact:true}).click();
    check(await page.getByRole('link',{name:'テスト申込画面を開く',exact:true}).isVisible(),'Verified test link is shown');
    check(await page.getByRole('button',{name:'完成：選手へ渡すURLをコピー',exact:true}).isDisabled(),'Sharing is blocked before the test');
    await page.getByLabel('主催者名',{exact:true}).fill('架空主催者');
    await page.getByLabel('問い合わせ先',{exact:true}).fill('テスト連絡先');
    await page.getByLabel('Googleの接続確認コード').fill(makeCode(true).replace('TOS_BROWSER_SIMULATION','WRONG_DESTINATION'));
    await page.getByRole('button',{name:'この大会の保存先を確認する',exact:true}).click();
    check(await page.getByRole('button',{name:'完成：選手へ渡すURLをコピー',exact:true}).isDisabled(),'Tampered connection cannot be shared');
    await page.getByLabel('Googleの接続確認コード').fill(makeCode(true));
    await page.getByRole('button',{name:'この大会の保存先を確認する',exact:true}).click();
    await page.getByRole('button',{name:'完成：選手へ渡すURLをコピー',exact:true}).click();
    const link=await page.evaluate(()=>navigator.clipboard.readText());
    check(link.startsWith(base+'/apply/#'),'Public configuration is carried in the fragment');
    await page.goto(link);
    check(await page.getByRole('heading',{name:'架空テスト大会',exact:true}).isVisible(),'Tournament metadata is correct');
    check(await page.getByLabel('入場曲URL 必須',{exact:true}).count()===0,'Music is off for this organizer');
    for(const [label,value]of [['所属ジム 必須','架空ジム'],['選手名・リングネーム 必須','架空選手'],['身長（cm）必須','170'],['希望体重（kg）必須','65'],['戦績・競技歴 必須','初試合'],['連絡先のお名前 必須','架空連絡先'],['電話番号 必須','09000000000'],['メールアドレス 必須','test@example.com']])await page.getByLabel(label,{exact:true}).fill(value);
    const jpeg=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#2563eb';ctx.fillRect(0,0,120,160);return canvas.toDataURL('image/jpeg').split(',')[1];}),'base64');
    await page.locator('input[type=file]').setInputFiles({name:'test.jpg',mimeType:'image/jpeg',buffer:jpeg});
    await page.getByAltText('選んだ写真').waitFor();
    check(await page.getByAltText('選んだ写真').isVisible(),'Photo is decoded and previewed');
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'入力内容を確認する →',exact:true}).click();
    check(posts.length===0,'Review alone never submits');
    await page.getByRole('button',{name:'戻って直す（送信しません）',exact:true}).click();
    check(posts.length===0,'Going back from review never submits');
    await page.getByRole('button',{name:'入力内容を確認する →',exact:true}).click();
    await page.getByRole('button',{name:'この内容で送信する',exact:true}).click();
    try {await page.getByRole('heading',{name:'申し込みが完了しました',exact:true}).waitFor({timeout:10000});}
    catch(error){console.log('POST diagnostic',JSON.stringify({url:page.url(),posts:posts.length,errors,status:await page.getByRole('status').allTextContents(),form:await page.locator('form').evaluateAll(forms=>forms.map(form=>({action:form.action,target:form.target,method:form.method})))}));throw error;}
    check(posts.length===1,'Exactly one simulated Google POST');
    check(posts[0].get('eventId')===eventId&&posts[0].get('mode')==='live'&&posts[0].get('photoDataUrl').startsWith('data:image/jpeg;base64,'),'Submission carries event, mode and photo');
    check(!network.filter(r=>r.url.startsWith(base+'/')).some(r=>r.method==='POST'||r.body?.includes('test@example.com')),'No applicant payload goes to Cloudflare');
    await page.goto(base+'/apply/'+publicEntryHash({endpoint,eventId,title:'旧設定',organizer:'',date:'',venue:'',venueUrl:'',deadline:'',contact:'',music:false,grade:'optional',age:'optional',comment:'optional'}));
    check(await page.getByRole('button',{name:'入力内容を確認する →',exact:true}).isDisabled(),'Legacy links fail closed');
    await page.goto(base+'/private/?event='+eventId);
    const csv='管理番号,ジム名,選手名,学年,年齢,身長,体重,戦績・競技歴,試合への意気込み,入場曲URL（Apple Music推奨）\nF01,架空赤ジム,架空赤選手,小6,12,150,60,初試合,がんばる,https://music.apple.com/jp/song/1\nF02,架空青ジム,架空青選手,中1,13,155,61.5,1戦,全力,https://youtu.be/test';
    const zip=zipSync({'players.csv':strToU8(csv),'photos/F01.jpg':jpeg,'photos/F02.jpg':jpeg});
    await page.locator('input[accept^=".zip"]').setInputFiles({name:'test.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
    await page.getByRole('status').filter({hasText:'2人と写真2枚'}).waitFor();
    check(await page.locator('article img').count()===2,'ZIP restores both matched photos');
    for(let i=0;i<2;i++){
      await page.getByRole('button',{name:'＋ 試合を追加',exact:true}).click();
      const bout=page.locator('article').filter({hasText:'第'+(i+1)+'試合'});
      await bout.getByLabel('赤コーナーの選手',{exact:true}).selectOption(i?'F02':'F01');
      await bout.getByLabel('青コーナーの選手',{exact:true}).selectOption(i?'F01':'F02');
    }
    const first=page.locator('article').filter({hasText:'第1試合'});
    await first.getByRole('button',{name:'赤青を入替',exact:true}).click();
    check(await first.getByLabel('赤コーナーの選手',{exact:true}).inputValue()==='F02','Corner swap updates red');
    await first.getByRole('button',{name:'赤青を入替',exact:true}).click();
    await page.locator('article').filter({hasText:'第2試合'}).getByRole('button',{name:'↑ 上へ',exact:true}).click();
    check(await first.getByLabel('赤コーナーの選手',{exact:true}).inputValue()==='F02','Reordering preserves fighter identity');
    await page.locator('article').filter({hasText:'第2試合'}).getByRole('button',{name:'↑ 上へ',exact:true}).click();
    await page.getByLabel('大会名',{exact:true}).fill('ローカル架空大会');
    await page.getByRole('button',{name:'このパソコンの中だけに保存',exact:true}).click();
    await page.getByRole('status').filter({hasText:'保存しました'}).waitFor();
    await page.getByPlaceholder('10文字以上のパスワード').fill('fictional-test-password');
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'暗号化して保存',exact:true}).click();
    const encrypted=await readFile(await(await downloadPromise).path());
    check(!encrypted.toString().includes('架空赤選手'),'Backup contains ciphertext, not readable roster');
    await page.getByLabel('大会名',{exact:true}).fill('未保存の変更');
    await page.getByPlaceholder('10文字以上のパスワード').fill('wrong-password');
    await page.locator('input[accept=".enc"]').setInputFiles({name:'test.enc',mimeType:'application/octet-stream',buffer:encrypted});
    await page.getByRole('status').filter({hasText:'復元できません'}).waitFor();
    check(await page.getByLabel('大会名',{exact:true}).inputValue()==='未保存の変更','Wrong password does not overwrite');
    await page.getByPlaceholder('10文字以上のパスワード').fill('fictional-test-password');
    await page.locator('input[accept=".enc"]').setInputFiles({name:'test.enc',mimeType:'application/octet-stream',buffer:encrypted});
    await page.getByRole('status').filter({hasText:'復元しました'}).waitFor();
    check(await page.getByLabel('大会名',{exact:true}).inputValue()==='ローカル架空大会','Encrypted backup restores correctly');
    const live=await context.newPage();
    await live.goto(base+'/private/live/?event='+eventId);
    await live.getByText('61.5kg契約',{exact:true}).waitFor();
    check(await live.locator('article img').count()===2,'Both corner photos are shown');
    check(await live.getByRole('button',{name:'← 前の試合',exact:true}).isDisabled(),'Cannot go before bout one');
    await live.evaluate(()=>{window.__tosTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new Error('SIMULATED_DISK_FULL');return window.__tosTransaction.apply(this,args);};});
    await live.getByRole('button',{name:'次の試合 →',exact:true}).click();
    await live.getByRole('alert').filter({hasText:'試合は進めていません'}).waitFor();
    check((await live.locator('header').innerText()).includes('第 1 試合'),'Failed storage does not advance the bout');
    await live.evaluate(()=>{IDBDatabase.prototype.transaction=window.__tosTransaction;});
    await live.getByRole('button',{name:'次の試合 →',exact:true}).click();
    await live.waitForFunction(()=>document.querySelector('header')?.textContent.includes('第 2 試合'));
    check(await live.getByRole('button',{name:'次の試合 →',exact:true}).isDisabled(),'Cannot go past the last bout');
    await live.getByRole('button',{name:'← 前の試合',exact:true}).click();
    await live.waitForFunction(()=>document.querySelector('header')?.textContent.includes('第 1 試合'));
    check(!errors.length,'No browser runtime exceptions: '+errors.join(', '));
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Setup/admin has no horizontal overflow');
    await live.screenshot({path:'/tmp/tournament-os-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    console.log((mobile?'Mobile-size Chrome':'Desktop Chrome')+': PASS');
    await context.close();
  }
  console.log('Browser checks passed: '+checks+'. Google was simulated, not live.');
} finally {await browser.close();}
