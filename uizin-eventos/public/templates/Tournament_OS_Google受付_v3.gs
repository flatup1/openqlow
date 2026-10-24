/** Tournament OS Google受付 v3。このシートをコピーして使います。コードを貼る必要はありません。 */
const RECEPTION_BUILD = '3.20261024.2';
const MIN_FREE_BYTES = 200 * 1024 * 1024;
/**
 * 「設定」タブの「花道のルール」を新しく作るときだけ入れる初期の文。原本（募集要項 Vol.7）の言葉を並べた仮の文で、owner が「OK」と答えたもの（2026-10-22）。
 * 花道の選手には、クラス（A/B）を選ばせない。かわりに、この1行を灰色の説明で見せる。すでにあるマスは書き換えない。会長が確認して、設定タブの上で直す。
 */
const HANAMICHI_RULE_INITIAL = '花道（シニア）のルール：90秒×2ラウンド（インターバル1分）。蹴り足キャッチ・回転技・顔面への膝蹴りは禁止です。';
/** 花道のルールの長さの上限（length で数える）。core/hanamichi.ts の HANAMICHI_RULE_MAX と同じ */
const HANAMICHI_RULE_MAX_ = 120;
/** 会長が書くのは「設定」タブの、この表のB列だけ。画面（OS）側では、同じ内容を二重に入力しません。 */
const SETTING_ROWS = [
  ['大会名', '', '✎ ここに書く。例：第3回 青空ジム大会'],
  ['開催日', '', '✎ ここに書く。例：2027年10月3日（2027-10-03 でも、全角の数字でも大丈夫）'],
  ['会場', '', '✎ ここに書く。例：○○体育館'],
  ['会場の地図URL', '', '書かなくてOK。Googleマップの「共有」で出るURL'],
  ['主催者名', '', '✎ ここに書く。例：○○ジム'],
  ['問い合わせ先', '', '✎ ここに書く。選手に見えます。電話番号か、LINEのURL'],
  ['申込締切', '', '✎ ここに書く。例：2027年9月20日（開催日と同じか、その前の日）'],
  ['入場曲', 'なし', 'あり／なし。はじめは「なし」。選手に入場曲のリンクを書いてもらうときだけ、▼から「あり」を選びます'],
  ['学年', '必須', '必須／任意／なし。はじめは「必須」（選手に必ず書いてもらいます）。聞かないときだけ「なし」、書かなくてもよいときは「任意」を選びます'],
  ['年齢', '必須', '必須／任意／なし。はじめは「必須」（選手に必ず書いてもらいます）。聞かないときだけ「なし」、書かなくてもよいときは「任意」を選びます'],
  ['意気込み', '必須', '必須／任意／なし。はじめは「必須」（選手に必ず書いてもらいます）。聞かないときだけ「なし」、書かなくてもよいときは「任意」を選びます'],
  ['クラス分け', 'なし', 'あり／なし。Aクラス・Bクラスに分けるときだけ「あり」（▼から選びます）。例：あり'],
  ['上のクラスの名前', 'Aクラス', '選手に見えます。12文字まで。例：Aクラス'],
  ['上のクラスの条件', '3勝以上（3勝以下でも、会長・指導者の許可があればAクラスに出られます）', '選手に見えます。60文字まで。例：3勝以上（勝った数だけで決めます。負け・引き分けは数えません）'],
  ['上のクラスのルール', '首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）／ワンマッチは顔面への膝蹴り禁止', '選手に見えます。80文字まで。例：首相撲5秒／蹴り足キャッチはワンアタック（キャッチ後に1回だけ攻撃できる）'],
  ['下のクラスの名前', 'Bクラス', '選手に見えます。12文字まで。例：Bクラス'],
  ['下のクラスの条件', 'アマチュア。2勝以下（例：初出場、2勝1敗、1勝3敗）', '選手に見えます。60文字まで。例：アマチュア。2勝以下'],
  ['下のクラスのルール', '首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし', '選手に見えます。80文字まで。例：首相撲なし／蹴り足キャッチなし／膝蹴りなし／回転技なし'],
  ['上のクラスにする勝ち数', '3', '数字（1〜99）。この勝ち数「以上」は上のクラスです。例：3（3勝ちょうどは上のクラス）。変えたら、上と下の「条件」の文も直してください'],
  ['階級分け', 'なし', 'あり／なし。体重の階級（-37kgなど）を、選手に選んでもらうときだけ「あり」（▼から選びます）。例：あり'],
  ['ロゴ', 'なし', 'あり／なし。「あり」にすると、申込ページと当日の画面に、千葉県キックボクシング協会（CKA）のロゴが出ます（▼から選びます）。例：あり'],
  ['階級：小学生以下', 'なし', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：中学生女子', '-37、-40、-43、-46、-49、-52、-55、-58', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：中学生男子', '-37、-40、-43、-46、-49、-52、-55、-58', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：高校生・一般女子', '-40、-43、-46、-50、-53、-56、-59、-62、-65', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：高校生・一般男子', '-50、-53、-56、-59、-62、-65、-68、-71、-74、-77、-80、-85、無差別', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：花道・女子（40歳以上）', '-40、-45、-50、-55、-60、+60', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  ['階級：花道・男子（40歳以上）', '-55、-60、-65、-70、-75、-80、-85、無差別', '階級を「、」か「,」で区切って書く。-37 は37kg以下、+60 は60kgをこえる、無差別 も書ける。「なし」と書くと、階級は選ばせない（体重が近い人どうしで組む）。使わない区分は、この行ごと消す。A列の「階級：」のあとが、選手に見える区分の名前'],
  // いちばん下に足した行（既存の行の位置は動かさない）。「あり」にすると、花道の区分を選んだ人にだけ、追加の質問が出る
  ['花道の追加情報', 'なし', '「あり」にすると、区分の名前に「花道」が入っている区分を選んだ人にだけ、追加の質問が出ます。'],
  // 誓約書の行（花道の行のあと。既存の行の位置は動かさない）。文は「誓約書」タブに書く（「① 最初の設定」が、「あり」のときにタブを作る）
  ['誓約書', 'なし', 'なし／あり。「あり」にすると、申し込みの最後に、誓約書の□が出ます。選手が□ぜんぶに✔を入れないと、先へ進めません。文は「誓約書」タブに書きます（▼から選びます）'],
  ['保護者の同意', '18歳未満のみ', '18歳未満のみ／全員／なし。「誓約書」が「あり」のときだけ意味があります。「18歳未満のみ」のときは、「年齢」を「必須」か「任意」にしてください（年齢が分からない人には、保護者の同意を求めます）'],
  ['ジム責任者の同意', 'あり', 'あり／なし。「誓約書」が「あり」のときだけ意味があります。「あり」だと、選手に、ジム責任者のお名前・携帯電話・許可の確認を入れてもらいます'],
  ['誓約書の文の確認', 'まだ', 'まだ／済み。「誓約書」タブの文を、原本と見比べて、まちがいがなければ「済み」にします。「まだ」のあいだは、本番の申し込みを受け付けません（テスト用は動きます）。文を直したら、新しい申し込みリンクを作ってください'],
  // 花道のルールの行（誓約書の行のあと。既存の行の位置は動かさない）。▼の選択欄は無い（長い文を1つ書く）。クラス分けが「あり」で、花道の区分があるときだけ使う
  ['花道のルール', HANAMICHI_RULE_INITIAL, '原本から写した仮の文です。会長が確認してください。クラス分けが「あり」で、区分の名前に「花道」が入っているときだけ使います。花道の選手には、クラスを選ばせず、この1行だけを見せます。120文字までです']
];
const SELFTEST_JPEG = '/9j/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALIAP//Z';
let SETTINGS_CACHE_ = null;
/** 「設定」タブを、空だったので作り直したか（① と画面のメッセージで言う） */
let SETTINGS_REBUILT_ = false;
/** ① のあと、画面の上に一緒に言うこと（フォルダを作り直した、など） */
let SETUP_NOTES_ = [];
/** 学年・年齢・意気込みの書き方。「必須」「任意」「なし」。マスが空のときは、はじめの決まりの「必須」（うっかり消しても、聞きもれがないように） */
function mode_(text) { const v = String(text || '').trim(); return v === 'なし' ? 'off' : v === '任意' ? 'optional' : 'required'; }
/** 保護者の同意の書き方。「なし」「全員」「18歳未満のみ」。マスが空のときは、はじめの決まりの「18歳未満のみ」。ほかの言葉は、いちばんかたい「全員」（聞きもれがないように） */
function guardianMode_(text) { const v = String(text || '').trim(); return v === 'なし' ? 'none' : v === '' || v === '18歳未満のみ' ? 'under18' : 'all'; }
function dateIso_(text) {
  const t = String(text || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); }).trim();
  let y, m, d;
  const parts = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/);
  if (parts) { y = parts[1]; m = parts[2]; d = parts[3]; }
  else { const digits = t.replace(/\D/g, ''); if (digits.length !== 8) return ''; y = digits.slice(0, 4); m = digits.slice(4, 6); d = digits.slice(6, 8); }
  const iso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2), parsed = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? '' : iso;
}
/** 「▼から選ぶ」欄にする項目。選び間違い・入れ間違いを防ぐ。 */
const DROPDOWNS = [['入場曲', ['あり', 'なし']], ['学年', ['必須', '任意', 'なし']], ['年齢', ['必須', '任意', 'なし']], ['意気込み', ['必須', '任意', 'なし']], ['クラス分け', ['なし', 'あり']], ['階級分け', ['なし', 'あり']], ['ロゴ', ['なし', 'あり']], ['花道の追加情報', ['なし', 'あり']], ['誓約書', ['なし', 'あり']], ['保護者の同意', ['18歳未満のみ', '全員', 'なし']], ['ジム責任者の同意', ['あり', 'なし']], ['誓約書の文の確認', ['まだ', '済み']]];
/** 会長が必ず書く6つ（B列）。色と「✎ ここに書く」の印をつける。入場曲は、はじめから「なし」が入っているので、ここに入れない。 */
const WRITE_LABELS = ['大会名', '開催日', '会場', '主催者名', '問い合わせ先', '申込締切'];
function applyDropdowns_(sheet, labels) {
  // 使えない環境でも、設定は読めるので止めない。
  try {
    DROPDOWNS.forEach(function (pair) {
      const index = labels.indexOf(pair[0]);
      if (index >= 0) sheet.getRange(index + 1, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(pair[1], true).setAllowInvalid(false).build());
    });
  } catch (_) { /* 選択欄が作れなくても、手で入れられる */ }
}
/** 見た目：書く6つのB列に色（#fff2a8）、列の幅、文字の折り返し、1行目の固定。つくるときだけ。使えない環境でも止めない。 */
function formatSettings_(sheet) {
  try {
    SETTING_ROWS.forEach(function (row, i) { if (WRITE_LABELS.indexOf(row[0]) >= 0) sheet.getRange(i + 2, 2).setBackground('#fff2a8'); });
    sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 380); sheet.setColumnWidth(3, 520);
    sheet.getRange(1, 1, SETTING_ROWS.length + 1, 3).setWrap(true);
    sheet.setFrozenRows(1);
  } catch (_) { /* 見た目が付けられなくても、設定は読める */ }
}
/**
 * 設定タブの見た目を作る。onOpen（メニューが出るとき）と最初の設定で呼ぶ。
 * すでにあるときは、足りない項目の行（古い版のクラス8行など）だけを、いちばん下に足す。いまあるマスは1つも書き換えない。
 */
function ensureSettingsSheet_(book) {
  let sheet = book.getSheetByName('設定');
  if (sheet) {
    // 中身が1つも無い（全部えらんで Delete を押した）ときは、失うものが無いので、表を最初から作り直す
    if (sheet.getLastRow() === 0) { fillSettingsSheet_(sheet); SETTINGS_REBUILT_ = true; return sheet; }
    return appendMissingSettingRows_(sheet);
  }
  sheet = book.insertSheet('設定');
  fillSettingsSheet_(sheet);
  return sheet;
}
/** 「設定」タブのB列（S_() が読むB2〜B60）を「文字」の形にする。from＝ここから下だけ（省略すると、B2から）。使えない環境でも止めない */
function textFormatSettings_(sheet, from) {
  try {
    // 行が60より少ないタブでも、ある所までは「文字」にする（範囲が表の外に出ると、全部が失敗するため）
    const top = Math.max(2, from || 2), bottom = Math.min(60, typeof sheet.getMaxRows === 'function' ? sheet.getMaxRows() : 60);
    if (top <= bottom) sheet.getRange(top, 2, bottom - top + 1, 1).setNumberFormat('@');
  } catch (_) { /* 形が付けられなくても、設定は読める */ }
}
function fillSettingsSheet_(sheet) {
  sheet.getRange(1, 1, 1, 3).setValues([['項目', '値（ここに入れる）', '説明']]).setFontWeight('bold');
  // 主催者が行を足すこともあるので、S_() が読む範囲（B2〜B60）ぜんぶを「文字」にする（先頭が - や + の階級の並びが、式にならないように）
  textFormatSettings_(sheet);
  sheet.getRange(2, 1, SETTING_ROWS.length, 3).setValues(SETTING_ROWS);
  applyDropdowns_(sheet, [''].concat(SETTING_ROWS.map(function (row) { return row[0]; })));
  formatSettings_(sheet);
}
function appendMissingSettingRows_(sheet) {
  const last = sheet.getLastRow();
  const labels = last > 0 ? sheet.getRange(1, 1, last, 1).getDisplayValues().map(function (row) { return String(row[0]).trim(); }) : [];
  // 階級の区分の行（「階級：…」）は、「階級分け」の行がすでにあるときは足さない（会長が使わない区分の行を消したのを、もどさない）
  const hasWeightBlock = labels.indexOf('階級分け') >= 0;
  const missing = SETTING_ROWS.filter(function (row) { return labels.indexOf(row[0]) < 0 && !(hasWeightBlock && /^階級[:：]/.test(row[0])); });
  if (!missing.length || last < 1) return sheet;
  const start = last + 1, end = last + missing.length;
  if (typeof sheet.getMaxRows === 'function' && typeof sheet.insertRowsAfter === 'function' && sheet.getMaxRows() < end) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  sheet.getRange(start, 2, missing.length, 1).setNumberFormat('@');
  // 足した行の下に、主催者が書き足す行（区分など）も、文字として入る。まだ「文字」になっていない所だけ（書いてある値は書き換えない）
  textFormatSettings_(sheet, start + missing.length);
  sheet.getRange(start, 1, missing.length, 3).setValues(missing);
  try { sheet.getRange(start, 1, missing.length, 3).setWrap(true); } catch (_) { /* 折り返しが付けられなくても、設定は読める */ }
  applyDropdowns_(sheet, labels.concat(missing.map(function (row) { return row[0]; })).map(function (label, i) { return i < last ? '' : label; }));
  return sheet;
}
/**
 * 階級の文字を読む決まり。core/weightClass.ts と同じ（テストで、同じ答えになることを確かめる）。
 * 保存する形：37kg以下／60kgをこえる／無差別／自由な名前（数字のない名前）。先頭が - + の文字は保存しない（表計算で式になるため）。
 */
