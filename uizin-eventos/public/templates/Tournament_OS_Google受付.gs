/**
 * Tournament OS 一般公開フォーム用 Google Apps Script
 * 必ず大会主催者本人のGoogleアカウントで設定してください。
 * 1. script.google.com で新しいプロジェクトを作り、この全文を貼る
 * 2. setupTournament を1回実行し、権限を許可する
 * 3. デプロイ→新しいデプロイ→ウェブアプリ
 * 4. 実行するユーザー＝自分、アクセスできるユーザー＝全員
 * 5. ウェブアプリURLをTournament OSへ貼る
 */
const SETTINGS = { eventId: 'my-tournament', tournamentName: '大会名をここに入力', expectedOwner: '主催者のGoogleメールアドレス' };
const PRIVATE_HEADERS = ['受付番号','申込日時','大会ID','所属ジム','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL','連絡先氏名','連絡先電話番号','連絡先メールアドレス','同意','リクエストID'];
const OS_HEADERS = ['管理番号','ジム名','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL'];

function setupTournament() {
  const owner = Session.getEffectiveUser().getEmail();
  if (!owner || owner.toLowerCase() !== SETTINGS.expectedOwner.toLowerCase()) throw new Error('Googleアカウントが違います。右上の丸い写真から主催者本人のアカウントへ切り替えてください。');
  const book = SpreadsheetApp.create('Tournament OS 申込原本 - ' + SETTINGS.tournamentName);
  const privateSheet = book.getSheets()[0];
  privateSheet.setName('申込原本（個人情報あり）');
  privateSheet.getRange(1, 1, 1, PRIVATE_HEADERS.length).setValues([PRIVATE_HEADERS]).setFontWeight('bold');
  const osSheet = book.insertSheet('OS取込用（連絡先なし）');
  osSheet.getRange(1, 1, 1, OS_HEADERS.length).setValues([OS_HEADERS]).setFontWeight('bold');
  const folder = DriveApp.createFolder('Tournament OS 顔写真 - ' + SETTINGS.tournamentName);
  PropertiesService.getScriptProperties().setProperties({ spreadsheetId:book.getId(), photoFolderId:folder.getId(), ownerEmail:owner, eventId:SETTINGS.eventId });
  Logger.log('申込原本: ' + book.getUrl());
  Logger.log('写真フォルダ: ' + folder.getUrl());
  Logger.log('所有Googleアカウント: ' + owner);
  return { spreadsheetUrl:book.getUrl(), folderUrl:folder.getUrl(), ownerEmail:owner };
}

function doGet() {
  return ContentService.createTextOutput(PropertiesService.getScriptProperties().getProperty('spreadsheetId') ? 'Tournament OS 受付準備OK' : '先にsetupTournamentを実行してください。');
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const token = clean_(p.token, 100);
  try { return resultPage_(token, saveEntry_(p), ''); }
  catch (error) { console.error(error); return resultPage_(token, '', '受付に失敗しました'); }
}

function saveEntry_(p) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('spreadsheetId');
  const folderId = props.getProperty('photoFolderId');
  if (!spreadsheetId || !folderId) throw new Error('setupTournament未実行');
  if (clean_(p.eventId,100) !== props.getProperty('eventId')) throw new Error('大会ID不一致');
  if (p.consent !== 'yes') throw new Error('同意なし');
  ['requestId','gym','name','height','weight','record','contactName','contactPhone','contactEmail','photoDataUrl'].forEach(function(key) { if (!clean_(p[key], key === 'photoDataUrl' ? 2000000 : 500)) throw new Error(key + 'が未入力'); });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(spreadsheetId);
    const privateSheet = book.getSheetByName('申込原本（個人情報あり）');
    const osSheet = book.getSheetByName('OS取込用（連絡先なし）');
    if (!privateSheet || !osSheet) throw new Error('受付シートなし');
    const requestId = clean_(p.requestId,100);
    if (privateSheet.getLastRow() > 1) {
      const ids = privateSheet.getRange(2, PRIVATE_HEADERS.length, privateSheet.getLastRow()-1, 1).getDisplayValues().flat();
      const existing = ids.indexOf(requestId);
      if (existing >= 0) return privateSheet.getRange(existing+2, 1).getDisplayValue();
    }
    const receiptNo = receipt_(privateSheet.getLastRow());
    const photoUrl = savePhoto_(folderId, receiptNo, p.photoDataUrl);
    const common = [clean_(p.gym,120),clean_(p.name,80),clean_(p.grade,30),clean_(p.age,3),clean_(p.height,10),clean_(p.weight,10),clean_(p.record,300),clean_(p.comment,500),clean_(p.musicUrl,500),photoUrl];
    privateSheet.appendRow([receiptNo,new Date(),clean_(p.eventId,100)].concat(common).concat([clean_(p.contactName,100),clean_(p.contactPhone,30),clean_(p.contactEmail,200),p.consent,requestId]));
    osSheet.appendRow([receiptNo].concat(common));
    return receiptNo;
  } finally { lock.releaseLock(); }
}

function savePhoto_(folderId, receiptNo, dataUrl) {
  const match = String(dataUrl).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1].length > 1800000) throw new Error('写真形式または容量エラー');
  const blob = Utilities.newBlob(Utilities.base64Decode(match[1]), 'image/jpeg', receiptNo + '.jpg');
  return DriveApp.getFolderById(folderId).createFile(blob).getUrl();
}
function receipt_(row) { const day=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd'); return String(SETTINGS.eventId).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)+'-'+day+'-'+String(row).padStart(4,'0'); }
function clean_(value,max) { const text=String(value==null?'':value).trim().slice(0,max); return /^[=+\-@]/.test(text)?"'"+text:text; }
function resultPage_(token,receiptNo,error) { const payload=JSON.stringify({type:'tournament-entry-result',token:token,receiptNo:receiptNo,error:error}); return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>parent.postMessage('+payload+',"*")<\/script>'); }
