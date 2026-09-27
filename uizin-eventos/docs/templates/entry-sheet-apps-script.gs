/**
 * Tournament OS エントリー原本保存用 Google Apps Script
 *
 * 1. 非公開のGoogleスプレッドシートで「拡張機能」→「Apps Script」を開く
 * 2. この内容を全部貼り付ける
 * 3. ENTRY_SECRET をAIが作った秘密の文字に置き換える
 * 4. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 * 5. 実行するユーザー: 自分 / アクセス: 全員
 * 6. 表示されたURLをAIへ渡し、ENTRY_SHEET_WEBHOOK_URLとして設定してもらう
 */

const ENTRY_SECRET = 'ここをAIが作った長い秘密の文字へ変更';
const SHEET_NAME = 'entries';

const HEADERS = [
  '受付番号', '所属GYM', '選手名（リングネーム）', 'ふりがな', '性別', '学年', '年齢', '参加区分',
  '身長（cm）', '試合時の希望体重（kg）', '試合経験', '戦績・競技歴', '2試合可能か', '試合への意気込み',
  '入場曲の有無', '入場曲URL（Apple Music推奨）', '顔写真URL', '広報利用同意', '連絡先氏名',
  '連絡先電話番号', '連絡先メールアドレス', '申込日時', '大会ID',
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body || body.secret !== ENTRY_SECRET) return reply({ ok: false, reason: '認証できません' });
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    if (body.action === 'list') {
      const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getDisplayValues() : [];
      const entries = values.filter((row) => !body.eventId || row[HEADERS.indexOf('大会ID')] === body.eventId).map(rowToEntry);
      return reply({ ok: true, entries: entries });
    }
    if (!body.entry) return reply({ ok: false, reason: '申込内容がありません' });
    const entry = body.entry;
    const receipts = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat() : [];
    if (receipts.indexOf(String(entry.receiptNo || '')) >= 0) return reply({ ok: true, duplicate: true });
    sheet.appendRow([
      safe(entry.receiptNo), safe(entry.gym), safe(entry.fighterName), safe(entry.fighterKana), safe(entry.gender),
      safe(entry.grade), safe(entry.age), safe(entry.category), safe(entry.height), safe(entry.weight),
      safe(entry.experience), safe(entry.record), safe(entry.canFightTwice), safe(entry.comment),
      safe(entry.musicChoice), safe(entry.musicUrl), safe(entry.photoUrl),
      entry.consentPublicity === true ? '同意' : '不同意', safe(entry.contactName), safe(entry.contactPhone),
      safe(entry.contactEmail), new Date(Number(entry.submittedAt) || Date.now()), safe(body.eventId),
    ]);
    return reply({ ok: true });
  } catch (error) {
    return reply({ ok: false, reason: String(error) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function rowToEntry(row) {
  const value = name => row[HEADERS.indexOf(name)] || '';
  return {
    receiptNo: value('受付番号'), gym: value('所属GYM'), fighterName: value('選手名（リングネーム）'),
    fighterKana: value('ふりがな'), gender: value('性別'), grade: value('学年'), age: value('年齢'),
    category: value('参加区分'), height: value('身長（cm）'), weight: value('試合時の希望体重（kg）'),
    experience: value('試合経験'), record: value('戦績・競技歴'), canFightTwice: value('2試合可能か'),
    comment: value('試合への意気込み'), musicChoice: value('入場曲の有無'), musicUrl: value('入場曲URL（Apple Music推奨）'),
    photoUrl: value('顔写真URL'), consentPublicity: value('広報利用同意') === '同意', submittedAt: value('申込日時'), sheetSync: 'synced',
  };
}

function safe(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