/** 「なし」の言い方。表の1つのマスぜんぶがこれなら、階級を選ばせない区分。階級の名前には使えない */
const WEIGHT_NONE_PHRASE_ = /^(?:特に)?(?:なし|無し|ナシ|階級(?:は)?(?:なし|無し|ありません)|ありません)(?:です|でした)?$/;
/** マスや1つぶんの文字の外側の「（ ）」「「 」」と、うしろの「。」を取る */
function weightStripEdges_(value) { return String(value).replace(/^[（(「『]([\s\S]*)[）)」』]$/, '$1').replace(/[。.．！!]+$/, '').trim(); }
const WEIGHT_RESERVED_ = ['kg', 'キロ', '級', '以下', '以上', 'まで', '超', '超え', '超える', 'こえる', 'をこえる', 'を超える', '未満', 'なし', '無し', 'ナシ', 'ありません', 'あり', '有り', 'アリ', 'はい', 'いいえ'];
const WEIGHT_OPEN_ = ['無差別', '無差別級', 'フリー', 'フリー級', 'free', 'open', 'オープン', 'オープン級', '体重無制限', '体重制限なし'];
function weightSquash_(value) {
  return String(value == null ? '' : value).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').toLowerCase().replace(/[ー‐‑–—−―－﹣]/g, '-').replace(/＋/g, '+').replace(/\s+/g, '');
}
function weightKg_(kg) { return String(Number(kg.toFixed(1))); }
function weightText_(value) { return String(value == null ? '' : value).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }
/** 階級の1つぶんを、保存する形にする。読めなければ ''。 */
function weightCanon_(raw) {
  const s = weightSquash_(raw);
  if (!s) return '';
  if (WEIGHT_OPEN_.map(weightSquash_).indexOf(s) >= 0) return '無差別';
  const maxRes = [/^-(\d{1,3}(?:\.\d)?)(?:kg|キロ|ｋｇ)?(?:級)?(?:以下)?$/, /^(\d{1,3}(?:\.\d)?)(?:kg|キロ|ｋｇ)?(?:級)?(?:以下|まで)$/, /^(\d{1,3}(?:\.\d)?)(?:kg|キロ|ｋｇ)級$/];
  const overRes = [/^\+(\d{1,3}(?:\.\d)?)(?:kg|キロ|ｋｇ)?(?:級)?$/, /^(\d{1,3}(?:\.\d)?)(?:kg|キロ|ｋｇ)?(?:をこえる|を超える|こえる|超える|超え|超|以上|超級)$/];
  let i, m;
  for (i = 0; i < maxRes.length; i++) { m = maxRes[i].exec(s); if (m) { const kg = Number(m[1]); return kg > 0 && kg < 300 ? weightKg_(kg) + 'kg以下' : ''; } }
  for (i = 0; i < overRes.length; i++) { m = overRes[i].exec(s); if (m) { const kg = Number(m[1]); return kg > 0 && kg < 300 ? weightKg_(kg) + 'kgをこえる' : ''; } }
  if (/\d/.test(s)) return '';
  // 名前は、全角・半角のちがいをそろえて持つ（取り込んだファイルの「ＬＩＧＨＴ」と設定の「LIGHT」が、同じ階級になる）
  const text = weightText_(raw).normalize('NFKC');
  if (!text || text.length > 16 || /^[=+\-@]/.test(text)) return '';
  // 名前には、文字（かな・漢字・英字）が1つは要る。記号や「ー」だけ、「kg」「以下」のような単位・ことば、「なし」の言い方は、階級の名前にしない
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(text) || WEIGHT_RESERVED_.map(weightSquash_).indexOf(weightSquash_(text)) >= 0 || WEIGHT_NONE_PHRASE_.test(weightSquash_(text))) return '';
  return text;
}
/** 主催者が表に書いた「階級のならび」を、保存する形の一覧にする。「なし」だけなら none。書き方のまちがいは problems に。 */
function weightList_(text) {
  const raw = String(text == null ? '' : text).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').trim(), problems = [], classes = [], seen = {};
  if (!raw) return { classes: [], problems: ['空です（階級を書くか、階級を選ばせない区分なら「なし」と書いてください）'], none: false };
  // 「なし」と書いたことが分かる形：「なし」「階級なし」のあとに、（かっこの説明）や「。」が付いてもよい
  const flatCell = raw.replace(/\s+/g, '');
  if (/^(?:なし|無し|ナシ|階級なし|階級無し|階級はなし|ありません)(?:[（(][^）)]*[）)])?[。.]?$/.test(flatCell) || WEIGHT_NONE_PHRASE_.test(weightStripEdges_(flatCell))) return { classes: [], problems: [], none: true };
  // 数字とあとの単位・「-」と数字のあいだの空白は、区切りではない（「-37 kg」「- 37」を2つに割らない）
  const unit = '(?:kg|キロ|ｋｇ|級|以下|まで|をこえる|を超える|こえる|超える|超え|超|以上)';
  const glued = raw.replace(/([-+＋−‐‑–—―－﹣])\s+(?=\d)/g, '$1').replace(new RegExp('(\\d)\\s+(?=' + unit + ')', 'gi'), '$1').replace(new RegExp('(kg|キロ|ｋｇ)\\s+(?=' + unit.replace('kg|キロ|ｋｇ|', '') + ')', 'gi'), '$1');
  glued.split(/[,、，。;；\/／\n\r\t　 ]+/).forEach(function (part) {
    const token = weightStripEdges_(part.trim());
    if (!token) return;
    if (token.length > 16) { problems.push('「' + token.slice(0, 12) + '」は長すぎます（16文字まで）'); return; }
    const canon = weightCanon_(token), flat = weightSquash_(token);
    if (!canon) {
      const num = flat.replace(/kg|キロ/g, '');
      problems.push(/^[\d.]+(?:kg|キロ)?$/.test(flat) ? '「' + token.slice(0, 12) + '」は、以下なら「-' + num + '」、こえるなら「+' + num + '」と書いてください' : '「' + token.slice(0, 12) + '」は、階級として読めません（例：-37、+60、無差別）');
      return;
    }
    const key = canon.toLowerCase();
    if (seen[key]) { problems.push('同じ階級が2回あります（' + canon + '）'); return; }
    seen[key] = true; classes.push(canon);
  });
  if (classes.length > 20) problems.push('階級が多すぎます（20こまで）');
  if (!classes.length && !problems.length) problems.push('階級が1つも読めません（例：-37、-40、+60、無差別／階級を選ばせない区分なら「なし」と書きます）');
  return { classes: classes, problems: problems, none: false };
}
/** 区分の名前（「階級：」のあと）。見えない文字・制御文字を取り、空白を1つにする。 */
function divisionName_(value) { return String(value == null ? '' : value).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }
/** 区分を比べる印：全角・半角・大文字・小文字・空白のちがいを無くす */
function divisionKey_(value) { return String(value == null ? '' : value).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }
/** 設定は「設定」タブが正本。コードには焼き込まない。大会IDは自動で決まる（会長は入れない）。 */
function S_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('spreadsheetId');
  if (!id) throw adminError_('setup', '「Tournament OS」メニューの「① 最初の設定」を押してください。');
  const book = SpreadsheetApp.openById(id), sheet = book.getSheetByName('設定');
  if (!sheet) throw adminError_('setup', '「設定」タブが見つかりません。「① 最初の設定」を押してください。');
  // 古い設定タブ（11行）でも読める：行が足りない分は空として読む。会長が行を足していても、名前で探す（60行まで）。
  const count = Math.max(1, Math.min(60, (typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : typeof sheet.getMaxRows === 'function' ? sheet.getMaxRows() : SETTING_ROWS.length + 1) - 1));
  const rows = sheet.getRange(2, 1, count, 2).getDisplayValues(), v = {};
  rows.forEach(function (row) { v[String(row[0]).trim()] = String(row[1]).trim(); });
  const classes = { enabled: v['クラス分け'] === 'あり', upper: { name: v['上のクラスの名前'], condition: v['上のクラスの条件'], rule: v['上のクラスのルール'] }, lower: { name: v['下のクラスの名前'], condition: v['下のクラスの条件'], rule: v['下のクラスのルール'] }, upperMinWins: Number(String(v['上のクラスにする勝ち数'] || '').normalize('NFKC')) || 0 };
  const classRows = Object.prototype.hasOwnProperty.call(v, 'クラス分け');
  // 階級分け：「階級：」で始まる行が、1つの区分（上から順）。B列が、選べる階級（「なし」＝階級を選ばせない）
  const weightRows = Object.prototype.hasOwnProperty.call(v, '階級分け');
  const divisions = [];
  rows.forEach(function (row) {
    const m = /^階級[:：]([\s\S]*)$/.exec(String(row[0]).trim());
    if (!m) return;
    const parsed = weightList_(String(row[1]));
    divisions.push({ name: divisionName_(m[1]), text: String(row[1]).trim(), classes: parsed.classes, none: parsed.none, problems: parsed.problems });
  });
  const weights = { enabled: v['階級分け'] === 'あり', divisions: divisions };
  // 誓約書：「あり」のときだけ、「誓約書」タブの文も読む（なし・行が無いときは、何も読まない）。ジム責任者の同意の空は「あり」、確認の空は「まだ」（どちらも安全側）
  const pledge = v['誓約書'] === 'あり';
  SETTINGS_CACHE_ = { eventId: props.getProperty('eventId') || '', tournamentName: v['大会名'], date: dateIso_(v['開催日']), venue: v['会場'], venueUrl: v['会場の地図URL'], organizer: v['主催者名'], contact: v['問い合わせ先'], deadline: dateIso_(v['申込締切']), music: v['入場曲'] === 'あり', grade: mode_(v['学年']), age: mode_(v['年齢']), comment: mode_(v['意気込み']), classes: classes, classRows: classRows, weights: weights, weightRows: weightRows, logo: v['ロゴ'] === 'あり', hanamichi: v['花道の追加情報'] === 'あり', hanamichiRule: v['花道のルール'] || '', hanamichiRuleRow: Object.prototype.hasOwnProperty.call(v, '花道のルール'), pledge: pledge, guardianMode: guardianMode_(v['保護者の同意']), gymMode: v['ジム責任者の同意'] !== 'なし', pledgeConfirmed: v['誓約書の文の確認'] === '済み', pledgeTab: pledge ? readPledgeTab_(book) : null, raw: v };
  return SETTINGS_CACHE_;
}
/** 設定の間違いを、直す場所つきで返す。空なら問題なし。 */
function settingsProblems_(s) {
  const missing = [], bad = [], raw = s.raw || {};
  if (!s.tournamentName) missing.push('大会名');
  if (!raw['開催日']) missing.push('開催日'); else if (!s.date) bad.push('「開催日」は、2027年10月3日 のように入れてください');
  if (!s.venue) missing.push('会場');
  if (!s.organizer) missing.push('主催者名');
  if (!s.contact) missing.push('問い合わせ先');
  if (!raw['申込締切']) missing.push('申込締切'); else if (!s.deadline) bad.push('「申込締切」は、2027年9月20日 のように入れてください');
  if (!raw['入場曲']) missing.push('入場曲（あり／なしを選ぶ）');
  if (s.date && s.deadline && s.deadline > s.date) bad.push('「申込締切」は、開催日と同じか、それより前にしてください');
  if (s.venueUrl && !/^https:\/\/(?:share\.google|maps\.app\.goo\.gl|www\.google\.com\/maps)(?:\/|$)/.test(s.venueUrl)) bad.push('「会場の地図URL」は、Googleマップの共有URLにするか、空にしてください');
  [['入場曲', ['あり', 'なし']], ['学年', ['必須', '任意', 'なし']], ['年齢', ['必須', '任意', 'なし']], ['意気込み', ['必須', '任意', 'なし']], ['クラス分け', ['あり', 'なし']], ['階級分け', ['あり', 'なし']], ['ロゴ', ['あり', 'なし']], ['花道の追加情報', ['あり', 'なし']], ['誓約書', ['あり', 'なし']]].forEach(function (pair) { if (raw[pair[0]] && pair[1].indexOf(raw[pair[0]]) < 0) bad.push('「' + pair[0] + '」は、' + pair[1].join('／') + 'のどれかにしてください'); });
  // クラスの欄は「クラス分け＝あり」のときだけ調べる（なし・空のときは、何が入っていても止めない）
  if (raw['クラス分け'] === 'あり') {
    const sides = [['上', '上のクラス'], ['下', '下のクラス']], norm = function (t) { return String(t || '').normalize('NFKC').trim().toLowerCase(); };
    [['の名前', 12], ['の条件', 60], ['のルール', 80]].forEach(function (kind) {
      sides.forEach(function (side) { if (!String(raw[side[1] + kind[0]] || '').trim()) missing.push(side[1] + kind[0]); });
    });
    // 順番は 名前（上・下）→ 条件 → ルール になるよう、上の forEach の並びを保つ
    if (norm(raw['上のクラスの名前']) && norm(raw['上のクラスの名前']) === norm(raw['下のクラスの名前'])) bad.push('「上のクラスの名前」と「下のクラスの名前」は、ちがう名前にしてください');
    sides.forEach(function (side) {
      [['の名前', 12], ['の条件', 60], ['のルール', 80]].forEach(function (kind) {
        const label = side[1] + kind[0], text = String(raw[label] || '').trim();
        if (text.length > kind[1]) bad.push('「' + label + '」は' + kind[1] + '文字までにしてください');
        if (kind[0] === 'の名前' && /^[=+\-@]/.test(text)) bad.push('「' + label + '」は、「=」「+」「-」「@」で始めないでください');
      });
    });
    const wins = String(raw['上のクラスにする勝ち数'] || '').normalize('NFKC').trim();
    if (!/^\d{1,2}$/.test(wins) || Number(wins) < 1) bad.push('「上のクラスにする勝ち数」は、1から99の数字で入れてください（例：3）');
    else {
      // 画面に出る「3勝以上」「2勝以下」の数字が、勝ち数とちがうと、選手が見る文と、黄色のすすめがくいちがう。どの欄を直すかを言う
      const upper = /([0-9]+)勝以上/.exec(norm(raw['上のクラスの条件'])), lower = /([0-9]+)勝以下/.exec(norm(raw['下のクラスの条件']));
      if (upper && Number(upper[1]) !== Number(wins)) bad.push('「上のクラスの条件」の「' + upper[1] + '勝以上」と、「上のクラスにする勝ち数」の' + Number(wins) + 'が、ちがいます（' + Number(wins) + '勝以上に直すか、勝ち数を' + upper[1] + 'に直してください）');
      if (lower && Number(lower[1]) !== Number(wins) - 1) bad.push('「下のクラスの条件」の「' + lower[1] + '勝以下」と、「上のクラスにする勝ち数」の' + Number(wins) + 'が、ちがいます（上のクラスは' + Number(wins) + '勝以上なので、' + (Number(wins) - 1) + '勝以下に直してください）');
    }
  }
  // 階級の欄は「階級分け＝あり」のときだけ調べる（なし・空のときは、何が入っていても止めない）
  if (raw['階級分け'] === 'あり') {
    const ds = (s.weights && s.weights.divisions) || [], seenNames = {};
    if (!ds.length) bad.push('「階級分け」が「あり」ですが、「階級：…」の行がありません（「階級：中学生男子」のような行を足すか、「階級分け」を「なし」にしてください）');
    if (ds.length > 12) bad.push('「階級：…」の行は12こまでです（いま' + ds.length + 'こ）');
    ds.forEach(function (d) {
      const label = '階級：' + d.name;
      if (!d.name) { bad.push('「階級：」のあとに、区分の名前を書いてください（例：階級：中学生男子）'); return; }
      if (d.name.length > 20) bad.push('「' + label + '」の区分の名前は20文字までにしてください');
      if (/^[=+\-@]/.test(d.name)) bad.push('「' + label + '」の区分の名前は、「=」「+」「-」「@」で始めないでください');
      const key = divisionKey_(d.name);
      if (seenNames[key]) bad.push('「' + label + '」と同じ区分の名前が、2つあります（どちらかの名前を変えるか、1つ消してください）');
      seenNames[key] = true;
      d.problems.forEach(function (problem) { bad.push('「' + label + '」：' + problem); });
    });
  }
  // 花道の追加情報は「あり」のときだけ調べる：花道の区分を選べること（階級分けが「あり」で、区分の名前に「花道」が入った行がある）。なし・空のときは、何が入っていても止めない
  if (raw['花道の追加情報'] === 'あり') {
    const hn = (s.weights && s.weights.enabled && s.weights.divisions) || [];
    if (!hn.some(function (d) { return isHanamichiName_(d.name); })) bad.push('「花道の追加情報」が「あり」ですが、選べる区分に「花道」の入った名前がありません（「階級分け」を「あり」にして、区分の名前に「花道」を入れるか、A列が「花道の追加情報」の行のB列を「なし」にしてください）');
  }
  // 花道のルールは、クラス分けが「あり」で、選べる区分に「花道」の入った名前があるときだけ調べる（花道の選手には、クラスを選ばせず、この1行を見せるため）。ほかのときは、何が入っていても止めない。1つの問題＝1つの文（文の中に「。」を入れない）
  if (hanamichiRuleApplies_(s)) {
    const rule = String(s.hanamichiRule || '').trim();
    if (!rule) bad.push('「花道のルール」が空です（A列が「花道のルール」の行のB列に、花道の選手に見せる1行を書いてください）');
    else if (rule.length > HANAMICHI_RULE_MAX_) bad.push('「花道のルール」は' + HANAMICHI_RULE_MAX_ + '文字までにしてください（A列が「花道のルール」の行のB列を、いまの' + rule.length + '文字から短くしてください）');
  }
  // 誓約書は「あり」のときだけ調べる（なし・空のときは、何が入っていても止めない）。1つの問題＝1つの文（文の中に「。」を入れない）。直すマスを言う
  if (raw['誓約書'] === 'あり') {
    [['保護者の同意', ['18歳未満のみ', '全員', 'なし']], ['ジム責任者の同意', ['あり', 'なし']], ['誓約書の文の確認', ['まだ', '済み']]].forEach(function (pair) { if (raw[pair[0]] && pair[1].indexOf(raw[pair[0]]) < 0) bad.push('「' + pair[0] + '」は、' + pair[1].join('／') + 'のどれかにしてください'); });
    const tab = s.pledgeTab;
    if (!tab) bad.push('「誓約書」が「あり」ですが、「誓約書」タブがありません（「① 最初の設定」を押して作るか、使わないなら、A列が「誓約書」の行のB列を「なし」にしてください）');
    else {
      if (!tab.items.length) bad.push('「誓約書」タブのA列（A2〜A9）に、誓約の項目が1つもありません（原本のとおりに、1マスに1項目ずつ書いてください）');
      else if (tab.items.length > PLEDGE_LIMITS_.items) bad.push('「誓約書」タブの項目が' + tab.items.length + '個あります（' + PLEDGE_LIMITS_.items + '個までなので、A2〜A9に収めてください）');
      const longCells = tab.items.map(function (text, i) { return text.length > PLEDGE_LIMITS_.item ? 'A' + tab.rows[i] : ''; }).filter(Boolean);
      if (longCells.length) bad.push('「誓約書」タブの項目が長すぎます（1項目' + PLEDGE_LIMITS_.item + '文字までなので、' + longCells.join('・') + 'のマスを短くしてください）');
      const total = tab.items.concat([tab.guardian, tab.gym]).reduce(function (sum, text) { return sum + text.length; }, 0);
      if (total > PLEDGE_LIMITS_.total) bad.push('「誓約書」タブの文字の合計が多すぎます（項目と、保護者・ジム責任者の文を合わせて' + PLEDGE_LIMITS_.total + '文字までなので、いまの' + total + '文字を短くしてください）');
      if (s.guardianMode !== 'none' && !tab.guardian) bad.push('「保護者の同意」が「なし」ではないのに、「誓約書」タブのB2（保護者の同意の文）が空です（文を書くか、「保護者の同意」を「なし」にしてください）');
      if (s.gymMode && !tab.gym) bad.push('「ジム責任者の同意」が「あり」なのに、「誓約書」タブのC2（ジム責任者の同意の文）が空です（文を書くか、「ジム責任者の同意」を「なし」にしてください）');
    }
    if (s.guardianMode === 'under18' && s.age === 'off') bad.push('「保護者の同意」が「18歳未満のみ」ですが、「年齢」が「なし」です（年齢を聞かないと18歳未満かどうか分からないので、「年齢」を「必須」か「任意」にするか、「保護者の同意」を「全員」か「なし」にしてください）');
  }
  // 長すぎる文は、選手に渡すURLに入らない。どの欄かを言う
  [['大会名', 300], ['会場', 300], ['主催者名', 300], ['問い合わせ先', 300], ['会場の地図URL', 500]].forEach(function (pair) { if (String(raw[pair[0]] || '').length > pair[1]) bad.push('「' + pair[0] + '」は' + pair[1] + '文字までにしてください'); });
  const out = [];
  if (missing.length) out.push('「設定」タブの、次の欄を入れてください：' + missing.join('、'));
  return out.concat(bad);
}
const PRIVATE_HEADERS = ['受付番号','申込日時','大会ID','所属ジム','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL','連絡先氏名','連絡先電話番号','連絡先メールアドレス','同意','リクエストID','クラス','区分','階級'];
const OS_HEADERS = ['管理番号','ジム名','選手名','学年','年齢','身長','体重','戦績・競技歴','試合への意気込み','入場曲URL（Apple Music推奨）','顔写真URL','クラス','区分','階級'];
/** 古い版の表は、右のはしの列（クラス・区分・階級）が足りない。足りないのが右のはし3つまでなら、「old」として、①で足す。 */
const OLD_MISSING_MAX = 3;
function assertOwner_() {
  const props = PropertiesService.getScriptProperties(), owner = Session.getEffectiveUser().getEmail().toLowerCase(), saved = props.getProperty('ownerEmail');
  if (!owner || (saved && owner !== saved)) throw adminError_('owner', 'このシートを作った本人のGoogleで開き直してください。');
  return owner;
}
/** 4つの表と、その1行目（見出し）。順番はそのまま使う。 */
const TABLES = [['申込原本（個人情報あり）', PRIVATE_HEADERS], ['OS取込用（連絡先なし）', OS_HEADERS], ['テスト申込', PRIVATE_HEADERS], ['テストOS取込用', OS_HEADERS]];
/* ---------- 花道の追加情報（core/hanamichi.ts と同じ決まり。tests/gasHanamichi.test.ts が、同じ答えになることを確かめる） ---------- */
/** 区分の名前に「花道」が入っているか（全角・半角・空白・見えない文字のちがいは見ない） */
function isHanamichiName_(name) { return divisionKey_(name).indexOf('花道') >= 0; }
/**
 * 花道のルールを使う設定か：「花道のルール」の行があり、クラス分けが「あり」で、階級分けが「あり」、選べる区分に「花道」の入った名前がある（花道の選手には、クラスを選ばせない）。
 * 行そのものが無い昔のシートは、「まだルールを決めていない」と読む（動かなくならない。花道の選手も、今までどおりクラスを選ぶ）。行があって空のときだけ、設定の問題
 */
