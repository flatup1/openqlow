/** Tournament OS Google受付 v3。このシートをコピーして使います。コードを貼る必要はありません。 */
const RECEPTION_BUILD = '3.20261004.2';
/** 会長が書くのは「設定」タブの、この表のB列だけ。画面（OS）側では、同じ内容を二重に入力しません。 */
const SETTING_ROWS = [
  ['大会名', '', '例：第1回 ○○ジム大会'],
  ['開催日', '', '例：2027-10-03　（半角の数字）'],
  ['会場', '', '例：成田市体育館'],
  ['会場の地図URL', '', '任意。Googleマップの「共有」で出るURL'],
  ['主催者名', '', '例：○○ジム'],
  ['問い合わせ先', '', '選手に見えます。電話やLINEなど'],
  ['申込締切', '', '例：2027-09-20　（開催日と同じか、それより前）'],
  ['入場曲', 'なし', 'あり／なし'],
  ['学年', '任意', '必須／任意／なし'],
  ['年齢', '任意', '必須／任意／なし'],
  ['意気込み', '任意', '必須／任意／なし']
];
const SELFTEST_JPEG = '/9j/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALIAP//Z';
let SETTINGS_CACHE_ = null;
function mode_(text) { const v = String(text || '').trim(); return v === '必須' ? 'required' : v === 'なし' ? 'off' : 'optional'; }
function dateIso_(text) {
  const t = String(text || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); }).trim();
  let y, m, d;
  const parts = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/);
  if (parts) { y = parts[1]; m = parts[2]; d = parts[3]; }
  else { const digits = t.replace(/\D/g, ''); if (digits.length !== 8) return ''; y = digits.slice(0, 4); m = digits.slice(4, 6); d = digits.slice(6, 8); }
  const iso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2), parsed = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? '' : iso;
}
/** 設定タブの見た目を作る。onOpen（メニューが出るとき）と最初の設定で呼ぶ。すでにあれば何も変えない。 */
function ensureSettingsSheet_(book) {
  let sheet = book.getSheetByName('設定');
  if (sheet) return sheet;
  sheet = book.insertSheet('設定');
  sheet.getRange(1, 1, 1, 3).setValues([['項目', '値（ここに入れる）', '説明']]).setFontWeight('bold');
  sheet.getRange(2, 2, SETTING_ROWS.length, 1).setNumberFormat('@');
  sheet.getRange(2, 1, SETTING_ROWS.length, 3).setValues(SETTING_ROWS);
  return sheet;
}
/** 設定は「設定」タブが正本。コードには焼き込まない。大会IDは自動で決まる（会長は入れない）。 */
function S_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('spreadsheetId');
  if (!id) throw entryError_('setup', '「Tournament OS」メニューの「① 最初の設定」を押してください。', false);
  const sheet = SpreadsheetApp.openById(id).getSheetByName('設定');
  if (!sheet) throw entryError_('setup', '「設定」タブが見つかりません。「① 最初の設定」を押してください。', false);
  const rows = sheet.getRange(2, 1, SETTING_ROWS.length, 2).getDisplayValues(), v = {};
  rows.forEach(function (row) { v[String(row[0]).trim()] = String(row[1]).trim(); });
  SETTINGS_CACHE_ = { eventId: props.getProperty('eventId') || '', tournamentName: v['大会名'], date: dateIso_(v['開催日']), venue: v['会場'], venueUrl: v['会場の地図URL'], organizer: v['主催者名'], contact: v['問い合わせ先'], deadline: dateIso_(v['申込締切']), music: v['入場曲'] === 'あり', grade: mode_(v['学年']), age: mode_(v['年齢']), comment: mode_(v['意気込み']), raw: v };
  return SETTINGS_CACHE_;
}
/** 設定の間違いを、直す場所つきで返す。空なら問題なし。 */
function settingsProblems_(s) {
  const missing = [], bad = [], raw = s.raw || {};
  if (!s.tournamentName) missing.push('大会名');
  if (!raw['開催日']) missing.push('開催日'); else if (!s.date) bad.push('「開催日」は、2027-10-03 のように入れてください');
  if (!s.venue) missing.push('会場');
  if (!s.organizer) missing.push('主催者名');
  if (!s.contact) missing.push('問い合わせ先');
  if (!raw['申込締切']) missing.push('申込締切'); else if (!s.deadline) bad.push('「申込締切」は、2027-09-20 のように入れてください');
  if (s.date && s.deadline && s.deadline > s.date) bad.push('「申込締切」は、開催日と同じか、それより前にしてください');
  if (s.venueUrl && !/^https:\/\/(?:share\.google|maps\.app\.goo\.gl|www\.google\.com\/maps)(?:\/|$)/.test(s.venueUrl)) bad.push('「会場の地図URL」は、Googleマップの共有URLにするか、空にしてください');
  [['入場曲', ['あり', 'なし']], ['学年', ['必須', '任意', 'なし']], ['年齢', ['必須', '任意', 'なし']], ['意気込み', ['必須', '任意', 'なし']]].forEach(function (pair) { if (raw[pair[0]] && pair[1].indexOf(raw[pair[0]]) < 0) bad.push('「' + pair[0] + '」は、' + pair[1].join('／') + ' のどれかにしてください'); });
  const out = [];
  if (missing.length) out.push('「設定」タブの、次の欄を入れてください：' + missing.join('、'));
  return out.concat(bad);
}
const PRIVATE_HEADERS = ['受付番号','申込日時','大会ID','所属ジム','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL','連絡先氏名','連絡先電話番号','連絡先メールアドレス','同意','リクエストID'];
const OS_HEADERS = ['管理番号','ジム名','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL'];
function assertOwner_() {
  const props = PropertiesService.getScriptProperties(), owner = Session.getEffectiveUser().getEmail().toLowerCase(), saved = props.getProperty('ownerEmail');
  if (!owner || (saved && owner !== saved)) throw entryError_('owner', 'このシートを作った本人のGoogleで開き直してください。', false);
  return owner;
}
function entryError_(code,message,retryable) { const error=new Error(message); error.code=code; error.retryable=retryable; return error; }
function withLock_(callback) { const lock=LockService.getScriptLock(); if(!lock.tryLock(25000))throw entryError_('busy','受付が混み合っています。',true);try{return callback();}finally{lock.releaseLock();} }
/** ① 最初の設定。何度押しても同じ申込表・写真フォルダを使います。最後に、架空の1件で自動テストをします。 */
function setupTournament() {
  const owner = assertOwner_();
  withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    let book;
    if (props.getProperty('spreadsheetId')) book = SpreadsheetApp.openById(props.getProperty('spreadsheetId'));
    else { book = SpreadsheetApp.getActiveSpreadsheet(); if (!book) throw new Error('このシートの中のメニューから実行してください。'); props.setProperty('spreadsheetId', book.getId()); }
    const fresh = !book.getSheetByName('設定');
    ensureSettingsSheet_(book);
    SETTINGS_CACHE_ = null;
    const problems = settingsProblems_(S_());
    if (problems.length) throw new Error(problems.join('。') + '。入れたら、もう一度「① 最初の設定」を押してください。' + (fresh ? '（「設定」タブを作りました）' : ''));
    if (props.getProperty('ownerEmail') && props.getProperty('ownerEmail') !== owner) throw new Error('別の大会が入っています。このシートをもう一度コピーして、新しい大会を作ってください。');
    props.setProperties({ ownerEmail: owner });
    if (!props.getProperty('eventId')) props.setProperty('eventId', 'tos-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10));
    SETTINGS_CACHE_ = null;
    if (!props.getProperty('accepting')) props.setProperty('accepting', 'false');
    [['申込原本（個人情報あり）', PRIVATE_HEADERS], ['OS取込用（連絡先なし）', OS_HEADERS], ['テスト申込', PRIVATE_HEADERS], ['テストOS取込用', OS_HEADERS]].forEach(function (pair) {
      const sheet = book.getSheetByName(pair[0]) || book.insertSheet(pair[0]);
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, pair[1].length).setValues([pair[1]]).setFontWeight('bold');
      else if (JSON.stringify(sheet.getRange(1, 1, 1, pair[1].length).getDisplayValues()[0]) !== JSON.stringify(pair[1])) throw new Error('申込表の見出しが変わっています。元のデータは消さず、見出しを確認してください。');
    });
    if (!props.getProperty('photoFolderId')) { const folder = DriveApp.createFolder('Tournament OS 顔写真 - ' + S_().tournamentName); props.setProperty('photoFolderId', folder.getId()); }
    if (!props.getProperty('testFolderId')) { const folder = DriveApp.getFolderById(props.getProperty('photoFolderId')).createFolder('テスト写真'); props.setProperty('testFolderId', folder.getId()); }
    checkResources_();
  });
  selfTest_();
  Logger.log('準備できました。次は「拡張機能」→「Apps Script」→「デプロイ」→「新しいデプロイ」→「ウェブアプリ」です。何度押しても同じ申込表を使います。');
  return statusInfo_();
}
/** 架空の1件を、本物の申込と同じ道で書き、表と写真が残ったことを確かめる。会長が手でテスト送信しなくてよい。 */
function selfTest_() {
  const resources = checkResources_();
  if (testComplete_(resources.book)) return true;
  const s = S_();
  saveEntry_({ protocol: '3', eventId: s.eventId, mode: 'test', requestId: Utilities.getUuid(), gym: '自動テスト', name: '自動テスト選手', grade: 'テスト', age: '20', height: '170', weight: '65', record: '自動テスト', comment: 'テスト', musicUrl: s.music ? 'https://music.apple.com/jp/album/selftest' : '', contactName: '自動テスト', contactPhone: '09000000000', contactEmail: 'selftest@example.invalid', consent: 'yes', website: '', photoDataUrl: 'data:image/jpeg;base64,' + SELFTEST_JPEG });
  if (!testComplete_(SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('spreadsheetId')))) throw new Error('自動テストを最後まで確認できませんでした。もう一度「① 最初の設定」を押してください。');
  return true;
}
function isPrivateOwned_(resource,owner){return resource.getOwner().getEmail().toLowerCase()===owner&&resource.getSharingAccess()===DriveApp.Access.PRIVATE&&resource.getEditors().filter(function(user){return user.getEmail().toLowerCase()!==owner;}).length===0&&resource.getViewers().length===0&&!resource.isTrashed();}
function checkResources_(){
  const props=PropertiesService.getScriptProperties(),owner=assertOwner_();
  if(props.getProperty('ownerEmail')!==owner||props.getProperty('eventId')!==S_().eventId)throw entryError_('setup','この大会の初期設定を確認してください。',false);
  const book=SpreadsheetApp.openById(props.getProperty('spreadsheetId')),sheetFile=DriveApp.getFileById(book.getId()),folder=DriveApp.getFolderById(props.getProperty('photoFolderId'));
  if(!isPrivateOwned_(sheetFile,owner)||!isPrivateOwned_(folder,owner)||!isPrivateOwned_(DriveApp.getFolderById(props.getProperty('testFolderId')),owner))throw entryError_('sharing','申込表と写真フォルダの共有を「制限付き・主催者本人だけ」にしてください。',false);
  [['申込原本（個人情報あり）',PRIVATE_HEADERS],['OS取込用（連絡先なし）',OS_HEADERS],['テスト申込',PRIVATE_HEADERS],['テストOS取込用',OS_HEADERS]].forEach(function(pair){const sheet=book.getSheetByName(pair[0]);if(!sheet||JSON.stringify(sheet.getRange(1,1,1,pair[1].length).getDisplayValues()[0])!==JSON.stringify(pair[1]))throw entryError_('headers','申込表の見出しが変わっています。データを消さず、主催者が確認してください。',false);});
  return{book:book,folder:folder};
}
/** ⑤ いまの状態。画面（OS）が読むのは、公開してよい項目だけ。主催者のメール・鍵・申込の内容は含めない。 */
function statusInfo_() {
  const props = PropertiesService.getScriptProperties();
  const ready = Boolean(props.getProperty('spreadsheetId') && props.getProperty('photoFolderId') && props.getProperty('eventId'));
  const info = { app: 'tournament-os', protocol: 3, build: RECEPTION_BUILD, ready: ready, accepting: props.getProperty('accepting') === 'true' };
  if (!ready) return info;
  const resources = checkResources_(), s = S_(), problems = settingsProblems_(s);
  info.eventId = s.eventId; info.testComplete = testComplete_(resources.book); info.settingsProblem = problems.join('。');
  if (!problems.length) { info.title = s.tournamentName; info.date = s.date; info.venue = s.venue; info.venueUrl = s.venueUrl; info.organizer = s.organizer; info.contact = s.contact; info.deadline = s.deadline; info.music = s.music; info.grade = s.grade; info.age = s.age; info.comment = s.comment; }
  return info;
}
function showStatus() {
  const s = statusInfo_();
  const text = ['設定: ' + (s.ready ? (s.settingsProblem ? '直す所があります（' + s.settingsProblem + '）' : '済み') : 'まだ（① 最初の設定を押す）'), '自動テスト: ' + (s.testComplete ? '済み' : 'まだ'), '受付: ' + (s.accepting ? '受付中' : '停止中'), '締切: ' + (s.deadline || '未設定')].join('\n');
  Logger.log(text);
  try { SpreadsheetApp.getUi().alert('いまの状態', text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (_) {}
  return s;
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tournament OS')
    .addItem('① 最初の設定', 'setupTournament')
    .addItem('② 受付を開始', 'openEntries')
    .addItem('③ 受付を停止', 'closeEntries')
    .addItem('④ OS用の名簿ZIPを作る', 'exportTournament')
    .addItem('⑤ いまの状態を見る', 'showStatus')
    .addToUi();
  try { ensureSettingsSheet_(SpreadsheetApp.getActiveSpreadsheet()); } catch (_) { /* 設定タブは「① 最初の設定」でも作る */ }
}
/** 接続確認。 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') {
    let body;
    try { body = statusInfo_(); } catch (error) { body = { app: 'tournament-os', protocol: 3, build: RECEPTION_BUILD, ready: false, error: error.code || 'error' }; }
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>大会受付の保存先です。主催者から届いたエントリー画面で申し込んでください。</p>');
}
function testComplete_(book){
  const props=PropertiesService.getScriptProperties(),requestId=props.getProperty('lastTestRequest');
  if(!requestId||props.getProperty('lastTestBuild')!==RECEPTION_BUILD)return false;
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
  return withLock_(function(){const resources=checkResources_();const problems=settingsProblems_(S_());if(problems.length)throw new Error(problems.join('。')+'。');if(!testComplete_(resources.book))throw new Error('先にテスト申込1件と写真の保存を確認してください。');if(Date.now()>deadlineTime_())throw new Error('締切を過ぎています。「設定」タブの申込締切を直してください。');PropertiesService.getScriptProperties().setProperty('accepting','true');Logger.log('受付を開始しました。大会設定画面で「接続を確かめる」を押してください。');SpreadsheetApp.flush();return true;});
}
function closeEntries(){assertOwner_();PropertiesService.getScriptProperties().setProperty('accepting','false');Logger.log('受付を停止しました。申込済みデータは残っています。');}
function deadlineTime_(){const time=Date.parse(S_().deadline+'T23:59:59+09:00');if(!Number.isFinite(time))throw entryError_('deadline','主催者が締切を設定する必要があります。',false);return time;}
function doPost(e){
  const p=(e&&e.parameter)||{};
  try{return resultPage_(saveEntry_(p),'',null,p);}
  catch(error){console.error('Tournament OS受付: '+(error.code||'storage'));return resultPage_('',error.code?error.message:'Googleへの保存を最後まで確認できませんでした。',error,p);}
}
function text_(p,key,max,required){const text=String(p[key]==null?'':p[key]).trim();if((required&&!text)||text.length>max)throw entryError_('input','入力内容を確認して、エントリー画面へ戻ってください。',false);return text;}
function validateEntry_(p){
  if((p.protocol!=='2'&&p.protocol!=='3')||p.eventId!==S_().eventId||(p.mode!=='test'&&p.mode!=='live'))throw entryError_('event','大会の受付URLが違います。主催者から新しいURLをもらってください。',false);
  if(p.website)throw entryError_('spam','送信を受け付けられませんでした。',false);
  if(p.consent!=='yes')throw entryError_('consent','規約と個人情報の取扱いへの同意が必要です。',false);
  const request=text_(p,'requestId',100,true);if(!/^[\w-]{32,100}$/.test(request))throw entryError_('input','申込を確認する番号が正しくありません。',false);
  const limits={gym:120,name:80,height:10,weight:10,record:300,contactName:100,contactPhone:30,contactEmail:200,photoDataUrl:1800100};
  Object.keys(limits).forEach(function(key){text_(p,key,limits[key],true);});
  const height=Number(p.height),weight=Number(p.weight);
  if(!Number.isFinite(height)||height<50||height>250||!Number.isFinite(weight)||weight<10||weight>250||!/^0?[0-9][0-9 -]{8,14}$/.test(p.contactPhone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail))throw entryError_('input','身長・体重・電話番号・メールアドレスを確認してください。',false);
  if(p.age&&(!/^\d{1,3}$/.test(p.age)||Number(p.age)<1||Number(p.age)>120))throw entryError_('input','年齢を確認してください。',false);
  ['grade','age','comment'].forEach(function(key){text_(p,key,key==='comment'?500:30,S_()[key]==='required');});
  if(S_().music&&!/^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//.test(text_(p,'musicUrl',500,true)))throw entryError_('input','入場曲はApple MusicかYouTubeのURLを入力してください。',false);
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
      const expected=[String(p.gym).trim(),String(p.name).trim(),S_().grade==='off'?'':String(p.grade||'').trim(),S_().age==='off'?'':String(p.age||'').trim(),String(Number(p.height)),String(Number(p.weight)),String(p.record).trim(),S_().comment==='off'?'':String(p.comment||'').trim(),S_().music?String(p.musicUrl||'').trim():''];
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
      const common=[clean_(p.gym,120),clean_(p.name,80),S_().grade==='off'?'':clean_(p.grade,30),S_().age==='off'?'':clean_(p.age,3),String(Number(p.height)),String(Number(p.weight)),clean_(p.record,300),S_().comment==='off'?'':clean_(p.comment,500),S_().music?clean_(p.musicUrl,500):'',photoUrl];
      values=[receiptNo,new Date(),S_().eventId].concat(common).concat([clean_(p.contactName,100),clean_(p.contactPhone,30),clean_(p.contactEmail,200),'yes',requestId]);
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
    if(isTest){props.setProperty('lastTestBuild',RECEPTION_BUILD);props.setProperty('lastTestRequest',requestId);}
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
function receipt_(requestId,isTest){return(isTest?'TEST-':'')+S_().eventId.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)+'-'+hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,requestId)).slice(0,20).toUpperCase();}
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
    const zip=folder.createFile(Utilities.zip(files,prefix+S_().eventId+'.zip'));
    Logger.log('OSへ取り込むファイル: '+zip.getUrl());Logger.log('リンクを開き、ダウンロードしたZIPを大会準備画面で選んでください。');return zip.getUrl();
}

