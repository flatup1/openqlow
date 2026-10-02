/** Tournament OS Google受付 v2。主催者本人のGoogleで実行してください。 */
const SETTINGS = { eventId: 'my-tournament', tournamentName: '大会名をここに入力', expectedOwner: '主催者のGoogleメールアドレス', setupKey: '設定画面が自動入力', deadline: '', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const RECEPTION_BUILD = '2.20261002.4';
function policy_(){return JSON.stringify({title:SETTINGS.tournamentName,deadline:SETTINGS.deadline,music:SETTINGS.music,grade:SETTINGS.grade,age:SETTINGS.age,comment:SETTINGS.comment});}
const PRIVATE_HEADERS = ['受付番号','申込日時','大会ID','所属ジム','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL','連絡先氏名','連絡先電話番号','連絡先メールアドレス','同意','リクエストID'];
const OS_HEADERS = ['管理番号','ジム名','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL'];
function assertOwner_() {
  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!owner || owner !== SETTINGS.expectedOwner.trim().toLowerCase()) throw entryError_('owner','主催者本人のGoogleへ切り替えてください。',false);
  return owner;
}
function entryError_(code,message,retryable) { const error=new Error(message); error.code=code; error.retryable=retryable; return error; }
function withLock_(callback) { const lock=LockService.getScriptLock(); if(!lock.tryLock(25000))throw entryError_('busy','受付が混み合っています。',true);try{return callback();}finally{lock.releaseLock();} }
function setupTournament() {
  const owner=assertOwner_();
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(SETTINGS.eventId)||!/^[\w-]{32,100}$/.test(SETTINGS.setupKey)||!/^\d{4}-\d{2}-\d{2}$/.test(SETTINGS.deadline))throw new Error('設定画面で大会名・締切・主催者Googleを入力して、プログラムをコピーし直してください。');
  return withLock_(function(){
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('eventId')&&(props.getProperty('eventId')!==SETTINGS.eventId||props.getProperty('ownerEmail')!==owner))throw new Error('別の大会が入っています。新しいGoogleプログラムを作ってください。');
    props.setProperties({ownerEmail:owner,eventId:SETTINGS.eventId});
    if(!props.getProperty('entryKey'))props.setProperties({entryKey:Utilities.getUuid()+Utilities.getUuid(),testKey:Utilities.getUuid()+Utilities.getUuid(),accepting:'false'});
    let book;
    if(props.getProperty('spreadsheetId'))book=SpreadsheetApp.openById(props.getProperty('spreadsheetId'));
    else{book=SpreadsheetApp.create('Tournament OS 申込原本 - '+SETTINGS.tournamentName);props.setProperty('spreadsheetId',book.getId());book.getSheets()[0].setName('申込原本（個人情報あり）');}
    [['申込原本（個人情報あり）',PRIVATE_HEADERS],['OS取込用（連絡先なし）',OS_HEADERS],['テスト申込',PRIVATE_HEADERS],['テストOS取込用',OS_HEADERS]].forEach(function(pair){
      const sheet=book.getSheetByName(pair[0])||book.insertSheet(pair[0]);
      if(sheet.getLastRow()===0)sheet.getRange(1,1,1,pair[1].length).setValues([pair[1]]).setFontWeight('bold');
      else if(JSON.stringify(sheet.getRange(1,1,1,pair[1].length).getDisplayValues()[0])!==JSON.stringify(pair[1]))throw new Error('申込表の見出しが変わっています。元のデータは消さず、見出しを確認してください。');
    });
    if(!props.getProperty('photoFolderId')){const folder=DriveApp.createFolder('Tournament OS 顔写真 - '+SETTINGS.tournamentName);props.setProperty('photoFolderId',folder.getId());}
    if(!props.getProperty('testFolderId')){const folder=DriveApp.getFolderById(props.getProperty('photoFolderId')).createFolder('テスト写真');props.setProperty('testFolderId',folder.getId());}
    checkResources_();
    Logger.log('申込原本: '+book.getUrl());
    Logger.log('写真フォルダ: '+DriveApp.getFolderById(props.getProperty('photoFolderId')).getUrl());
    Logger.log('準備できました。次はウェブアプリとしてデプロイしてください。2回実行しても同じ申込表を使います。');
  });
}
function isPrivateOwned_(resource,owner){return resource.getOwner().getEmail().toLowerCase()===owner&&resource.getSharingAccess()===DriveApp.Access.PRIVATE&&resource.getEditors().filter(function(user){return user.getEmail().toLowerCase()!==owner;}).length===0&&resource.getViewers().length===0&&!resource.isTrashed();}
function checkResources_(){
  const props=PropertiesService.getScriptProperties(),owner=assertOwner_();
  if(props.getProperty('ownerEmail')!==owner||props.getProperty('eventId')!==SETTINGS.eventId)throw entryError_('setup','この大会の初期設定を確認してください。',false);
  const book=SpreadsheetApp.openById(props.getProperty('spreadsheetId')),sheetFile=DriveApp.getFileById(book.getId()),folder=DriveApp.getFolderById(props.getProperty('photoFolderId'));
  if(!isPrivateOwned_(sheetFile,owner)||!isPrivateOwned_(folder,owner)||!isPrivateOwned_(DriveApp.getFolderById(props.getProperty('testFolderId')),owner))throw entryError_('sharing','申込表と写真フォルダの共有を「制限付き・主催者本人だけ」にしてください。',false);
  [['申込原本（個人情報あり）',PRIVATE_HEADERS],['OS取込用（連絡先なし）',OS_HEADERS],['テスト申込',PRIVATE_HEADERS],['テストOS取込用',OS_HEADERS]].forEach(function(pair){const sheet=book.getSheetByName(pair[0]);if(!sheet||JSON.stringify(sheet.getRange(1,1,1,pair[1].length).getDisplayValues()[0])!==JSON.stringify(pair[1]))throw entryError_('headers','申込表の見出しが変わっています。データを消さず、主催者が確認してください。',false);});
  return{book:book,folder:folder};
}
function checkTournament(){
  return withLock_(function(){
    const endpoint=ScriptApp.getService().getUrl();
    if(!validWebUrl_(endpoint))throw new Error('コードは書き直さなくて大丈夫です。大会設定画面へ戻り、ウェブアプリURLを貼って「Googleの接続を確かめる」を押してください。');
    const code=connectionCode_(endpoint,'');
    Logger.log('接続確認コード: '+code);
    return code;
  });
}
function validWebUrl_(value){return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(value||'');}
function connectionCode_(endpoint,challenge){
  const resources=checkResources_(),props=PropertiesService.getScriptProperties();
  const payload=JSON.stringify({protocol:2,build:RECEPTION_BUILD,checkedVia:challenge?'web-app':'editor',challenge:challenge,eventId:SETTINGS.eventId,owner:assertOwner_(),endpoint:endpoint,policy:policy_(),sheetPrivate:true,folderPrivate:true,testComplete:testComplete_(resources.book),accepting:props.getProperty('accepting')==='true',entryKey:props.getProperty('entryKey'),testKey:props.getProperty('testKey'),issuedAt:Date.now()});
  return 'TOS2.'+JSON.stringify({payload:payload,signature:hex_(Utilities.computeHmacSha256Signature(payload,SETTINGS.setupKey,Utilities.Charset.UTF_8))});
}
/** 公開済みウェブアプリを直接照合。名簿・写真・共有・受付状態には書き込まない。 */
function verifyConnection_(p){
  if(p.protocol!=='2'||typeof p.payload!=='string'||p.payload.length>1000||!/^[a-f0-9]{64}$/.test(p.signature||''))throw entryError_('connection','設定画面から接続を確認し直してください。',false);
  const expected=hex_(Utilities.computeHmacSha256Signature(p.payload,SETTINGS.setupKey,Utilities.Charset.UTF_8));let mismatch=0;
  for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^p.signature.charCodeAt(i);
  if(mismatch)throw entryError_('connection','この会長・大会のGoogle受付ではありません。URLを確認してください。',false);
  let request;try{request=JSON.parse(p.payload);}catch(_){throw entryError_('connection','設定画面から確認し直してください。',false);}
  const endpoint=ScriptApp.getService().getUrl(),now=Date.now();
  if(request.eventId!==SETTINGS.eventId||!validWebUrl_(request.endpoint)||request.endpoint!==endpoint||!validWebUrl_(endpoint)||typeof request.nonce!=='string'||!/^[\w-]{32,100}$/.test(request.nonce)||typeof request.issuedAt!=='number'||!Number.isFinite(request.issuedAt)||request.issuedAt>now+30000||now-request.issuedAt>300000)throw entryError_('connection','URLか確認時間が違います。設定画面で「Googleの接続を確かめる」を押し直してください。',false);
  return withLock_(function(){return connectionCode_(endpoint,request.nonce);});
}
function connectionPage_(code,message){
  return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{font-family:sans-serif;background:#eef2ff;color:#0f172a;padding:24px}main{max-width:640px;margin:auto;background:white;border-radius:24px;padding:24px}p{line-height:1.8}textarea{box-sizing:border-box;width:100%;height:160px;padding:16px;font-size:14px}</style></head><body><main><h1>'+(code?'Google受付の接続を確認できました':'まだ接続できません')+'</h1><p>'+(code?'この確認では申込表や写真は変更していません。下の白い欄の文字をすべてコピーし、元の大会設定画面の「Googleの接続確認コード」へ貼ってください。':escape_(message))+'</p>'+(code?'<textarea aria-label="Googleの接続確認コード" readonly onclick="this.select()">'+escape_(code)+'</textarea><p>白い欄を押すと全部選ばれます。コピーはMacなら ⌘ C、Windowsなら Ctrl C です。このコードを他人やSNSへ送らないでください。</p>':'<p>Googleプログラムを貼り替えた場合は、保存に加えて「デプロイを管理」で「新バージョン」へ更新します。データを消したり、申込表の共有を広げたりする必要はありません。</p>')+'</main></body></html>').setTitle(code?'Google接続の確認':'Google接続を確認してください').addMetaTag('viewport','width=device-width,initial-scale=1');
}
function testComplete_(book){
  const props=PropertiesService.getScriptProperties(),requestId=props.getProperty('lastTestRequest');
  if(!requestId||props.getProperty('lastTestPolicy')!==policy_()||props.getProperty('lastTestBuild')!==RECEPTION_BUILD)return false;
  const sheet=book.getSheetByName('テスト申込'),os=book.getSheetByName('テストOS取込用'),row=findRow_(sheet,18,requestId);
  if(!row)return false;
  const values=sheet.getRange(row,1,1,18).getDisplayValues()[0],osRow=findRow_(os,1,values[0]);
  if(!osRow||JSON.stringify(os.getRange(osRow,1,1,11).getDisplayValues()[0])!==JSON.stringify([values[0]].concat(values.slice(3,13))))return false;
  const photoId=String(values[12]).match(/\/d\/([\w-]+)/);if(!photoId)return false;
  const file=DriveApp.getFileById(photoId[1]),parents=file.getParents();let inside=false;
  while(parents.hasNext())if(parents.next().getId()===props.getProperty('testFolderId'))inside=true;
  return inside&&file.getSize()>0&&isPrivateOwned_(file,props.getProperty('ownerEmail'));
}
function openEntries(){
  return withLock_(function(){const resources=checkResources_();if(!testComplete_(resources.book))throw new Error('先にテスト申込1件と写真の保存を確認してください。');if(Date.now()>deadlineTime_())throw new Error('締切を過ぎています。設定画面へ戻ってください。');PropertiesService.getScriptProperties().setProperty('accepting','true');Logger.log('受付を開始しました。大会設定画面で「Googleの接続を確かめる」を押し、新しい確認コードを貼ってください。');return true;});
}
function closeEntries(){assertOwner_();PropertiesService.getScriptProperties().setProperty('accepting','false');Logger.log('受付を停止しました。申込済みデータは残っています。');}
function deadlineTime_(){const time=Date.parse(SETTINGS.deadline+'T23:59:59+09:00');if(!Number.isFinite(time))throw entryError_('deadline','主催者が締切を設定する必要があります。',false);return time;}
function doGet(){return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>大会受付の保存先です。主催者から届いたエントリー画面で申し込んでください。</p>');}
function doPost(e){
  const p=(e&&e.parameter)||{};
  if(p.action==='verifyConnection'){try{return connectionPage_(verifyConnection_(p),'');}catch(error){return connectionPage_('',error.code?error.message:'Googleの受付プログラム・主催者アカウント・権限を確認してください。');}}
  try{return resultPage_(saveEntry_(p),'',null,p);}
  catch(error){console.error('Tournament OS受付: '+(error.code||'storage'));return resultPage_('',error.code?error.message:'Googleへの保存を最後まで確認できませんでした。',error,p);}
}
function text_(p,key,max,required){const text=String(p[key]==null?'':p[key]).trim();if((required&&!text)||text.length>max)throw entryError_('input','入力内容を確認して、エントリー画面へ戻ってください。',false);return text;}
function validateEntry_(p){
  if(p.protocol!=='2'||p.eventId!==SETTINGS.eventId||(p.mode!=='test'&&p.mode!=='live'))throw entryError_('event','大会の受付URLが違います。主催者から新しいURLをもらってください。',false);
  const props=PropertiesService.getScriptProperties(),expected=props.getProperty(p.mode==='test'?'testKey':'entryKey');
  if(!expected||p.entryKey!==expected)throw entryError_('key','この大会の受付URLではありません。',false);
  if(p.website)throw entryError_('spam','送信を受け付けられませんでした。',false);
  if(p.consent!=='yes')throw entryError_('consent','規約と個人情報の取扱いへの同意が必要です。',false);
  const request=text_(p,'requestId',100,true);if(!/^[\w-]{32,100}$/.test(request))throw entryError_('input','申込を確認する番号が正しくありません。',false);
  const limits={gym:120,name:80,height:10,weight:10,record:300,contactName:100,contactPhone:30,contactEmail:200,photoDataUrl:1800100};
  Object.keys(limits).forEach(function(key){text_(p,key,limits[key],true);});
  const height=Number(p.height),weight=Number(p.weight);
  if(!Number.isFinite(height)||height<50||height>250||!Number.isFinite(weight)||weight<10||weight>250||!/^0?[0-9][0-9 -]{8,14}$/.test(p.contactPhone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail))throw entryError_('input','身長・体重・電話番号・メールアドレスを確認してください。',false);
  if(p.age&&(!/^\d{1,3}$/.test(p.age)||Number(p.age)<1||Number(p.age)>120))throw entryError_('input','年齢を確認してください。',false);
  ['grade','age','comment'].forEach(function(key){text_(p,key,key==='comment'?500:30,SETTINGS[key]==='required');});
  if(SETTINGS.music&&!/^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//.test(text_(p,'musicUrl',500,true)))throw entryError_('input','入場曲はApple MusicかYouTubeのURLを入力してください。',false);
  return request;
}
function saveEntry_(p){
  assertOwner_();const requestId=validateEntry_(p);
  return withLock_(function(){
    const props=PropertiesService.getScriptProperties(),resources=checkResources_(),isTest=p.mode==='test';
    const sheet=resources.book.getSheetByName(isTest?'テスト申込':'申込原本（個人情報あり）'),os=resources.book.getSheetByName(isTest?'テストOS取込用':'OS取込用（連絡先なし）');
    if(!sheet||!os)throw entryError_('setup','申込表が見つかりません。主催者へご連絡ください。',false);
    const existing=findRow_(sheet,18,requestId);let values;
    if(existing){
      values=sheet.getRange(existing,1,1,18).getDisplayValues()[0];
      const expected=[String(p.gym).trim(),String(p.name).trim(),SETTINGS.grade==='off'?'':String(p.grade||'').trim(),SETTINGS.age==='off'?'':String(p.age||'').trim(),String(Number(p.height)),String(Number(p.weight)),String(p.record).trim(),SETTINGS.comment==='off'?'':String(p.comment||'').trim(),SETTINGS.music?String(p.musicUrl||'').trim():''];
      if(JSON.stringify(values.slice(3,12))!==JSON.stringify(expected)||JSON.stringify(values.slice(13,17))!==JSON.stringify([String(p.contactName).trim(),String(p.contactPhone).trim(),String(p.contactEmail).trim(),'yes']))throw entryError_('changed','送信後に入力内容が変わっています。新しく申し込み直さず、主催者へ訂正を依頼してください。',false);
      const photoUrl=savePhoto_(props.getProperty(isTest?'testFolderId':'photoFolderId'),values[0],p.photoDataUrl,true);
      if(photoUrl!==values[12])throw entryError_('photo','保存済みの写真と申込表が一致しません。主催者へご連絡ください。',false);
    }
    else{
      if(!isTest&&(props.getProperty('accepting')!=='true'||Date.now()>deadlineTime_()))throw entryError_('closed','現在、申し込みを受け付けていません。主催者へご連絡ください。',false);
      if(sheet.getLastRow()>3000)throw entryError_('capacity','受付件数が上限に達しました。主催者へご連絡ください。',false);
      const minute=String(Math.floor(Date.now()/60000)),count=props.getProperty('rateMinute')===minute?Number(props.getProperty('rateCount')||0):0;
      if(count>=30)throw entryError_('busy','受付が混み合っています。少し待ってください。',true);
      props.setProperties({rateMinute:minute,rateCount:String(count+1)});
      const receiptNo=receipt_(requestId,isTest),photoUrl=savePhoto_(props.getProperty(isTest?'testFolderId':'photoFolderId'),receiptNo,p.photoDataUrl);
      const common=[clean_(p.gym,120),clean_(p.name,80),SETTINGS.grade==='off'?'':clean_(p.grade,30),SETTINGS.age==='off'?'':clean_(p.age,3),String(Number(p.height)),String(Number(p.weight)),clean_(p.record,300),SETTINGS.comment==='off'?'':clean_(p.comment,500),SETTINGS.music?clean_(p.musicUrl,500):'',photoUrl];
      values=[receiptNo,new Date(),SETTINGS.eventId].concat(common).concat([clean_(p.contactName,100),clean_(p.contactPhone,30),clean_(p.contactEmail,200),'yes',requestId]);
      // Googleの自動変換で電話番号の先頭0や数字だけの選手名を失わない。
      const newRow=sheet.getLastRow()+1;
      sheet.getRange(newRow,3,1,16).setNumberFormat('@');
      sheet.getRange(newRow,1,1,18).setValues([values]);
      // 実際に書かれた電話番号が送った文字と違えば（先頭0が消えた等）、文字として書き直す。
      const phoneCell=sheet.getRange(newRow,15);
      if(phoneCell.getDisplayValue()!==String(values[14])){phoneCell.setNumberFormat('@').setValue(String(values[14]));}
      values=sheet.getRange(findRow_(sheet,18,requestId),1,1,18).getDisplayValues()[0];
    }
    const osValues=[values[0]].concat(values.slice(3,13)).map(function(value){return clean_(value,2000);}),osRow=findRow_(os,1,values[0]);
    os.getRange(osRow||os.getLastRow()+1,1,1,11).setNumberFormat('@');
    if(osRow)os.getRange(osRow,1,1,11).setValues([osValues]);else os.appendRow(osValues);
    SpreadsheetApp.flush();
    const savedRow=findRow_(os,1,values[0]);
    if(!savedRow||JSON.stringify(os.getRange(savedRow,1,1,11).getDisplayValues()[0])!==JSON.stringify([values[0]].concat(values.slice(3,13))))throw entryError_('storage','大会用の名簿の保存を確認できませんでした。',true);
    if(isTest){props.setProperty('lastTestPolicy',policy_());props.setProperty('lastTestBuild',RECEPTION_BUILD);props.setProperty('lastTestRequest',requestId);}
    return values[0];
  });
}
function findRow_(sheet,column,value){if(sheet.getLastRow()<2)return 0;const values=sheet.getRange(2,column,sheet.getLastRow()-1,1).getDisplayValues();for(let i=0;i<values.length;i++)if(values[i][0]===value)return i+2;return 0;}
function savePhoto_(folderId,receiptNo,dataUrl,requireExisting){
  const match=String(dataUrl).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if(!match||match[1].length>1800000)throw entryError_('photo','写真を選び直してください。',false);
  const bytes=Utilities.base64Decode(match[1]);
  if(bytes.length<4||(bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[bytes.length-2]&255)!==255||(bytes[bytes.length-1]&255)!==217)throw entryError_('photo','写真を読み取れませんでした。',false);
  const folder=DriveApp.getFolderById(folderId),files=folder.getFilesByName(receiptNo+'.jpg');
  if(files.hasNext()){
    const file=files.next();if(!isPrivateOwned_(file,assertOwner_())||!file.getSize())throw entryError_('photo','写真の保存先を主催者が確認する必要があります。',false);
    if(hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,file.getBlob().getBytes()))!==hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)))throw entryError_('changed','送信後に写真が変わっています。新しく申し込み直さず、主催者へ訂正を依頼してください。',false);
    return file.getUrl();
  }
  if(requireExisting)throw entryError_('photo','保存済みの写真が見つかりません。主催者へご連絡ください。',false);
  const file=folder.createFile(Utilities.newBlob(bytes,'image/jpeg',receiptNo+'.jpg'));
  if(!isPrivateOwned_(file,assertOwner_())||file.getSize()!==bytes.length)throw entryError_('photo','写真の保存を確認できませんでした。',true);
  return file.getUrl();
}
function receipt_(requestId,isTest){return(isTest?'TEST-':'')+SETTINGS.eventId.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)+'-'+hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,requestId)).slice(0,20).toUpperCase();}
function hex_(bytes){return bytes.map(function(b){return('0'+((b&255).toString(16))).slice(-2);}).join('');}
function clean_(value,max){const text=String(value==null?'':value).trim().slice(0,max);return/^[=+\-@]/.test(text)?"'"+text:text;}
function escape_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}
function resultPage_(receiptNo,message,error,p){
  const success=Boolean(receiptNo),retry=!success&&(!error||error.retryable!==false),title=success?'申し込みが完了しました':'保存結果の確認が必要です';
  const detail=success?(p.mode==='test'?'テスト受付番号：':'受付番号：')+receiptNo:message;let retryForm='';
  if(retry){const endpoint=ScriptApp.getService().getUrl();if(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint||'')){
    const fields=['protocol','eventId','entryKey','mode','requestId','gym','name','grade','age','height','weight','record','comment','musicUrl','contactName','contactPhone','contactEmail','consent','photoDataUrl'];
    retryForm='<p>新しく申し込み直さず、下のボタンを押してください。同じ申込番号で保存を確認・再開します。</p><form method="post" target="_top" action="'+escape_(endpoint)+'">'+fields.map(function(key){return'<input type="hidden" name="'+key+'" value="'+escape_(String(p[key]||'').slice(0,key==='photoDataUrl'?1800100:500))+'">';}).join('')+'<button>同じ申込を確認・再開する</button></form>';}}
  return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:32px 16px;background:#f1f5f9;color:#0f172a;text-align:center}.box{max-width:540px;margin:auto;border:2px solid #bbf7d0;border-radius:24px;padding:28px;background:white}h1{font-size:26px}b{display:block;margin:20px 0;font-size:20px;overflow-wrap:anywhere}button{font-size:18px;font-weight:bold;padding:18px;border:0;border-radius:14px;background:#1d4ed8;color:white}p{line-height:1.8}</style></head><body><main class="box"><h1>'+title+'</h1><b>'+escape_(detail)+'</b>'+retryForm+'<p>'+(success?'受付番号をスクリーンショットで保存してください。この画面は閉じて大丈夫です。':'受付番号が出るまで完了ではありません。解決しない場合は主催者へご連絡ください。')+'</p></main></body></html>').setTitle(title).addMetaTag('viewport','width=device-width,initial-scale=1');
}
/** 主催者がOS用名簿と写真を自分のDriveへZIP保存する。連絡先は含めない。 */
function exportTournament(){
  return withLock_(function(){
    const resources=checkResources_(),sheet=resources.book.getSheetByName('OS取込用（連絡先なし）'),rows=sheet.getDataRange().getDisplayValues();
    if(rows.length<2)throw new Error('本番の申し込みはまだありません。テスト申込はこのファイルに混ぜません。');
    return exportRows_(rows,resources.folder,'Tournament_OS_');
  });
}
/** 最後に保存確認できたテスト1件だけを、テスト写真フォルダへ書き出す。 */
function exportTestTournament(){
  return withLock_(function(){
    const resources=checkResources_(),props=PropertiesService.getScriptProperties();
    if(!testComplete_(resources.book))throw new Error('先にテスト申込1件と写真の保存を確認してください。');
    const original=resources.book.getSheetByName('テスト申込'),sourceRow=findRow_(original,18,props.getProperty('lastTestRequest'));
    const receipt=original.getRange(sourceRow,1).getDisplayValues()[0][0],sheet=resources.book.getSheetByName('テストOS取込用'),row=findRow_(sheet,1,receipt);
    const rows=[sheet.getRange(1,1,1,11).getDisplayValues()[0],sheet.getRange(row,1,1,11).getDisplayValues()[0]];
    return exportRows_(rows,DriveApp.getFolderById(props.getProperty('testFolderId')),'TEST_Tournament_OS_');
  });
}
function exportRows_(rows,folder,prefix){
    const csv='\uFEFF'+rows.map(function(row){return row.slice(0,10).map(function(cell){return'"'+clean_(cell,2000).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    const files=[Utilities.newBlob(csv,'text/csv','players.csv')];
    let totalBytes=csv.length*3;
    rows.slice(1).forEach(function(row){const id=String(row[10]).match(/\/d\/([\w-]+)/);if(!id)throw new Error('写真が見つかりません。受付番号 '+row[0]);const file=DriveApp.getFileById(id[1]);if(file.isTrashed()||!isPrivateOwned_(file,assertOwner_()))throw new Error('写真の保存・共有を確認してください。');totalBytes+=file.getSize();if(totalBytes>80*1024*1024)throw new Error('写真の合計が80MBを超えています。大会名簿を分けて保存する必要があります。');files.push(file.getBlob().setName('photos/'+row[0]+'.jpg'));});
    const zip=folder.createFile(Utilities.zip(files,prefix+SETTINGS.eventId+'.zip'));
    Logger.log('OSへ取り込むファイル: '+zip.getUrl());Logger.log('リンクを開き、ダウンロードしたZIPを大会準備画面で選んでください。');return zip.getUrl();
}