function hanamichiRuleApplies_(s) {
  return Boolean(s.hanamichiRuleRow && s.classes.enabled && s.weights.enabled && s.weights.divisions.some(function (d) { return isHanamichiName_(d.name); }));
}
/**
 * 12項目の表（POSTの鍵・シートの列は、この順）。必須／任意を変えたいときは、required を1行ずつ直す。
 * 職業と他格闘歴だけ任意。needs＝その項目が空でないときだけ要る（リングネームが空なら、フリガナは要らない）。個人情報なので、ログには出さない。
 */
const HANAMICHI_ITEMS_ = [
  { key: 'hnNameKana', label: '氏名のフリガナ', required: true, max: 60, kind: 'kana' },
  { key: 'hnGymKana', label: '所属ジムのフリガナ', required: true, max: 60, kind: 'kana' },
  { key: 'hnRing', label: 'リングネーム', required: true, max: 60, kind: 'text' },
  { key: 'hnRingKana', label: 'リングネームのフリガナ', required: true, max: 60, kind: 'kana', needs: 'hnRing' },
  { key: 'hnBirth', label: '生年月日', required: true, max: 10, kind: 'date' },
  { key: 'hnKickYears', label: 'キック歴（年）', required: true, max: 2, kind: 'number' },
  { key: 'hnPerWeek', label: '練習頻度（週に何回）', required: true, max: 2, kind: 'number' },
  { key: 'hnOther', label: '他格闘歴', required: false, max: 60, kind: 'text' },
  { key: 'hnJob', label: '職業', required: false, max: 60, kind: 'text' },
  { key: 'hnHobby', label: '趣味・特技', required: true, max: 60, kind: 'text' },
  { key: 'hnReason', label: '始めた理由・良かった所', required: true, max: 300, kind: 'longtext' },
  { key: 'hnMessage', label: 'メッセージ', required: true, max: 300, kind: 'longtext' }
];
/** 花道プロフィールの見出し：最初の4つは本体の申し込みの値、あとは上の表の順 */
const HANAMICHI_HEADERS_ = ['受付番号', '申込日時', '所属ジム', '選手名'].concat(HANAMICHI_ITEMS_.map(function (item) { return item.label; }));
/** 個人情報の別タブ（本番とテスト）。「花道の追加情報」が「あり」のときだけ、① が作る。3つ目の true＝全マスを文字の形にする */
const HANAMICHI_TABLES_ = [['花道プロフィール', HANAMICHI_HEADERS_, true], ['テスト花道プロフィール', HANAMICHI_HEADERS_, true]];
const HANAMICHI_MISSING_ = '花道の追加の質問に、答えていない所があります。申込ページにもどって、入れてから、もう一度送ってください。';
const HANAMICHI_BAD_ = '花道の追加の質問に、まちがいがある所があります。申込ページにもどって、直してから、もう一度送ってください。';
/** 自動テストの1件が花道の区分に当たるときだけ付ける、架空の答え */
const SELFTEST_HANAMICHI_ = { hnNameKana: 'ジドウテスト', hnGymKana: 'ジドウテスト', hnRing: '自動テスト', hnRingKana: 'ジドウテスト', hnBirth: '1980-01-01', hnKickYears: '1', hnPerWeek: '1', hnOther: '', hnJob: '', hnHobby: 'テスト', hnReason: 'テスト', hnMessage: 'テスト' };
/** 見る表。「花道の追加情報」が「あり」のときだけ花道のタブも、「誓約書」が「あり」のときだけ誓約の記録のタブも見る（なしのときは、これまでの4つだけ） */
function tables_() { const s = S_(); let all = TABLES; if (s.hanamichi) all = all.concat(HANAMICHI_TABLES_); if (s.pledge) all = all.concat(PLEDGE_TABLES_); return all; }
/** 表の見出しを調べる。個人情報のタブ（3つ目が true）は、あるときは1マスも書き換えない：右はしの見出しが空でも、書き足さず、直すマスとして言う */
function tableCheck_(book, pair) {
  const check = headerCheck_(book, pair[0], pair[1]);
  return pair[2] && check.state === 'old' ? { state: 'bad', name: check.name, sheet: check.sheet, headers: check.headers, index: check.from, expected: check.headers[check.from], actual: '', inserted: false, rowGone: false } : check;
}
/** 個人情報のタブは、全マスを「文字」の形にする（生年月日・数字が、日付や数に変わらないように）。使えない環境でも止めない */
function textFormatTab_(sheet, cols) {
  try { sheet.getRange(1, 1, typeof sheet.getMaxRows === 'function' ? sheet.getMaxRows() : 1000, cols).setNumberFormat('@'); } catch (_) { /* 形が付けられなくても、1行ごとに文字の形で書く */ }
}
/** 実在する日で、今日（日本時間）より後ではない日か。2月30日・未来の日・1900年より前は false。年齢は見ない */
function realPastDate_(y, m, d) {
  if (![y, m, d].every(function (n) { return Number.isInteger(n); }) || y < 1900 || m < 1 || m > 12 || d < 1) return false;
  const day = new Date(Date.UTC(y, m - 1, d)), jst = new Date(Date.now() + 9 * 3600 * 1000);
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  return day.getTime() <= Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
}
/** 12項目の値をそろえる（見えない文字・改行・前後の空白。数字と日付は全角も半角に）。リングネームが空なら、そのフリガナも空 */
function hanamichiClean_(p) {
  const out = {};
  HANAMICHI_ITEMS_.forEach(function (item) { const text = norm_(p[item.key]); out[item.key] = item.kind === 'number' || item.kind === 'date' ? text.normalize('NFKC').trim() : text; });
  HANAMICHI_ITEMS_.forEach(function (item) { if (item.needs && !out[item.needs]) out[item.key] = ''; });
  return out;
}
/** 12項目を調べる。missing＝必須なのに空の項目／bad＝文字数・数字・実在する日のまちがい。年齢は確かめない */
function hanamichiErrors_(clean) {
  const missing = [], bad = [];
  HANAMICHI_ITEMS_.forEach(function (item) {
    const text = clean[item.key];
    if (!text) { if (item.required && (!item.needs || clean[item.needs])) missing.push(item.key); return; }
    if (item.kind === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text); if (!m || !realPastDate_(Number(m[1]), Number(m[2]), Number(m[3]))) bad.push(item.key); }
    else if (item.kind === 'number') { if (!/^\d{1,2}$/.test(text)) bad.push(item.key); }
    else if (text.length > item.max) bad.push(item.key);
  });
  return { missing: missing, bad: bad };
}
/** 花道の追加情報を聞く申し込みか：設定が「あり」で、選ばれた区分（設定タブにある名前）に「花道」が入っているとき。それ以外は、花道の値が送られても、見ずに捨てる */
function hanamichiApplies_(p) {
  if (!S_().hanamichi) return false;
  const d = findDivision_(norm_(p.division));
  return Boolean(d) && isHanamichiName_(d.name);
}
/** 自動テストの1件が選ぶ区分が花道のときだけ、架空の答えを付ける（付けないと、赤い失敗になる） */
function selfTestHanamichi_(s) {
  const pick = selfTestDivision_(s);
  return s.hanamichi && pick.division && isHanamichiName_(pick.division) ? SELFTEST_HANAMICHI_ : {};
}
/** 花道プロフィールに1行書く。同じ受付番号の行があれば、何もしない（再送で行を増やさない）。個人情報なので、ログには出さない */
function saveHanamichiRow_(sheet, values, p) {
  if (findRow_(sheet, 1, values[0])) return;
  const clean = hanamichiClean_(p), width = HANAMICHI_HEADERS_.length;
  const row = [values[0], values[1], values[3], values[4]].concat(HANAMICHI_ITEMS_.map(function (item) { return clean[item.key]; })).map(function (value) { return clean_(value, 2000); });
  const newRow = sheet.getLastRow() + 1;
  ensureRows_(sheet, newRow);
  sheet.getRange(newRow, 1, 1, width).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, width).setValues([row]);
  SpreadsheetApp.flush();
  const saved = findRow_(sheet, 1, values[0]);
  if (!saved || JSON.stringify(sheet.getRange(saved, 1, 1, width).getDisplayValues()[0].map(retryNorm_)) !== JSON.stringify(row.map(retryNorm_))) throw entryError_('storage', '花道の追加情報の保存を確認できませんでした。', true);
}
/* ---------- 誓約書（core/pledge.ts と同じ決まり。tests/gasPledge.test.ts が、同じ答えになることを確かめる） ---------- */
/** 文の置き場のタブ。A2〜A9＝項目（最大8個・1項目120字まで）、B2＝保護者（連帯責任者）の同意の文、C2＝団体・ジム責任者の同意の文。文の合計は700字まで（長さは length で数える） */
const PLEDGE_TAB = '誓約書';
const PLEDGE_LIMITS_ = { items: 8, item: 120, total: 700 };
const PLEDGE_GYM_NAME_MAX_ = 40;
/**
 * 「誓約書」タブをはじめて作るときだけ入れる文。owner が原本から貼った文字（2026-10-22）のまま。AIが書いた文ではない。直さない（「することし」も貼られたまま）。
 * すでにタブがあるときは、1マスも触らない。会長が原本と見比べて、タブの上で直す。
 */
const PLEDGE_INITIAL_ITEMS = [
  '上記大会出場に関して万が一事故が発生した場合は、主催者に対し一切の責任や賠償を求めないこと',
  '勝敗に関する一切の判断を主催者に一任し、本大会のルールと規定に従うこと',
  '大会中に撮影した写真や動画等の著作権は主催者に帰属することし、自己の判断でSNS等に転載しない事',
  '試合に際し、身体的な接触により相手もしくは関係者に病気を媒介するような感染症を持っていないこと',
  '上記申し込み事項や誓約事項に虚偽がないこと'
];
const PLEDGE_INITIAL_GUARDIAN = '上記のものが本試合に出場すること、上記誓約内容に同意致します。';
const PLEDGE_INITIAL_GYM = '上記の者が試合に出場することに同意し、上記誓約内容に同意致します。';
const PLEDGE_HEADINGS_ = ['誓約書の項目（原本のとおりに、1項目ずつ。1マス＝1項目）', '保護者（連帯責任者）の同意の文', '団体・ジム責任者の同意の文'];
const PLEDGE_MEMO_ = 'この文は、owner が原本から貼った文字です（2026-10-22）。会長が原本と見比べて、まちがいがあれば直してください。直したら、「設定」タブの「誓約書の文の確認」を「済み」にして、新しい申し込みリンクを作ってください。';
/** 誓約の記録の見出し（この順）。ほかの人（ジム責任者）の個人情報が入るので、OS取込用・名簿ZIP・申込原本には出さない */
const PLEDGE_HEADERS_ = ['受付番号', '申込日時', '選手名', '確認した項目', '保護者の同意', 'ジム責任者の名前', 'ジム責任者の電話', '許可の念押し', '同意した文', '文の指紋'];
/** 誓約の記録の別タブ（本番とテスト）。「誓約書」が「あり」のときだけ、① が作る。3つ目の true＝全マスを文字の形にする */
const PLEDGE_TABLES_ = [['誓約記録', PLEDGE_HEADERS_, true], ['テスト誓約記録', PLEDGE_HEADERS_, true]];
/** 申し込みページが送る誓約書の鍵（「なし」のときは1つも付いてこない） */
const PLEDGE_POST_KEYS_ = ['pledge', 'pledgeItems', 'pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode'];
/** ジムに入っていない人の言い方（全角・半角をそろえ、空白を取ったあと）。そのもの＝_ ／ ふくむ＝_PHRASES_。core/pledge.ts の UNAFFILIATED_NAMES・UNAFFILIATED_PHRASES と同じ。ジムに所属していない人は参加できないので、断る */
const PLEDGE_UNAFFILIATED_ = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'ない', '無', 'フリー', '個人'];
const PLEDGE_UNAFFILIATED_PHRASES_ = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', '所属無し', 'しょぞくなし', 'ショゾクナシ', '所属してない', '所属していない', '所属してません', '所属していません', '所属しておりません', 'ジムなし', 'ジム無し', '道場なし', '道場無し', '通ってない', '通っていない'];
/** 断る言葉（core/pledge.ts の UNAFFILIATED_TEXT と同じ。あとに「申込ページにもどって」を足す） */
const UNAFFILIATED_TEXT_ = 'ジムに所属していない人は、参加できません。通っているジム・道場の名前を入れてください。';
const PLEDGE_YES_ = 'はい';
const PLEDGE_NO_NEED_ = '不要';
const PLEDGE_ITEMS_BAD_ = '誓約書の確認（✔）が、すべてそろっていません。申し込みページにもどって、各項目の□に✔を入れてください。';
const PLEDGE_GUARDIAN_BAD_ = '保護者（連帯責任者）の同意の確認（✔）が入っていません。申し込みページにもどって、✔を入れてください。';
const PLEDGE_CHANGED_ = '誓約書の設定が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。';
const PLEDGE_OLD_ = '誓約書の文が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。';
const PLEDGE_UNCONFIRMED_ = '主催者が、誓約書の文をまだ確認していません。送れません。';
const PLEDGE_GYM_CHECK_ = 'ジム責任者の同意の確認（✔）が入っていません。申し込みページにもどって、✔を入れてください。';
const PLEDGE_GYM_NAME_ = 'ジム責任者のお名前を、40文字までで入れてください。';
const PLEDGE_GYM_PHONE_ = 'ジム責任者の携帯電話を、ハイフンなしの11けたで入れてください（070・080・090で始まる番号です）。';
const PLEDGE_PERMISSION_ = 'ジム責任者の許可をとっているか、確認のチェックが必要です。';
/** 「誓約書」タブを読む（2行目から60行目まで）。タブが無ければ null。空のマスは飛ばす。rows＝項目が書いてあった行の番号（直すマスを言うため） */
function readPledgeTab_(book) {
  const sheet = book.getSheetByName(PLEDGE_TAB);
  if (!sheet) return null;
  const last = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : 2;
  const cells = sheet.getRange(2, 1, Math.max(1, Math.min(60, last) - 1), 3).getDisplayValues(), items = [], rows = [];
  cells.forEach(function (row, i) { const text = norm_(row[0]); if (text) { items.push(text); rows.push(i + 2); } });
  return { items: items, rows: rows, guardian: norm_(cells[0][1]), gym: norm_(cells[0][2]) };
}
/** 「誓約書」＝あり で、タブがまだ無いときだけ、タブを作って初期の文を入れる。すでにタブがあるときは、1マスも触らない（空でも・直してあっても） */
function ensurePledgeSheet_(book) {
  if (!S_().pledge || book.getSheetByName(PLEDGE_TAB)) return;
  const sheet = book.insertSheet(PLEDGE_TAB);
  textFormatTab_(sheet, 5);
  sheet.getRange(1, 1, 1, 3).setValues([PLEDGE_HEADINGS_]).setFontWeight('bold');
  sheet.getRange(2, 1, PLEDGE_INITIAL_ITEMS.length, 1).setValues(PLEDGE_INITIAL_ITEMS.map(function (text) { return [text]; }));
  sheet.getRange(2, 2, 1, 1).setValues([[PLEDGE_INITIAL_GUARDIAN]]);
  sheet.getRange(2, 3, 1, 1).setValues([[PLEDGE_INITIAL_GYM]]);
  sheet.getRange(1, 5, 2, 1).setValues([['メモ'], [PLEDGE_MEMO_]]);
  try {
    [380, 320, 320, 40, 420].forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
    sheet.getRange(1, 1, 12, 5).setWrap(true);
    sheet.setFrozenRows(1);
  } catch (_) { /* 見た目が付けられなくても、文は読める */ }
  SETUP_NOTES_.push('「誓約書」タブを作りました。タブの文を原本と見比べて、まちがいがなければ、「設定」タブの「誓約書の文の確認」を「済み」にしてください。');
}
/** 文のひとまとめ（JSON の文字）。ping の pledgeCanon。指紋はこの文字から作る */
function pledgeCanon_(s) { const tab = s.pledgeTab; return JSON.stringify({ items: tab.items, guardian: tab.guardian, gym: tab.gym }); }
/** 文の指紋：いまの pledgeCanon の SHA-256（16進の小文字64字）。リンクの plf と、送られた pledgeHash を比べる（会長が文を直したら、古いリンクでは申し込めない） */
function pledgeHash_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pledgeCanon_(s), Utilities.Charset.UTF_8)); }
function pledgeAge_(age) {
  const text = String(age == null ? '' : age).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').trim();
  if (!/^\d{1,3}$/.test(text)) return 0;
  const n = Number(text);
  return n >= 1 && n <= 120 ? n : 0;
}
/** 保護者の同意が要るか：なし→要らない／全員→要る／18歳未満のみ→年齢が18未満のとき。年齢が空・読めない・121以上は「要る」（安全側）。core/pledge.ts の guardianNeeded と同じ */
function guardianNeeded_(mode, age) {
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  const n = pledgeAge_(age);
  return n === 0 || n < 18;
}
/** ジム責任者の携帯電話を、数字だけの形にする（全角・ハイフン・空白はOK）。070／080／090で始まる11けたでなければ ''。core/pledge.ts の gymPhoneNormal と同じ */
function gymPhoneNormal_(raw) {
  const d = String(raw == null ? '' : raw).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').trim().replace(/[\s\-ー－―‐‑–—−]/g, '');
  return /^0[789]0\d{8}$/.test(d) ? d : '';
}
function gymPhoneOk_(raw) { return gymPhoneNormal_(raw) !== ''; }
/** ジム名が「ジムに入っていない」の言い方か（core/pledge.ts の isUnaffiliated と同じ） */
function isUnaffiliated_(gym) {
  const key = String(gym == null ? '' : gym).replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').normalize('NFKC').replace(/\s+/g, '');
  return PLEDGE_UNAFFILIATED_.indexOf(key) >= 0 || PLEDGE_UNAFFILIATED_PHRASES_.some(function (phrase) { return key.indexOf(phrase) >= 0; });
}
/**
 * リンクを作ったあとで、「保護者の同意」「ジム責任者の同意」が厳しくなっていないか。ページが送る pledgeGuardianMode・pledgeGymMode は、リンクの plg・plm と同じ値。
 * 「いまの設定は✔を求めるのに、このリンクのページには、その欄が出ない」ときだけ true（古いページには✔を入れる場所が無い。「✔を入れてください」と言っても行き止まり）。
 * ゆるくなった分は、ページに余分な欄があるだけなので、true にしない。鍵が付いてこない・読めないときは、調べない（false）
 */
function pledgeLinkStale_(p, s) {
  const mode = String(p.pledgeGuardianMode == null ? '' : p.pledgeGuardianMode).trim(), gymMode = String(p.pledgeGymMode == null ? '' : p.pledgeGymMode).trim();
  if ((mode === 'none' || mode === 'under18' || mode === 'all') && guardianNeeded_(s.guardianMode, p.age) && !guardianNeeded_(mode, p.age)) return true;
  return gymMode === 'off' && s.gymMode;
}
/** 誓約書の鍵が1つでも（空でなく）付いてきたか */
function pledgeKeysSent_(p) { return PLEDGE_POST_KEYS_.some(function (key) { return String(p[key] == null ? '' : p[key]).trim() !== ''; }); }
/** 記録に残す「同意した文」：そのとき✔した文。項目（番号つき）と、✔した保護者・ジム責任者の文 */
function pledgeAgreedText_(tab, guardian, gym) {
  return tab.items.map(function (text, i) { return (i + 1) + '. ' + text; }).concat(guardian ? ['【保護者の同意】' + tab.guardian] : [], gym ? ['【ジム責任者の同意】' + tab.gym] : []).join('\n');
}
/**
 * 新しい申込の、誓約書の検査。保存の前（鍵の確認・カウンター・写真の前）に呼ぶ。投げたら、何も書かれない。
 * 「なし」のとき：誓約書の鍵が付いてきたら断る（古いリンク。誓約したつもりで記録が無い事故を防ぐ）。付いてこなければ null（今までと同じ）。
 * 「あり」のとき：本番で文の確認が「まだ」→ pledgeconfirm／文の指紋がちがう→ pledgeold／✔の漏れ→ pledge／ジム責任者の欄→ gym・permission。記録に書く内容を返す。
 */
function pledgeCheck_(p) {
  const s = S_();
  if (!s.pledge) { if (pledgeKeysSent_(p)) throw entryError_('pledge', PLEDGE_CHANGED_, false); return null; }
  if (p.mode === 'live' && !s.pledgeConfirmed) throw entryError_('pledgeconfirm', PLEDGE_UNCONFIRMED_, false);
  const tab = s.pledgeTab;
  if (!tab || !tab.items.length || tab.items.length > PLEDGE_LIMITS_.items) throw adminError_('setup', '「誓約書」タブの文を確認してください。「① 最初の設定」を押してください。');
  const hash = pledgeHash_(s);
  if (String(p.pledgeHash == null ? '' : p.pledgeHash) !== hash) throw entryError_('pledgeold', PLEDGE_OLD_, false);
  if (pledgeLinkStale_(p, s)) throw entryError_('pledgeold', PLEDGE_CHANGED_, false);
  const expected = tab.items.map(function (_, i) { return String(i + 1); }).join(',');
  if (String(p.pledge == null ? '' : p.pledge) !== 'yes' || String(p.pledgeItems == null ? '' : p.pledgeItems) !== expected) throw entryError_('pledge', PLEDGE_ITEMS_BAD_, false);
  const guardian = guardianNeeded_(s.guardianMode, p.age);
  if (guardian && p.pledgeGuardian !== 'yes') throw entryError_('pledge', PLEDGE_GUARDIAN_BAD_, false);
  // ジム責任者の欄は、「ジム責任者の同意」が「あり」のときだけ求める（ジムに入っていない人は、申込の時点で断っている）
  const asked = s.gymMode;
  let gymName = '', gymPhone = '';
  if (asked) {
    gymName = norm_(p.gymName); gymPhone = gymPhoneNormal_(p.gymPhone);
    if (p.pledgeGym !== 'yes') throw entryError_('gym', PLEDGE_GYM_CHECK_, false);
    if (!gymName || gymName.length > PLEDGE_GYM_NAME_MAX_) throw entryError_('gym', PLEDGE_GYM_NAME_, false);
    if (!gymPhone) throw entryError_('gym', PLEDGE_GYM_PHONE_, false);
    if (p.gymPermission !== 'yes') throw entryError_('permission', PLEDGE_PERMISSION_, false);
  }
  return { items: expected, guardian: guardian, gymName: gymName, gymPhone: gymPhone, asked: asked, hash: hash, text: pledgeAgreedText_(tab, guardian, asked) };
}
/** 自動テストの1件が誓約書に答えるときの、架空の✔・名前・電話（付けないと、赤い失敗になる）。「なし」のときは何も付けない */
function selfTestPledge_(s) {
  if (!s.pledge || !s.pledgeTab) return {};
  const out = { pledge: 'yes', pledgeItems: s.pledgeTab.items.map(function (_, i) { return String(i + 1); }).join(','), pledgeHash: pledgeHash_(s), pledgeGuardianMode: s.guardianMode, pledgeGymMode: s.gymMode ? 'on' : 'off' };
  if (guardianNeeded_(s.guardianMode, '20')) out.pledgeGuardian = 'yes';
  if (s.gymMode) { out.pledgeGym = 'yes'; out.gymName = '自動テスト'; out.gymPhone = '09000000000'; out.gymPermission = 'yes'; }
  return out;
}
/** 誓約の記録に1行書く。同じ受付番号の行があれば、何もしない（再送で行を増やさない）。ジム責任者の名前・電話があるので、ログには出さない */
function savePledgeRow_(sheet, values, rec) {
  if (findRow_(sheet, 1, values[0])) return;
  const width = PLEDGE_HEADERS_.length;
  const row = [values[0], values[1], values[4], rec.items, rec.guardian ? PLEDGE_YES_ : PLEDGE_NO_NEED_, rec.gymName, rec.gymPhone, rec.asked ? PLEDGE_YES_ : PLEDGE_NO_NEED_, rec.text, rec.hash].map(function (value) { return clean_(value, 2000); });
  const newRow = sheet.getLastRow() + 1;
  ensureRows_(sheet, newRow);
  sheet.getRange(newRow, 1, 1, width).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, width).setValues([row]);
  SpreadsheetApp.flush();
  const saved = findRow_(sheet, 1, values[0]);
  if (!saved || JSON.stringify(sheet.getRange(saved, 1, 1, width).getDisplayValues()[0].map(retryNorm_)) !== JSON.stringify(row.map(retryNorm_))) throw entryError_('storage', '誓約書の記録の保存を確認できませんでした。', true);
}
/* ---------- くわしい戦績（core/recordDetail.ts と同じ決まり。tests/gasRecordDetail.test.ts が、同じ答えになることを確かめる） ---------- */
/** 本番の「戦績詳細」と、テストの「テスト戦績詳細」。tables_() の必須の一覧には入れない（古いシートの点検の結果を変えないため）。 */
const RECORD_TABLE = '戦績詳細', RECORD_TEST_TABLE = 'テスト戦績詳細';
/** 見出し（この順）。core/recordDetail.ts の RECORD_DETAIL_HEADERS と同じ。名簿ZIPの records.csv も、この見出し */
const RECORD_DETAIL_HEADERS = ['受付番号', '申込日時', '種類', '競技名・大会名', '試合数', '勝ち', '負け', '引き分け', '勝敗なし', '獲得年', '階級', 'タイトル名・入賞成績'];
/** 種類の名前（core/recordDetail.ts の RECORD_KIND と同じ） */
const RECORD_KIND = { kick: 'キック', other: '他の格闘技', title: 'タイトル・入賞' };
/** 上限（core/recordDetail.ts の RECORD_DETAIL_LIMITS と同じ） */
const RECORD_LIMITS = { games: 999, others: 5, titles: 5, sport: 20, event: 60, class: 30, result: 60, yearMin: 1900, yearMax: 2100 };
const RECORD_DETAIL_VERSION = 1;
const RECORD_DETAIL_UNREADABLE_ = 'くわしい戦績の中身が読めません。';
const RECORD_DETAIL_TAIL_ = '申込ページにもどって、直してから、もう一度送ってください。';
/** くわしい戦績の欄が送られてきたか。空（空白だけも）か欄が無いときは、古い申込と同じに動く */
function recordDetailSent_(p) { return String(p.recordDetail == null ? '' : p.recordDetail).trim() !== ''; }
/** 数の決まり：0〜999 の整数（数の型のときだけ。文字の「3」は数ではない） */
function recordDetailCount_(value) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= RECORD_LIMITS.games; }
/** 文字の決まり：空白だけは不可。前後の空白を除いた長さが max まで */
function recordDetailText_(value, max) { return typeof value === 'string' && value.trim() !== '' && value.trim().length <= max; }
/** 中身の決まりに合わない所を、画面と同じ言い方で返す。合っていれば空の配列（core/recordDetail.ts の recordDetailProblems と同じ決まり） */
function recordDetailProblems_(d) {
  const out = [];
  if (!d || typeof d !== 'object') return [RECORD_DETAIL_UNREADABLE_];
  const kick = d.kick;
  if (!kick || !recordDetailCount_(kick.games)) out.push('キックボクシングの試合数を、数字で入れてください（未経験は「0」）。');
  else if (kick.games > 0) {
    if (!recordDetailCount_(kick.win) || !recordDetailCount_(kick.loss) || !recordDetailCount_(kick.draw)) out.push('キックボクシングの勝ち・負け・引き分けを、数字で入れてください。');
    else if (kick.win + kick.loss + kick.draw !== kick.games) out.push('キックボクシングの勝ち・負け・引き分けの合計が、試合数と合っていません（試合数 ' + kick.games + '）。');
  } else if (!recordDetailCount_(kick.win) || kick.win !== 0 || kick.loss !== 0 || kick.draw !== 0) out.push('未経験（試合数0）のときは、勝ち・負け・引き分けは入れません。');
  const others = Array.isArray(d.others) ? d.others : null;
  if (!others) out.push('他の格闘技の欄が読めません。');
  else {
    if (others.length > RECORD_LIMITS.others) out.push('他の格闘技は、' + RECORD_LIMITS.others + 'つまでです。');
    others.slice(0, RECORD_LIMITS.others).forEach(function (o) {
      const sport = o ? o.sport : undefined, games = o ? o.games : undefined;
      if (!recordDetailText_(sport, RECORD_LIMITS.sport)) out.push('他の格闘技の競技名を入れてください（' + RECORD_LIMITS.sport + '字まで）。');
      if (!recordDetailCount_(games) || games < 1) out.push('他の格闘技の試合数は、1以上の数字で入れてください。');
      else if (![o.win, o.loss, o.draw, o.noResult].every(function (n) { return recordDetailCount_(n); })) out.push('他の格闘技の勝ち・負け・引き分け・勝敗なしを、数字で入れてください。');
      else if (o.win + o.loss + o.draw + o.noResult !== games) out.push('「' + sport + '」の勝ち・負け・引き分け・勝敗なしの合計が、試合数と合っていません（試合数 ' + games + '）。');
    });
  }
  const titles = Array.isArray(d.titles) ? d.titles : null;
  if (!titles) out.push('タイトル・入賞歴の欄が読めません。');
  else {
    if (titles.length > RECORD_LIMITS.titles) out.push('タイトル・入賞歴は、' + RECORD_LIMITS.titles + 'つまでです。');
    titles.slice(0, RECORD_LIMITS.titles).forEach(function (t) {
      const year = t ? t.year : undefined;
      if (!recordDetailText_(t ? t.event : undefined, RECORD_LIMITS.event)) out.push('タイトル・入賞歴の大会名を入れてください（' + RECORD_LIMITS.event + '字まで）。');
      if (!Number.isInteger(year) || year < RECORD_LIMITS.yearMin || year > RECORD_LIMITS.yearMax) out.push('獲得年は、4けたの数字で入れてください。');
      if (!recordDetailText_(t ? t.class : undefined, RECORD_LIMITS.class)) out.push('タイトル・入賞歴の階級を入れてください（' + RECORD_LIMITS.class + '字まで）。');
      if (!recordDetailText_(t ? t.result : undefined, RECORD_LIMITS.result)) out.push('タイトル名または入賞成績を入れてください（' + RECORD_LIMITS.result + '字まで）。');
    });
  }
  return out;
}
/**
 * 送られた JSON を読む（core/recordDetail.ts の parseRecordDetail と同じ）。数字は、全角も半角も受ける：JSON の数字のところ（引用符の外）の全角を半角にしてから読む。
 * 読めたときは { detail }。読めない・決まりに合わないときは { error }（画面に出す文）。
 */
function recordDetailRead_(text) {
  if (typeof text !== 'string' || text.trim() === '' || text.length > 20000) return { error: RECORD_DETAIL_UNREADABLE_ + RECORD_DETAIL_TAIL_ };
  const json = text.replace(/("(?:[^"\\]|\\.)*")|([０-９]+)/g, function (all, quoted, digits) {
    return quoted ? quoted : digits.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); });
  });
  let d = null;
  try { d = JSON.parse(json); } catch (_) { d = null; }
  if (!d || typeof d !== 'object' || d.v !== RECORD_DETAIL_VERSION) return { error: RECORD_DETAIL_UNREADABLE_ + RECORD_DETAIL_TAIL_ };
  const problems = recordDetailProblems_(d);
  if (problems.length) return { error: 'くわしい戦績に、まちがいがある所があります。' + problems[0] + RECORD_DETAIL_TAIL_ };
  return { detail: {
    v: RECORD_DETAIL_VERSION,
    kick: { games: d.kick.games, win: d.kick.win, loss: d.kick.loss, draw: d.kick.draw },
    others: d.others.map(function (o) { return { sport: o.sport.trim(), games: o.games, win: o.win, loss: o.loss, draw: o.draw, noResult: o.noResult }; }),
    titles: d.titles.map(function (t) { return { event: t.event.trim(), year: t.year, class: t.class.trim(), result: t.result.trim() }; })
  } };
}
/** 読めた中身だけを返す。読めないときは null（比べるための関数） */
function recordDetailParse_(text) { return recordDetailRead_(text).detail || null; }
/**
 * くわしい戦績の検査（保存の前）。送られていなければ null（古い申込と同じ）。送られていて決まりに合わなければ、何も書かずに断る（'input'）。
 * 合っていれば中身を返し、申込の record は、キックの1行（「3勝1敗」「初試合」）にそろえる。
 */
function recordDetailCheck_(p) {
  if (!recordDetailSent_(p)) return null;
  const read = recordDetailRead_(String(p.recordDetail));
  if (read.error) throw entryError_('input', read.error, false);
  p.record = recordDetailKickText_(read.detail.kick);
  return read.detail;
}
/** キックの戦績の1行（core/recordDetail.ts の kickRecordText と同じ）。試合数0は「初試合」。例：「4戦3勝1敗」（前の版の引き分けつきは「4戦2勝1敗1分」） */
function recordDetailKickText_(kick) { if (kick.games === 0) return '初試合'; return kick.games + '戦' + kick.win + '勝' + kick.loss + '敗' + (kick.draw > 0 ? kick.draw + '分' : ''); }
/** 1件を、表の行（見出しの順）に分ける（core/recordDetail.ts の recordDetailRows と同じ）。キックは必ず1行。他の格闘技・タイトルは、1つにつき1行 */
function recordDetailRows_(receiptNo, submittedAt, detail) {
  const blank = function () { return RECORD_DETAIL_HEADERS.map(function () { return ''; }); };
  const rows = [], kick = blank();
  kick[0] = receiptNo; kick[1] = submittedAt; kick[2] = RECORD_KIND.kick; kick[3] = 'キックボクシング';
  kick[4] = String(detail.kick.games); kick[5] = String(detail.kick.win); kick[6] = String(detail.kick.loss); kick[7] = String(detail.kick.draw);
  rows.push(kick);
  detail.others.forEach(function (o) {
    const row = blank();
    row[0] = receiptNo; row[1] = submittedAt; row[2] = RECORD_KIND.other; row[3] = o.sport;
    row[4] = String(o.games); row[5] = String(o.win); row[6] = String(o.loss); row[7] = String(o.draw); row[8] = String(o.noResult);
    rows.push(row);
  });
  detail.titles.forEach(function (t) {
    const row = blank();
    row[0] = receiptNo; row[1] = submittedAt; row[2] = RECORD_KIND.title; row[3] = t.event;
    row[9] = String(t.year); row[10] = t.class; row[11] = t.result;
    rows.push(row);
  });
  return rows;
}
/** 「戦績詳細」の表（本番・テスト）を、見出しつきで用意する。無ければ作り、中身が空なら見出しを書く（見出しの行は、警告つきで保護）。 */
function recordDetailSheetEnsure_(book, name) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    textFormatTab_(sheet, RECORD_DETAIL_HEADERS.length);
    sheet.getRange(1, 1, 1, RECORD_DETAIL_HEADERS.length).setValues([RECORD_DETAIL_HEADERS]).setFontWeight('bold');
    try { sheet.getRange(1, 1, 1, RECORD_DETAIL_HEADERS.length).protect().setDescription('見出しです。変えると受付が止まります').setWarningOnly(true); } catch (_) { /* 保護できなくても動く */ }
  }
  return sheet;
}
/** 「戦績詳細」の1行目が、この版の見出しと同じか。違えば、どの列が違うか（headerProblemError_ が使う形）を返す。同じなら null */
function recordDetailHeaderCheck_(sheet, name) {
  const n = RECORD_DETAIL_HEADERS.length, width = typeof sheet.getMaxColumns === 'function' ? Math.max(1, Math.min(n, sheet.getMaxColumns())) : n;
  const row = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (cell) { return String(cell); });
  while (row.length < n) row.push('');
  let index = 0;
  while (index < n && row[index] === RECORD_DETAIL_HEADERS[index]) index++;
  if (index === n) return null;
  return { state: 'bad', name: name, index: index, expected: RECORD_DETAIL_HEADERS[index], actual: row[index], inserted: false, rowGone: index === 0 && /^(?:TEST-)?[A-Z0-9]{1,10}-[0-9A-F]{8,}$/.test(String(row[0]).trim()) };
}
/**
 * 「戦績詳細」（本番・テスト）の見出しが、この版と同じかを、ping と ⑤ で言うために調べる。ちがうと、新しいリンク（rd=on）の申し込みは、保存の前に、すべて断られる
 * （くわしい戦績つきの申込だけ。ほかの申込は、これまでどおり通る）。だから、必須の表（tables_）には入れず、ここで、直すタブ・マスを言う。
 * 表が無い・空のときは、問題にしない（受付が作る）。ちがうときは、headerProblemError_ を投げる（ping が、タブ・マス・あるべき文字を返す）
 */
function recordDetailTabsCheck_() {
  const id = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
  if (!id) return;
  const book = SpreadsheetApp.openById(id);
  [RECORD_TABLE, RECORD_TEST_TABLE].forEach(function (name) {
    const sheet = book.getSheetByName(name);
    if (!sheet || sheet.getLastRow() === 0) return;
    const bad = recordDetailHeaderCheck_(sheet, name);
    if (bad) throw headerProblemError_(bad);
  });
}
/** ① のあとの注意：「戦績詳細」の見出しがこの版と違うとき。止めずに言う（直すまで、くわしい戦績つきの申込は受けない） */
function recordDetailHeaderNote_(bad) { return '「' + bad.name + '」タブの見出しが、この版と違います（' + columnLetter_(bad.index) + '1 を「' + bad.expected + '」に直してください）。直すまで、くわしい戦績つきの申し込みは受けられません。'; }
/** 受付の中で使う「戦績詳細」（本番かテスト）。無ければ作り、見出しがちがうときは止める（何も書かない） */
function recordDetailSheetOf_(book, isTest) {
  const name = isTest ? RECORD_TEST_TABLE : RECORD_TABLE, sheet = recordDetailSheetEnsure_(book, name), bad = recordDetailHeaderCheck_(sheet, name);
  if (bad) throw headerProblemError_(bad);
  return sheet;
}
/** 「戦績詳細」に、1件ぶんの行を書く。同じ受付番号の行があれば、何もしない（再送で行を増やさない）。見出しの12列だけを書く（連絡先・写真は入れない） */
function recordDetailSaveRows_(sheet, values, detail) {
  if (findRow_(sheet, 1, values[0])) return;
  const width = RECORD_DETAIL_HEADERS.length, first = sheet.getLastRow() + 1;
  const rows = recordDetailRows_(values[0], values[1], detail).map(function (row) { return row.map(function (cell) { return clean_(cell, 2000); }); });
  ensureRows_(sheet, first + rows.length - 1);
  sheet.getRange(first, 1, rows.length, width).setNumberFormat('@');
  sheet.getRange(first, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  const saved = findRow_(sheet, 1, values[0]);
  const back = saved ? sheet.getRange(saved, 1, rows.length, width).getDisplayValues().map(function (row) { return row.map(retryNorm_); }) : null;
  if (!back || JSON.stringify(back) !== JSON.stringify(rows.map(function (row) { return row.map(retryNorm_); }))) throw entryError_('storage', 'くわしい戦績の保存を確認できませんでした。', true);
}
/**
 * 名簿ZIPの records.csv の中身（UTF-8・BOM・引用は players.csv と同じ）。「戦績詳細」の表が無い・行が無いときは ''（付けない）。
 * 見出しがちがうのに行があるときは、黙って落とさず、止める。
 */
function recordsCsvOf_(book) {
  const sheet = book.getSheetByName(RECORD_TABLE);
  if (!sheet || sheet.getLastRow() < 2) return '';
  const width = RECORD_DETAIL_HEADERS.length;
  const rows = sheet.getDataRange().getDisplayValues().map(function (row) { const out = []; for (let i = 0; i < width; i++) out.push(row[i] == null ? '' : String(row[i])); return out; });
  if (JSON.stringify(rows[0]) !== JSON.stringify(RECORD_DETAIL_HEADERS)) throw new Error('「戦績詳細」タブの1行目（見出し）が、この版と違うので、ZIPを作れません。見出しを直してから、もう一度やってください。');
  const body = rows.slice(1).filter(function (row) { return row.some(function (cell) { return cell !== ''; }); });
  if (!body.length) return '';
  return '﻿' + [rows[0]].concat(body).map(function (row) { return row.map(function (cell) { return '"' + clean_(cell, 2000).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
}
/** 選手（保護者）に見せる文。見出しやタブの名前は、主催者だけが直せるので、選手には言わない。 */
const PUBLIC_PROBLEM = 'ただいま受付に問題があります。主催者へご連絡ください。';
function columnLetter_(index) { let n = index + 1, out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; }
/**
 * 見出しを調べる。state：ok＝そのまま／old＝右のはしの見出し（クラス・区分・階級のうち、最後の1〜3つ）だけ無い（古い表。from＝あるところまでの数）／missing＝タブが無い・空／
 * bad＝ほかが違う（最初に違う列の位置 index と、あるべき見出し expected、いまの文字 actual、列が足されたか inserted を返す）。
 */
function headerCheck_(book, name, headers) {
  const sheet = book.getSheetByName(name), n = headers.length;
  if (!sheet || sheet.getLastRow() === 0) return { state: 'missing', name: name, sheet: sheet, headers: headers };
  const width = typeof sheet.getMaxColumns === 'function' ? Math.max(1, Math.min(n + 1, sheet.getMaxColumns())) : n + 1;
  const row = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (cell) { return String(cell); });
  while (row.length < n) row.push('');
  const head = row.slice(0, n);
  if (JSON.stringify(head) === JSON.stringify(headers)) return { state: 'ok', name: name, sheet: sheet, headers: headers };
  // 古い表：左がそのままで、右のはし1〜3つの見出しが空（どれも空であることまで見る。ほかの文字が入っていたら、bad）
  for (let missing = 1; missing <= OLD_MISSING_MAX && missing < n; missing++) {
    if (JSON.stringify(head) === JSON.stringify(headers.slice(0, n - missing).concat(headers.slice(n - missing).map(function () { return ''; })))) return { state: 'old', name: name, sheet: sheet, headers: headers, from: n - missing };
  }
  let index = 0;
  while (index < n && head[index] === headers[index]) index++;
  // 途中に1列足された形：そこから先が、ひとつずつ右にずれて同じ
  const inserted = row.length > n && JSON.stringify(row.slice(index + 1, n + 1)) === JSON.stringify(headers.slice(index));
  // 1行目を消すと、最初の申込が1行目になる：左上が受付番号の形（申込のデータ）なら「見出しが消えた」と言う
  const rowGone = index === 0 && /^(?:TEST-)?[A-Z0-9]{1,10}-[0-9A-F]{8,}$/.test(String(row[0]).trim());
  return { state: 'bad', name: name, sheet: sheet, headers: headers, index: index, expected: headers[index], actual: rowGone ? '' : String(row[index] === undefined ? '' : row[index]), inserted: inserted, rowGone: rowGone };
}
/** 後方互換：ok／old／bad の文字だけ返す。 */
function headerState_(sheet, headers) {
  const n = headers.length, row = sheet.getRange(1, 1, 1, n).getDisplayValues()[0];
  if (JSON.stringify(row) === JSON.stringify(headers)) return 'ok';
  return JSON.stringify(row) === JSON.stringify(headers.slice(0, n - 1).concat([''])) ? 'old' : 'bad';
}
/** 古い表に、足りない右のはしの見出し（1〜3マス）だけ足す。ほかのマスは書き換えない。from＝いまある見出しの数（headerCheck_ が返す）。 */
function upgradeHeader_(sheet, headers, from) {
  const n = headers.length, start = typeof from === 'number' ? from : n - 1;
  // 列が足りない小さな表でも書けるように、先に列を足す
  if (typeof sheet.getMaxColumns === 'function' && typeof sheet.insertColumnsAfter === 'function' && sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  sheet.getRange(1, start + 1, 1, n - start).setValues([headers.slice(start)]).setFontWeight('bold');
  try { sheet.getRange(1, start + 1, 1, n - start).protect().setDescription('見出しです。変えると受付が止まります').setWarningOnly(true); } catch (_) { /* 保護できなくても動く */ }
}
function entryError_(code,message,retryable) { const error=new Error(message); error.code=code; error.retryable=retryable; return error; }
/** 主催者だけが直せる問題。主催者には message（直し方つき）を、選手には PUBLIC_PROBLEM を見せる。 */
function adminError_(code, message, detail) { const error = entryError_(code, message, false); error.publicMessage = PUBLIC_PROBLEM; if (detail) error.detail = detail; return error; }
/** 見出しの問題を、タブの名前・直すマス・あるべき文字つきの文にする。 */
function headerProblemError_(check) {
  const name = check.name, quoted = '「' + name + '」タブ';
  const real = name === TABLES[0][0] || name === TABLES[1][0] || name === HANAMICHI_TABLES_[0][0] || name === PLEDGE_TABLES_[0][0];
  if (check.state === 'missing') return adminError_('missing', quoted + 'が見つからない（または、空になっている）ので、受付を止めています。「① 最初の設定」を押すと、見出しだけの新しいタブを作ります。' + (real ? '申込が入っていたタブを消したときは、先にジムの担当者に聞いてください。' : ''), { tab: name });
  const letter = columnLetter_(check.index), cell = letter + '1';
  const shown = check.actual === '' ? '（空）' : '「' + check.actual.slice(0, 20) + '」';
  const way = real
    ? '直せないときは、このタブを消さず、ジムの担当者に聞いてください。'
    : '直せないときは、このタブの名前を「' + name + '_古い」に変えて、「① 最初の設定」を押します。新しいタブができます。';
  if (check.rowGone) return adminError_('headers', quoted + 'の1行目の見出しが消えています（いちばん上の行が、申込のデータになっています）。まず「元に戻す」を押します（Ctrl を押しながら Z。Macは ⌘ を押しながら Z）。戻らないときは、いちばん上の行を右クリックして、「上に1行挿入」を押します。そのあと、ジムの担当者に、見出しを書き直してもらいます。申込は消えません。直したら「① 最初の設定」を押します。' + way, { tab: name, cell: 'A1', expected: check.expected, rowGone: true });
  if (check.inserted) return adminError_('headers', quoted + 'の1行目に、列が足されています（' + cell + '）。足した' + letter + '列を消してください（' + letter + '列の上で右クリック →「列を削除」）。消したら「① 最初の設定」を押します。' + way, { tab: name, cell: cell, expected: check.expected, inserted: true });
  return adminError_('headers', quoted + 'の' + cell + 'が' + shown + 'になっています。「' + check.expected + '」に直してください。（列や行を足したり、1行目を並べかえたりしないでください）直したら「① 最初の設定」を押します。' + way, { tab: name, cell: cell, expected: check.expected });
}
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
    SETTINGS_REBUILT_ = false; SETUP_NOTES_ = [];
    ensureSettingsSheet_(book);
    SETTINGS_CACHE_ = null;
    // 「誓約書」＝あり で、タブがまだ無いときだけ、初期の文つきで作る（先に作らないと、「タブがありません」という直しもので止まってしまう）
    ensurePledgeSheet_(book);
    SETTINGS_CACHE_ = null;
    const problems = settingsProblems_(S_());
    if (problems.length) throw new Error('シートの「設定」タブを直してください。' + problems.join('。') + '。直したら、もう一度「① 最初の設定」を押してください。' + (fresh ? '（「設定」タブを作りました）' : SETTINGS_REBUILT_ ? '（「設定」タブが空だったので、作り直しました）' : ''));
    if (props.getProperty('ownerEmail') && props.getProperty('ownerEmail') !== owner) throw new Error('別の大会が入っています。このシートをもう一度コピーして、新しい大会を作ってください。');
    const storage = storageProblem_();
    if (storage && !props.getProperty('photoFolderId')) throw new Error(storage);
    props.setProperties({ ownerEmail: owner });
    if (!props.getProperty('eventId')) props.setProperty('eventId', 'tos-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10));
    SETTINGS_CACHE_ = null;
    if (!props.getProperty('accepting')) props.setProperty('accepting', 'false');
    // 先に全部の見出しを見て、1つでも違えば何も書き換えずに止まる（タブが無い・空なのは、ここで作り直すので止めない）
    tables_().forEach(function (pair) { const check = tableCheck_(book, pair); if (check.state === 'bad') throw headerProblemError_(check); });
    tables_().forEach(function (pair) {
      const check = tableCheck_(book, pair);
      if (check.state === 'missing') {
        const sheet = check.sheet || book.insertSheet(pair[0]);
        sheet.getRange(1, 1, 1, pair[1].length).setValues([pair[1]]).setFontWeight('bold');
        try { sheet.getRange(1, 1, 1, pair[1].length).protect().setDescription('見出しです。変えると受付が止まります').setWarningOnly(true); } catch (_) { /* 保護できなくても動く */ }
        if (pair[2]) textFormatTab_(sheet, pair[1].length);
      } else if (check.state === 'old') upgradeHeader_(check.sheet, pair[1], check.from);
    });
    // 新しく書いた見出しを、Googleに確実に書き込ませてから、次の確認へ進む（書き込みが遅れて「申込原本が見つからない（または、空）」と出るのを防ぐ）
    SpreadsheetApp.flush();
    // 「戦績詳細」（本番・テスト）は、無ければ見出しつきで作る。tables_() の必須の一覧には入れない。見出しがちがうときは止めず、完了のあとの注意で言う
    [RECORD_TABLE, RECORD_TEST_TABLE].forEach(function (name) { const bad = recordDetailHeaderCheck_(recordDetailSheetEnsure_(book, name), name); if (bad) SETUP_NOTES_.push(recordDetailHeaderNote_(bad)); });
    // フォルダがゴミ箱にあるときは、作り直さずに「元に戻す」を案内する（中の写真を失わないため）。完全に消えていたら、新しく作る
    ['photoFolderId', 'testFolderId'].forEach(function (key) { if (folderState_(props.getProperty(key)) === 'trashed') throw adminError_('folder', FOLDER_GONE); });
    const photoState = folderState_(props.getProperty('photoFolderId'));
    if (photoState !== 'ok') {
      const folder = DriveApp.createFolder('Tournament OS 顔写真 - ' + S_().tournamentName);
      props.setProperty('photoFolderId', folder.getId());
      if (photoState === 'missing') SETUP_NOTES_.push('「Tournament OS 顔写真」フォルダが見つからなかったので、新しく作りました。前の写真は、新しいフォルダに入っていません。');
    }
    if (folderState_(props.getProperty('testFolderId')) !== 'ok') { const folder = DriveApp.getFolderById(props.getProperty('photoFolderId')).createFolder('テスト写真'); props.setProperty('testFolderId', folder.getId()); }
    checkResources_();
  });
  selfTest_();
  Logger.log('準備できました。次は「拡張機能」→「Apps Script」→「デプロイ」→「新しいデプロイ」→「ウェブアプリ」です。何度押しても同じ申込表を使います。');
  return statusInfo_();
}
/** 自動テストの1件が選ぶ区分・階級：最初の区分と、その最初の階級（階級分けをしないときは、空）。 */
function selfTestDivision_(s) {
  if (!s.weights.enabled || !s.weights.divisions.length) return { division: '', weightClass: '' };
  const d = s.weights.divisions[0];
  return { division: d.name, weightClass: d.classes[0] || '' };
}
/** 架空の1件を、本物の申込と同じ道で書き、表と写真が残ったことを確かめる。会長が手でテスト送信しなくてよい。 */
function selfTest_() {
  const resources = checkResources_();
  if (testComplete_(resources.book)) return true;
  const s = S_();
  saveEntry_(Object.assign({ protocol: '3', eventId: s.eventId, mode: 'test', requestId: Utilities.getUuid(), gym: '自動テスト', name: '自動テスト選手', grade: 'テスト', age: '20', height: '170', weight: '65', record: '自動テスト', comment: 'テスト', musicUrl: s.music ? 'https://music.apple.com/jp/album/selftest' : '', contactName: '自動テスト', contactPhone: '09000000000', contactEmail: 'selftest@example.invalid', consent: 'yes', website: '', fighterClass: s.classes.enabled ? 'upper' : '', division: selfTestDivision_(s).division, weightClass: selfTestDivision_(s).weightClass, photoDataUrl: 'data:image/jpeg;base64,' + SELFTEST_JPEG }, selfTestHanamichi_(s), selfTestPledge_(s)));
  if (!testComplete_(SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('spreadsheetId')))) throw new Error('自動テストを最後まで確認できませんでした。もう一度「① 最初の設定」を押してください。');
  return true;
}
/** 共有が「制限付き・主催者本人だけ」か。ゴミ箱に入っているかは、ここでは見ない（共有の話にしない。trashedOrMissing_ で別に言う） */
function isPrivateOwned_(resource,owner){return resource.getOwner().getEmail().toLowerCase()===owner&&resource.getSharingAccess()===DriveApp.Access.PRIVATE&&resource.getEditors().filter(function(user){return user.getEmail().toLowerCase()!==owner;}).length===0&&resource.getViewers().length===0;}
/** フォルダの状態：ok＝使える／trashed＝ゴミ箱／missing＝見つからない（完全に消した）。idが空なら none。 */
function folderState_(id){
  if(!id)return'none';
  try{return DriveApp.getFolderById(id).isTrashed()?'trashed':'ok';}catch(_){return'missing';}
}
const FOLDER_GONE='Googleドライブの「Tournament OS 顔写真」フォルダが、ゴミ箱に入っているか、見つかりません。Googleドライブの「ゴミ箱」を開き、そのフォルダを選んで「元に戻す」を押してください。戻したら、メニュー「① 最初の設定」を押します。';
function folderOf_(id){
  if(folderState_(id)!=='ok')throw adminError_('folder',FOLDER_GONE);
  return DriveApp.getFolderById(id);
}
function checkResources_(){
  const props=PropertiesService.getScriptProperties(),owner=assertOwner_();
  if(props.getProperty('ownerEmail')!==owner||props.getProperty('eventId')!==S_().eventId)throw adminError_('setup','この大会の初期設定を確認してください。「① 最初の設定」を押してください。');
  const book=SpreadsheetApp.openById(props.getProperty('spreadsheetId')),sheetFile=DriveApp.getFileById(book.getId()),folder=folderOf_(props.getProperty('photoFolderId')),testFolder=folderOf_(props.getProperty('testFolderId'));
  if(!isPrivateOwned_(sheetFile,owner)||!isPrivateOwned_(folder,owner)||!isPrivateOwned_(testFolder,owner))throw adminError_('sharing','申込表と写真フォルダの共有を「制限付き・主催者本人だけ」にしてください。（シートの右上の「共有」と、Driveの「Tournament OS 顔写真」フォルダの両方です）');
  const tables=tables_().map(function(pair){return tableCheck_(book,pair);});
  // どれか1つでも違っていたら（タブが無い・空も含む）、何も書き換えずに止まる。全部そろって（または古い形だけ）のときだけ、足りない1マスを足す。
  tables.forEach(function(t){if(t.state==='bad'||t.state==='missing')throw headerProblemError_(t);});
  tables.forEach(function(t){if(t.state==='old')upgradeHeader_(t.sheet,t.headers,t.from);});
  return{book:book,folder:folder};
}
/** ⑤ いまの状態。画面（OS）が読むのは、公開してよい項目だけ。主催者のメール・鍵・申込の内容は含めない。 */
function statusInfo_() {
  const props = PropertiesService.getScriptProperties();
  const ready = Boolean(props.getProperty('spreadsheetId') && props.getProperty('photoFolderId') && props.getProperty('eventId'));
  const info = { app: 'tournament-os', protocol: 3, build: RECEPTION_BUILD, ready: ready, accepting: props.getProperty('accepting') === 'true' };
  if (!ready) return info;
  const resources = checkResources_(), s = S_(), problems = settingsProblems_(s);
  info.eventId = s.eventId; info.testComplete = testComplete_(resources.book); info.settingsProblem = problems.join('。').slice(0, 600); info.storageProblem = storageProblem_();
  // 締切を過ぎたら、新しい申込は受けない（saveEntry_ と同じ決まり）。「受付中」と言い続けない。止めたのが会長なら stopped
  const pastDeadline = !problems.length && Date.now() > deadlineTime_();
  if (pastDeadline) { info.accepting = false; info.closedBy = 'deadline'; }
  else if (!info.accepting && props.getProperty('everOpened') === 'true') info.closedBy = 'stopped';
  // 「設定」タブに、クラスの行が無い（古い版のコピー）ときだけ知らせる。画面が黄色の注意を出す。
  if (!s.classRows) info.classRows = false;
  if (!s.weightRows) info.weightRows = false;
  if (!problems.length) { info.title = s.tournamentName; info.date = s.date; info.venue = s.venue; info.venueUrl = s.venueUrl; info.organizer = s.organizer; info.contact = s.contact; info.deadline = s.deadline; info.music = s.music; info.grade = s.grade; info.age = s.age; info.comment = s.comment;
    // クラス分けが「あり」のときだけ足す。クラスの文は選手に見せるもの（公開してよい）。連絡先・DriveのIDは入れない。
    if (s.logo) info.logo = true;
    if (s.weights.enabled) { info.weightMode = true; info.weights = { enabled: true, divisions: s.weights.divisions.map(function (d) { return { name: d.name, classes: d.classes.slice() }; }) }; }
    if (s.classes.enabled) { info.classMode = true; info.classes = { enabled: true, upper: { name: s.classes.upper.name, condition: s.classes.upper.condition, rule: s.classes.upper.rule }, lower: { name: s.classes.lower.name, condition: s.classes.lower.condition, rule: s.classes.lower.rule }, upperMinWins: s.classes.upperMinWins }; }
    // 花道のルール：クラス分けが「あり」で、花道の区分があり、問題がないときだけ、1行の文を足す（選手に見せる文。ほかのときは鍵が増えない）
    if (hanamichiRuleApplies_(s)) info.hanamichiRule = String(s.hanamichiRule).trim();
    // 花道の追加情報が「あり」で、問題がないときだけ、印を1つ足す（個人情報・項目名は返さない）
    if (s.hanamichi) info.hanamichiMode = true;
    // 誓約書が「あり」で、問題がないときだけ、印と文を足す（文は選手に見せるもの。「なし」のときは鍵が1つも増えない）
    if (s.pledge) { info.pledgeMode = true; info.pledgeCanon = pledgeCanon_(s); info.pledgeHash = pledgeHash_(s); info.guardianMode = s.guardianMode; info.gymMode = s.gymMode; info.pledgeChecked = s.pledgeConfirmed; }
  }
  return info;
}
function showStatus() {
  const s = statusInfo_();
  // 「戦績詳細」の見出しが崩れていたら、直すマスをいっしょに言う（新しいリンクの申し込みが、すべて断られてしまうため）
  let recordNote = '';
  try { recordDetailTabsCheck_(); } catch (error) { recordNote = '\n戦績詳細：' + String(error && error.message ? error.message : error); }
  const text = ['設定：' + (s.ready ? (s.settingsProblem ? '直す所があります（' + s.settingsProblem + '）' : '済み') : 'まだ（① 最初の設定を押す）'), '自動テスト：' + (s.testComplete ? '済み' : 'まだ'), '受付：' + (s.accepting ? '受付中' : s.closedBy === 'deadline' ? 'しめきりました（締切を過ぎています）' : '停止中'), '締切：' + (s.deadline || '未設定')].join('\n') + recordNote;
  Logger.log(text);
  try { SpreadsheetApp.getUi().alert('いまの状態', text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (_) {}
  return s;
}
/** Googleの保存容量が足りないと、写真が保存できない。先に教える。 */
function storageProblem_() {
  try {
    const limit = DriveApp.getStorageLimit(), used = DriveApp.getStorageUsed();
    if (limit > 0 && limit - used < MIN_FREE_BYTES) return 'Googleの保存容量が、ほとんど残っていません（あと約' + Math.max(0, Math.floor((limit - used) / 1048576)) + 'MB）。写真が保存できなくなります。DriveやGmailの要らないものを消すか、容量を追加してください。';
  } catch (_) { /* 容量が調べられない環境では、何も言わない */ }
  return '';
}
/** メニューから押したときは、成功も失敗も、画面の上に日本語で出す。 */
function menuRun_(fn, doneMessage) {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = fn();
    const message = typeof doneMessage === 'function' ? doneMessage(result) : doneMessage;
    if (message) SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Tournament OS', 20);
    return result;
  } catch (error) {
    ui.alert('Tournament OS', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
    return null;
  }
}
function menuSetup() { return menuRun_(setupTournament, function () { return '準備できました。架空の1件の自動テストも済みました。次は「拡張機能」→「Apps Script」→「デプロイ」→「新しいデプロイ」→「ウェブアプリ」です。' + SETUP_NOTES_.join(''); }); }
function menuOpen() { return menuRun_(openEntries, '受付を開始しました。ブラウザの「選手の受付をつくる」のタブにもどると、自動で確かめます。出ないときは「もう一度確かめる」を押します。'); }
function menuClose() { return menuRun_(closeEntries, '受付を停止しました。申込済みのデータは残っています。'); }
/** ZIPのリンクは、20秒で消える小さな通知ではなく、押せるリンクの入った箱で見せる。 */
function showZipDialog_(url) {
  const folderName = 'Tournament OS 顔写真 - ' + S_().tournamentName, zipName = 'Tournament_OS_' + S_().eventId + '.zip';
  const html = '<div style="font-family:sans-serif;line-height:1.8"><p style="font-size:18px;font-weight:bold">名簿ZIPができました。</p><p style="font-size:18px"><a href="' + escape_(url) + '" target="_blank" rel="noopener">ここを押してダウンロード</a></p><p style="font-size:14px">押せないときは、Googleドライブの「' + escape_(folderName) + '」フォルダを開き、中の「' + escape_(zipName) + '」を開きます。</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(260), 'Tournament OS');
}
function menuExport() { return menuRun_(exportTournament, function (url) { try { showZipDialog_(url); return ''; } catch (_) { return '名簿ZIPができました。Driveの「Tournament OS 顔写真」フォルダの中です：' + url; } }); }
function menuStatus() { return menuRun_(showStatus, ''); }
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tournament OS')
    .addItem('① 最初の設定', 'menuSetup')
    .addItem('② 受付を開始', 'menuOpen')
    .addItem('③ 受付を停止', 'menuClose')
    .addItem('④ OS用の名簿ZIPを作る', 'menuExport')
    .addItem('⑤ いまの状態を見る', 'menuStatus')
    .addToUi();
  try { ensureSettingsSheet_(SpreadsheetApp.getActiveSpreadsheet()); } catch (_) { /* 設定タブは「① 最初の設定」でも作る */ }
}
/** 接続確認。 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') {
    let body;
    try { body = statusInfo_(); recordDetailTabsCheck_(); } catch (error) {
      body = { app: 'tournament-os', protocol: 3, build: RECEPTION_BUILD, ready: false, error: error.code || 'error' };
      // 見出しの問題だけ、直すタブとマスを画面に伝える（タブの名前と、あるべき見出しだけ。申込の中身・メールは入れない）
      if (error.detail && (error.code === 'headers' || error.code === 'missing')) { body.errorTab = String(error.detail.tab || ''); if (error.detail.cell) body.errorCell = String(error.detail.cell); if (error.detail.expected) body.errorExpected = String(error.detail.expected); if (error.detail.inserted) body.errorInserted = true; if (error.detail.rowGone) body.errorRowGone = true; }
    }
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>大会受付の保存先です。主催者から届いたリンクの申し込みページで申し込んでください。</p>');
}
function testComplete_(book){
  const props=PropertiesService.getScriptProperties(),requestId=props.getProperty('lastTestRequest');
  if(!requestId||props.getProperty('lastTestBuild')!==RECEPTION_BUILD)return false;
  const sheet=book.getSheetByName('テスト申込'),os=book.getSheetByName('テストOS取込用'),row=findRow_(sheet,18,requestId);
  if(!row)return false;
  const values=sheet.getRange(row,1,1,PRIVATE_HEADERS.length).getDisplayValues()[0],osRow=findRow_(os,1,values[0]);
  if(!osRow||JSON.stringify(os.getRange(osRow,1,1,OS_HEADERS.length).getDisplayValues()[0])!==JSON.stringify(osValuesOf_(values)))return false;
  const photoId=String(values[12]).match(/\/d\/([\w-]+)/);if(!photoId)return false;
  const file=DriveApp.getFileById(photoId[1]),parents=file.getParents();let inside=false;
  while(parents.hasNext())if(parents.next().getId()===props.getProperty('testFolderId'))inside=true;
  return inside&&file.getSize()>0&&!file.isTrashed()&&isPrivateOwned_(file,props.getProperty('ownerEmail'));
}
function openEntries(){
  return withLock_(function(){const resources=checkResources_();const problems=settingsProblems_(S_());if(problems.length)throw new Error(problems.join('。')+'。');if(!testComplete_(resources.book))throw new Error('先にテスト申込1件と写真の保存を確認してください。');if(Date.now()>deadlineTime_())throw new Error('締切を過ぎています。「設定」タブの申込締切を直してください。');PropertiesService.getScriptProperties().setProperties({accepting:'true',everOpened:'true'});Logger.log('受付を開始しました。ブラウザの「選手の受付をつくる」のタブにもどると、自動で確かめます。出ないときは「もう一度確かめる」を押してください。');SpreadsheetApp.flush();return true;});
}
function closeEntries(){assertOwner_();PropertiesService.getScriptProperties().setProperty('accepting','false');Logger.log('受付を停止しました。申込済みデータは残っています。');}
function deadlineTime_(){const time=Date.parse(S_().deadline+'T23:59:59+09:00');if(!Number.isFinite(time))throw entryError_('deadline','主催者が締切を設定する必要があります。',false);return time;}
function doPost(e){
  const p=(e&&e.parameter)||{};
  try{return resultPage_(saveEntry_(p),'',null,p);}
  catch(error){console.error('Tournament OS受付: '+(error.code||'storage'));return resultPage_('',error.code?(error.publicMessage||error.message):'Googleへの保存を最後まで確認できませんでした。',error,p);}
}
/**
 * 花道の区分を選んだ申込か：クラス分けが「あり」で、選ばれた区分（設定タブにある名前）に「花道」が入っているとき。
 * 花道の選手には、クラス（A/B）を聞かない：求めない・調べない・送られてきても捨てて、保存するクラスは空にする。
 */
function classFree_(p){if(!S_().classes.enabled||!S_().hanamichiRuleRow)return false;const d=findDivision_(norm_(p.division));return Boolean(d)&&isHanamichiName_(d.name);}
/** 送られた「upper／lower」の印から、設定タブの今の名前を返す。送られた文字そのものは保存しない。花道の区分のときは、送られていても空 */
function classLabel_(p){const c=S_().classes;if(!c.enabled||classFree_(p))return'';return p.fighterClass==='upper'?c.upper.name:c.lower.name;}
/** 見えない文字（向きの印・幅ゼロの空白など）を取り、改行を \n にそろえ、前後の空白を取る。画面（申し込みページ）の決まりと同じ。フォームの送信は、改行を \r\n にするので、そろえないと文字数が1つずつ増える。 */
function norm_(value){return String(value==null?'':value).replace(/\r\n?/g,'\n').replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g,'').trim();}
const FIELD_JA_={gym:'ジム名',name:'選手名',height:'身長',weight:'体重',record:'戦績',grade:'学年',age:'年齢',comment:'意気込み',musicUrl:'入場曲のリンク',contactName:'お名前',contactPhone:'電話番号',contactEmail:'メールアドレス',photoDataUrl:'写真',requestId:'申込を確認する番号'};
function text_(p,key,max,required){const text=norm_(p[key]);if((required&&!text)||text.length>max)throw entryError_('input','入力内容を確認して、申し込みページへ戻ってください。'+(FIELD_JA_[key]?'（直す所：'+FIELD_JA_[key]+'）':''),false);return text;}
/** メールアドレスの形（画面と同じ）。< > ( ) \" ' 空白 , ; は不可。@は1つ。ドメインは「.」で区切った2つ以上で、空の部分・「-」で始まる／終わる部分は不可。いちばん後ろは英字2文字以上。 */
function emailOk_(v){
  v=String(v==null?'':v);
  if(/[<>()"'\s,;\u3000]/.test(v))return false;
  const at=v.split('@');if(at.length!==2||!at[0])return false;
  const labels=at[1].split('.');if(labels.length<2)return false;
  for(let i=0;i<labels.length;i++){const l=labels[i];if(!/^[a-z0-9-]+$/i.test(l)||l.charAt(0)==='-'||l.charAt(l.length-1)==='-')return false;}
  return /^(?:[a-z]{2,}|xn--[a-z0-9-]*[a-z0-9])$/i.test(labels[labels.length-1]);
}
/** クラスが選ばれているか。新しい申込のときだけ調べる（保存ずみの申込の再送は、設定が変わっていても確認だけする）。 */
function checkClass_(p){
  const cs=S_().classes;
  if(cs.enabled&&!classFree_(p)&&p.fighterClass!=='upper'&&p.fighterClass!=='lower')throw entryError_('class','クラスが選ばれていません。申込ページを開き直して、'+cs.upper.name+'か'+cs.lower.name+'を選んでから送ってください。リンクが途中で切れているかもしれません。そのときは、リンクをくれた人に、もう一度リンクをもらってください。',false);
}
/** 保存ずみの申込の再送で、クラスが「変わった」と言うのは、保存した名前がいまも設定にあって、選んだ印とちがうときだけ。 */
function classRetryOk_(stored,p){
  const c=S_().classes;
  // 花道の区分は、クラスを保存しない（送られていても捨てる）ので、くらべるものがない
  if(!c.enabled||!stored||classFree_(p))return true;
  if(stored!==c.upper.name&&stored!==c.lower.name)return true;
  checkClass_(p);
  return stored===classLabel_(p);
}
/** 区分を探す（全角・半角・大文字小文字・空白のちがいは同じ）。なければ null */
function findDivision_(name){
  const w=S_().weights,key=divisionKey_(name);
  if(!w.enabled||!key)return null;
  for(let i=0;i<w.divisions.length;i++)if(divisionKey_(w.divisions[i].name)===key)return w.divisions[i];
  return null;
}
/** 送られた区分・階級を、設定タブのいまの名前にそろえて返す。階級分けをしない大会は、どちらも空。選ばれていない・設定にないときは投げる。送られた文字そのものは保存しない。 */
function weightPick_(p){
  if(!S_().weights.enabled)return{division:'',weightClass:''};
  const d=findDivision_(norm_(p.division));
  if(!d)throw entryError_('weight','出場区分が選ばれていません。申込ページを開き直して、出場区分を選んでから送ってください。リンクが途中で切れているかもしれません。そのときは、リンクをくれた人に、もう一度リンクをもらってください。',false);
  if(!d.classes.length)return{division:d.name,weightClass:''};
  const canon=weightCanon_(norm_(p.weightClass)).toLowerCase();
  const found=canon?d.classes.filter(function(c){return c.toLowerCase()===canon;})[0]:'';
  if(!found)throw entryError_('weight','階級が選ばれていません。申込ページを開き直して、「'+d.name+'」の階級を選んでから送ってください。リンクが途中で切れているかもしれません。そのときは、リンクをくれた人に、もう一度リンクをもらってください。',false);
  return{division:d.name,weightClass:found};
}
/** 保存ずみの申込の再送で、区分・階級が「変わった」と言うのは、保存した区分・階級がいまも設定にあって、選んだものとちがうときだけ。 */
function weightRetryOk_(storedDivision,storedClass,p){
  if(!S_().weights.enabled||!storedDivision)return true;
  const d=findDivision_(storedDivision);
  if(!d)return true;
  // 送られた区分が、保存した区分と同じか（投げずに比べる。設定が変わったあとの再送で、「保存していない」と言わないため）
  if(divisionKey_(norm_(p.division))!==divisionKey_(d.name))return false;
  if(!d.classes.length||!storedClass)return true;
  const stored=weightCanon_(storedClass).toLowerCase();
  if(!d.classes.some(function(c){return c.toLowerCase()===stored;}))return true;
  return weightCanon_(norm_(p.weightClass)).toLowerCase()===stored;
}
/** 電話番号：画面と同じ規則の安全網。数字だけにして、0から始まる10〜11けた／同じ数字だけ・フリーダイヤルは不可／携帯は11けた。 */
function phoneOk_(raw){
  const d=norm_(String(raw==null?'':raw).normalize('NFKC')).replace(/[\s\-ー－―‐‑–—−]/g,'');
  // 10けた（固定電話など）か、11けた（050・070・080・090の携帯）。「00」で始まる番号は無い
  if(!/^(?:0[5789]0\d{8}|0[1-9]\d{8})$/.test(d))return false;
  if(/^(\d)\1+$/.test(d)||/^0(120|800)/.test(d))return false;
  return !(/^0[5789]0/.test(d)&&d.length!==11);
}
function validateEntry_(p){
  // 見えない文字・改行（\r\n）をそろえてから調べる。あとで保存する値も、同じそろえかたになる
  ['requestId','gym','name','grade','age','height','weight','record','comment','musicUrl','contactName','contactPhone','contactEmail','division','weightClass'].concat(PLEDGE_POST_KEYS_).forEach(function(key){if(p[key]!=null)p[key]=norm_(p[key]);});
  if((p.protocol!=='2'&&p.protocol!=='3')||p.eventId!==S_().eventId||(p.mode!=='test'&&p.mode!=='live'))throw entryError_('event','大会の申し込みリンクが違います。主催者から新しいリンクをもらってください。',false);
  if(p.website)throw entryError_('spam','送信を受け付けられませんでした。',false);
  if(p.consent!=='yes')throw entryError_('consent','個人情報の取扱いへの同意が必要です。申込ページにもどって、同意のチェックを入れてください。',false);
  const request=text_(p,'requestId',100,true);if(!/^[\w-]{32,100}$/.test(request))throw entryError_('input','申込を確認する番号が正しくありません。',false);
  // くわしい戦績（送られたときだけ）。決まりに合わなければ、何も書かずに断る。合っていれば、record をキックの1行にそろえてから、下の文字数の検査をする
  recordDetailCheck_(p);
  const limits={gym:120,name:80,height:10,weight:10,record:300,contactName:100,contactPhone:30,contactEmail:200,photoDataUrl:1800100};
  Object.keys(limits).forEach(function(key){text_(p,key,limits[key],true);});
  // ジムに所属していない人は参加できない（「無所属」「なし」などの言い方を断る。画面でも同じ言葉で断っている）
  if(isUnaffiliated_(p.gym))throw entryError_('input','申込ページにもどって、ジム名を直してください。'+UNAFFILIATED_TEXT_,false);
  const height=Number(p.height),weight=Number(p.weight);
  if(!Number.isFinite(height)||height<50||height>250||!Number.isFinite(weight)||weight<10||weight>250||!phoneOk_(p.contactPhone)||!emailOk_(p.contactEmail))throw entryError_('input','身長・体重・電話番号・メールアドレスを確認してください。',false);
  if(p.age&&(!/^\d{1,3}$/.test(p.age)||Number(p.age)<1||Number(p.age)>120))throw entryError_('input','年齢を確認してください。',false);
  ['grade','age','comment'].forEach(function(key){text_(p,key,key==='comment'?500:30,S_()[key]==='required');});
  if(S_().music&&!/^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//i.test(text_(p,'musicUrl',500,true)))throw entryError_('input','入場曲はApple MusicかYouTubeのURLを入力してください。',false);
  // 花道の追加情報：設定が「あり」で、花道の区分を選んだときだけ調べる（ほかの区分で花道の値が送られても、調べず、保存せず、捨てる）
  if(hanamichiApplies_(p)){const found=hanamichiErrors_(hanamichiClean_(p));if(found.missing.length)throw entryError_('hanamichi',HANAMICHI_MISSING_,false);if(found.bad.length)throw entryError_('hanamichi',HANAMICHI_BAD_,false);}
  return request;
}
function saveEntry_(p){
  assertOwner_();const requestId=validateEntry_(p);
  return withLock_(function(){
    const props=PropertiesService.getScriptProperties(),resources=checkResources_(),isTest=p.mode==='test';
    const sheet=resources.book.getSheetByName(isTest?'テスト申込':'申込原本（個人情報あり）'),os=resources.book.getSheetByName(isTest?'テストOS取込用':'OS取込用（連絡先なし）');
    if(!sheet||!os)throw adminError_('setup','申込表が見つかりません。「① 最初の設定」を押してください。');
    // 花道の追加情報（設定が「あり」で、花道の区分のときだけ）。タブが無ければ、何も書かずに止まる
    const hn=hanamichiApplies_(p),hnSheet=hn?resources.book.getSheetByName(HANAMICHI_TABLES_[isTest?1:0][0]):null;
    if(hn&&!hnSheet)throw adminError_('setup','花道プロフィールのタブが見つかりません。「① 最初の設定」を押してください。');
    // 誓約書（「あり」のときだけ）。誓約の記録のタブが無ければ、何も書かずに止まる
    const plSheet=S_().pledge?resources.book.getSheetByName(PLEDGE_TABLES_[isTest?1:0][0]):null;let pledgeRec=null;
    if(S_().pledge&&!plSheet)throw adminError_('setup','誓約記録のタブが見つかりません。「① 最初の設定」を押してください。');
    // くわしい戦績（送られたときだけ）。決まりを確かめ、「戦績詳細」の表を用意する（見出しがちがうときは、何も書かずに止まる）
    const detail=recordDetailCheck_(p),detailSheet=detail?recordDetailSheetOf_(resources.book,isTest):null;
    // 本番の受付中に、設定タブが壊れたら（空にされた・名前が同じになった等）、新しい申込を受けない。選手には「少し待って」と言う
    if(!isTest&&settingsProblems_(S_()).length)throw entryError_('setup','ただいま受付を調整しています。少し待ってからもう一度送ってください。',true);
    const existing=findRow_(sheet,18,requestId);let values;
    if(existing){
      values=sheet.getRange(existing,1,1,PRIVATE_HEADERS.length).getDisplayValues()[0];
      // 保存のときに付く守りの「'」や、改行の形（CRLF／LF）のちがいは、「変わった」ではない。両方を同じ形にそろえてくらべる
      const same=function(a,b){return JSON.stringify(a.map(retryNorm_))===JSON.stringify(b.map(retryNorm_));};
      // いまの設定が「なし」の項目（学年・年齢・意気込み・入場曲）は、くらべない（保存したあとに、会長が「なし」に変えても、同じ内容の再送を「変わった」と断らない）。「なし」の項目は、保存したままの値と同じとして扱う
      const kept=function(off,index,text){return off?String(values[3+index]||''):text;};
      const expected=[String(p.gym).trim(),String(p.name).trim(),kept(S_().grade==='off',2,String(p.grade||'').trim()),kept(S_().age==='off',3,String(p.age||'').trim()),String(Number(p.height)),String(Number(p.weight)),String(p.record).trim(),kept(S_().comment==='off',7,String(p.comment||'').trim()),kept(!S_().music,8,String(p.musicUrl||'').trim())];
      if(!same(values.slice(3,12),expected)||!same(values.slice(13,17),[String(p.contactName).trim(),String(p.contactPhone).trim(),String(p.contactEmail).trim(),'yes'])||!classRetryOk_(String(values[18]||''),p)||!weightRetryOk_(String(values[19]||''),String(values[20]||''),p))throw entryError_('changed','送信後に入力内容が変わっています。新しく申し込み直さず、主催者へ訂正を依頼してください。',false);
      const photoUrl=savePhoto_(props.getProperty(isTest?'testFolderId':'photoFolderId'),values[0],p.photoDataUrl,true);
      if(photoUrl!==values[12])throw entryError_('photo','保存済みの写真と申込表が一致しません。主催者へご連絡ください。',false);
      // 前の送信が、誓約の記録の前で止まっていたら、再送で記録を足す（誓約書の鍵が付いているときだけ。記録がすでにあれば、何もしない）
      if(plSheet&&!findRow_(plSheet,1,values[0])&&pledgeKeysSent_(p))pledgeRec=pledgeCheck_(p);
    }
    else{
      checkClass_(p);
      const weightChoice=weightPick_(p);
      pledgeRec=pledgeCheck_(p);
      if(!isTest&&(props.getProperty('accepting')!=='true'||Date.now()>deadlineTime_()))throw entryError_('closed','現在、申し込みを受け付けていません。主催者へご連絡ください。',false);
      if(sheet.getLastRow()>3000)throw entryError_('capacity','受付件数が上限に達しました。主催者へご連絡ください。',false);
      const minute=String(Math.floor(Date.now()/60000)),count=props.getProperty('rateMinute')===minute?Number(props.getProperty('rateCount')||0):0;
      if(count>=30)throw entryError_('busy','受付が混み合っています。少し待ってください。',true);
      props.setProperties({rateMinute:minute,rateCount:String(count+1)});
      const receiptNo=receipt_(requestId,isTest),photoUrl=savePhoto_(props.getProperty(isTest?'testFolderId':'photoFolderId'),receiptNo,p.photoDataUrl);
      const common=[clean_(p.gym,120),clean_(p.name,80),S_().grade==='off'?'':clean_(p.grade,30),S_().age==='off'?'':clean_(p.age,3),String(Number(p.height)),String(Number(p.weight)),clean_(p.record,300),S_().comment==='off'?'':clean_(p.comment,500),S_().music?clean_(p.musicUrl,500):'',photoUrl];
      values=[receiptNo,new Date(),S_().eventId].concat(common).concat([clean_(p.contactName,100),clean_(p.contactPhone,30),clean_(p.contactEmail,200),'yes',requestId,clean_(classLabel_(p),40),clean_(weightChoice.division,40),clean_(weightChoice.weightClass,40)]);
      // Googleの自動変換で電話番号の先頭0や数字だけの選手名を失わない。
      const newRow=sheet.getLastRow()+1;
      ensureRows_(sheet,newRow);
      sheet.getRange(newRow,3,1,PRIVATE_HEADERS.length-2).setNumberFormat('@');
      sheet.getRange(newRow,1,1,PRIVATE_HEADERS.length).setValues([values]);
      // 実際に書かれた電話番号が送った文字と違えば（先頭0が消えた等）、文字として書き直す。
      const phoneCell=sheet.getRange(newRow,15);
      if(phoneCell.getDisplayValue()!==String(values[14])){phoneCell.setNumberFormat('@').setValue(String(values[14]));}
      values=sheet.getRange(findRow_(sheet,18,requestId),1,1,PRIVATE_HEADERS.length).getDisplayValues()[0];
    }
    const osValues=osValuesOf_(values).map(function(value){return clean_(value,2000);}),osRow=findRow_(os,1,values[0]);
    if(!osRow)ensureRows_(os,os.getLastRow()+1);
    os.getRange(osRow||os.getLastRow()+1,1,1,OS_HEADERS.length).setNumberFormat('@');
    if(osRow)os.getRange(osRow,1,1,OS_HEADERS.length).setValues([osValues]);else os.appendRow(osValues);
    SpreadsheetApp.flush();
    const savedRow=findRow_(os,1,values[0]);
    if(!savedRow||JSON.stringify(os.getRange(savedRow,1,1,OS_HEADERS.length).getDisplayValues()[0])!==JSON.stringify(osValuesOf_(values)))throw entryError_('storage','大会用の名簿の保存を確認できませんでした。',true);
    // 既存の行を書いたあとに、花道プロフィールへ1行（同じ受付番号の行があれば、何もしない）
    if(hn)saveHanamichiRow_(hnSheet,values,p);
    // 誓約の記録は、その次に1行（同じ受付番号の行があれば、何もしない）
    if(plSheet&&pledgeRec)savePledgeRow_(plSheet,values,pledgeRec);
    // くわしい戦績の行は、いちばん最後に（同じ受付番号の行があれば、何もしない）
    if(detail&&detailSheet)recordDetailSaveRows_(detailSheet,values,detail);
    if(isTest){props.setProperty('lastTestBuild',RECEPTION_BUILD);props.setProperty('lastTestRequest',requestId);}
    return values[0];
  });
}
/** 申込原本の1行から、OS取込用の1行（連絡先なし）を作る：管理番号・ジム名〜写真URL・クラス・区分・階級 */
function osValuesOf_(values){return[values[0]].concat(values.slice(3,13),[values[18],values[19],values[20]]);}
/**
 * 書く行（lastRow）が、いまのタブの行数をこえるときは、先に行を足す。足さないと、書き込みが範囲の外で止まり、受付番号が出ない
 * （「① 最初の設定」で作ったタブは1000行しかない。くわしい戦績は1件で最大11行書くので、いちばん先に足りなくなる）。appendRow は、自分で足すので、要らない。
 */
function ensureRows_(sheet, lastRow) {
  if (typeof sheet.getMaxRows !== 'function' || typeof sheet.insertRowsAfter !== 'function') return;
  const max = sheet.getMaxRows();
  if (max < lastRow) sheet.insertRowsAfter(max, lastRow - max);
}
function findRow_(sheet,column,value){if(sheet.getLastRow()<2)return 0;const values=sheet.getRange(2,column,sheet.getLastRow()-1,1).getDisplayValues();for(let i=0;i<values.length;i++)if(values[i][0]===value)return i+2;return 0;}
function savePhoto_(folderId,receiptNo,dataUrl,requireExisting){
  const match=String(dataUrl).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if(!match||match[1].length>1800000)throw entryError_('photo','写真を選び直してください。',false);
  const bytes=Utilities.base64Decode(match[1]);
  if(bytes.length<4||(bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[bytes.length-2]&255)!==255||(bytes[bytes.length-1]&255)!==217)throw entryError_('photo','写真を読み取れませんでした。',false);
  const folder=folderOf_(folderId),files=folder.getFilesByName(receiptNo+'.jpg');
  if(files.hasNext()){
    const file=files.next();if(file.isTrashed()||!isPrivateOwned_(file,assertOwner_())||!file.getSize())throw entryError_('photo','写真の保存先を主催者が確認する必要があります。',false);
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
/** 再送のくらべ用：改行をそろえ、clean_ が付けた先頭の「'」（= + - @ の守り）をはずす */
function retryNorm_(value){let text=String(value==null?'':value).replace(/\r\n?/g,'\n').trim();if(/^'[=+\-@]/.test(text))text=text.slice(1);return text;}
function clean_(value,max){const text=norm_(value).slice(0,max);return/^[=+\-@]/.test(text)?"'"+text:text;}
function escape_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}
function resultPage_(receiptNo,message,error,p){
  const success=Boolean(receiptNo),retry=!success&&(!error||error.retryable!==false);
  // まだ保存されていないと言い切れる失敗だけ「送れませんでした」。保存ずみかもしれない失敗（再送・写真）は、確認が必要と言う
  const notSaved=!success&&!retry&&Boolean(error)&&['input','event','spam','consent','class','weight','hanamichi','closed','capacity','setup','headers','missing','sharing','owner','folder','pledge','pledgeconfirm','pledgeold','gym','permission'].indexOf(error.code)>=0;
  // 色と言葉の約束：成功は緑と ✓、失敗は赤と ✕、確認が必要なのは黄色と ⚠（色だけで伝えない）
  const tone=success?'ok':notSaved?'bad':'warn';
  const mark=success?'✓ ':notSaved?'✕ ':'⚠ ';
  const title=success?'申し込みが完了しました':notSaved?'送れませんでした':'保存結果の確認が必要です';
  const frame={ok:'#bbf7d0',bad:'#b91c1c',warn:'#ca8a04'}[tone],fill={ok:'#ffffff',bad:'#fef2f2',warn:'#fefce8'}[tone];
  const detail=success?(p.mode==='test'?'テスト受付番号：':'受付番号：')+receiptNo:message;let retryForm='';
  // 問い合わせ先は、主催者が「設定」タブに書いた、選手に見せてよいもの。読めないときは出さない
  let contact='';try{contact=String(S_().contact||'');}catch(_){contact='';}
  if(retry){const endpoint=ScriptApp.getService().getUrl();if(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint||'')){
    const fields=['protocol','eventId','entryKey','mode','requestId','gym','name','grade','age','height','weight','record','comment','musicUrl','contactName','contactPhone','contactEmail','consent','fighterClass','division','weightClass','photoDataUrl'];
    // 花道の追加情報を聞く申込のときだけ、花道の12項目も、そのまま送り直す（なしのときは、これまでと同じ鍵だけ）
    let hnFields=[];try{if(hanamichiApplies_(p))hnFields=HANAMICHI_ITEMS_.map(function(item){return item.key;});}catch(_){hnFields=[];}
    // 誓約書が「あり」のときだけ、誓約書の鍵も、そのまま送り直す（なしのときは、これまでと同じ鍵だけ）
    let plFields=[];try{if(S_().pledge)plFields=PLEDGE_POST_KEYS_;}catch(_){plFields=[];}
    // くわしい戦績が送られたときだけ、その欄も送り直す（なしのときは、これまでと同じ鍵だけ）
    let rdFields=[];try{if(recordDetailSent_(p))rdFields=['recordDetail'];}catch(_){rdFields=[];}
    retryForm='<p>新しく申し込み直さず、下のボタンを押してください。同じ内容で、保存を確認・再開します。</p><form method="post" target="_top" action="'+escape_(endpoint)+'">'+fields.concat(hnFields,plFields,rdFields).map(function(key){return'<input type="hidden" name="'+key+'" value="'+escape_(String(p[key]||'').slice(0,key==='photoDataUrl'?1800100:key==='recordDetail'?20000:500))+'">';}).join('')+'<button>同じ申込を確認・再開する</button></form>';}}
  const guide=success?'受付番号が出ています。この画面の写真をとってください。この画面は閉じて大丈夫です。':notSaved?'受付番号は出ていません。直せるときは、ブラウザの「戻る」で申込ページにもどって直し、もう一度送ります。直せないときは、下の問い合わせ先へご連絡ください。':'受付番号が出るまで完了ではありません。解決しない場合は、下の問い合わせ先へご連絡ください。';
  const contactLine=contact?'<p>問い合わせ：'+escape_(contact)+'</p>':'';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:32px 16px;background:#f1f5f9;color:#0f172a;text-align:center}.box{max-width:540px;margin:auto;border:4px solid '+frame+';border-radius:24px;padding:28px;background:'+fill+'}h1{font-size:26px}b{display:block;margin:20px 0;font-size:20px;overflow-wrap:anywhere}button{font-size:18px;font-weight:bold;padding:18px;border:0;border-radius:14px;background:#1d4ed8;color:white}p{line-height:1.8}</style></head><body><main class="box"><h1>'+mark+title+'</h1><b>'+escape_(detail)+'</b>'+retryForm+'<p>'+guide+'</p>'+contactLine+'</main></body></html>').setTitle(title).addMetaTag('viewport','width=device-width,initial-scale=1');
}
/** 主催者がOS用名簿と写真を自分のDriveへZIP保存する。連絡先は含めない。 */
function exportTournament(){
  return withLock_(function(){
    const resources=checkResources_(),sheet=resources.book.getSheetByName('OS取込用（連絡先なし）'),rows=sheet.getDataRange().getDisplayValues();
    if(rows.length<2)throw new Error('本番の申し込みはまだありません。テスト申込はこのファイルに混ぜません。');
    return exportRows_(rows,resources.folder,'Tournament_OS_',recordsCsvOf_(resources.book));
  });
}
/** 最後に保存確認できたテスト1件だけを、テスト写真フォルダへ書き出す。 */
function exportTestTournament(){
  return withLock_(function(){
    const resources=checkResources_(),props=PropertiesService.getScriptProperties();
    if(!testComplete_(resources.book))throw new Error('先にテスト申込1件と写真の保存を確認してください。');
    const original=resources.book.getSheetByName('テスト申込'),sourceRow=findRow_(original,18,props.getProperty('lastTestRequest'));
    const receipt=original.getRange(sourceRow,1).getDisplayValues()[0][0],sheet=resources.book.getSheetByName('テストOS取込用'),row=findRow_(sheet,1,receipt);
    const rows=[sheet.getRange(1,1,1,OS_HEADERS.length).getDisplayValues()[0],sheet.getRange(row,1,1,OS_HEADERS.length).getDisplayValues()[0]];
    return exportRows_(rows,DriveApp.getFolderById(props.getProperty('testFolderId')),'TEST_Tournament_OS_');
  });
}
function exportRows_(rows,folder,prefix,recordsCsv){
    // 右のはしの列（クラス・区分・階級）は、見出しがそろっている列だけ、CSVに付ける（古い表は、足りない列を付けない）。区分・階級は、階級分けが「あり」か、中身があるときだけ（使わない大会のCSVは、これまでと同じ形）
    const weightOn=S_().weights.enabled,used=function(i){return rows.slice(1).some(function(r){return String(r[i]||'')!=='';});},extra=[11,12,13].filter(function(i){return rows[0].length>i&&String(rows[0][i])===OS_HEADERS[i]&&(i===11||weightOn||used(i));}),csvRows=rows.map(function(r){return r.slice(0,10).concat(extra.map(function(i){return r[i];}));});
    const csv='\uFEFF'+csvRows.map(function(row){return row.map(function(cell){return'"'+clean_(cell,2000).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    const files=[Utilities.newBlob(csv,'text/csv','players.csv')];
    let totalBytes=csv.length*3;
    // くわしい戦績（records.csv）は、「戦績詳細」の表に行があるときだけ、players.csv のあとに付く（recordsCsvOf_ が '' のときは付けない）
    if(recordsCsv){files.push(Utilities.newBlob(recordsCsv,'text/csv','records.csv'));totalBytes+=recordsCsv.length*3;}
    rows.slice(1).forEach(function(row){const who='受付番号 '+row[0]+'（'+String(row[2]||'').slice(0,20)+'）';const id=String(row[10]).match(/\/d\/([\w-]+)/);if(!id)throw new Error('写真が見つかりません。'+who);let file;try{file=DriveApp.getFileById(id[1]);}catch(_){throw new Error(who+' の写真が見つかりません（Googleドライブから消えています）。Googleドライブのゴミ箱に入っていないか、見てください。');}if(file.isTrashed())throw new Error(who+' の写真が、Googleドライブのゴミ箱に入っています。ゴミ箱を開いて「元に戻す」を押してから、もう一度やってください。');if(!isPrivateOwned_(file,assertOwner_()))throw new Error(who+' の写真の共有が、「制限付き」になっていません。写真の共有を「制限付き」に直してから、もう一度やってください。');totalBytes+=file.getSize();if(totalBytes>80*1024*1024)throw new Error('写真の合計が80MBを超えています。大会名簿を分けて保存する必要があります。');files.push(file.getBlob().setName('photos/'+row[0]+'.jpg'));});
    const zipName=prefix+S_().eventId+'.zip', older=[], found=folder.getFilesByName(zipName);
    while(found.hasNext())older.push(found.next());
    const zip=folder.createFile(Utilities.zip(files,zipName));
    // 同じ名前のZIPを増やさない：前に作った同じ名前のZIPは、新しいZIPができたあとで、ゴミ箱に移す（ゴミ箱から戻せる）
    older.forEach(function(file){try{if(file.getId()!==zip.getId())file.setTrashed(true);}catch(_){/* ゴミ箱に移せなくても、新しいZIPは使える */}});
    Logger.log('OSへ取り込むファイル: '+zip.getUrl());Logger.log('リンクを開き、ダウンロードしたZIPを大会準備画面で選んでください。');return zip.getUrl();
}

