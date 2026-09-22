#!/usr/bin/env node
/* ------------------------------------------------------------------
   UIZIN 大会当日 受付〜計量 書類ビルダー
   実行: node docs/uizin-2026/build.mjs
   出力: docs/uizin-2026/print/*.html （PDF化は同ディレクトリの README 参照）

   変更したいときはここだけ直す:
     - 大会名・開催日        → CONFIG
     - 選手名・契約体重      → roster.csv（最終対戦カードの契約体重を入れる）
     - 2点減点の識別色       → CONFIG.deduct2Color（未確定なので既定は枠のみ）
   ------------------------------------------------------------------ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'print');
mkdirSync(OUT, { recursive: true });

const CONFIG = {
  eventName: 'UIZIN',
  eventDate: '2026年9月23日',
  athletes: 88,
  stickerPrefix: 'あお',
  // 2点減点の識別方法は主催者未確定。決まったら色コードを入れて再ビルドする。
  deduct2Color: null, // 例: '#E8380D'
};

// 計量ペナルティ（最新決定。＋2kg以上は「中止」ではなく「要相談」）
const PENALTY = [
  ['＋500g以内', 'OK・減点なし'],
  ['＋501g〜999g', '1点減点'],
  ['＋1.0kg〜1.999kg', '2点減点'],
  ['＋2kg以上', '要相談'],
];

/* ---------- roster.csv 読み込み ---------- */
function loadRoster() {
  const raw = readFileSync(join(HERE, 'roster.csv'), 'utf8').trim().split(/\r?\n/);
  const rows = raw.slice(1).map((line) => {
    const [no, name, gym, weight] = line.split(',').map((v) => (v ?? '').trim());
    return { no: Number(no), name, gym, weight };
  });
  const byNo = new Map(rows.map((r) => [r.no, r]));
  return Array.from({ length: CONFIG.athletes }, (_, i) => byNo.get(i + 1) ?? { no: i + 1, name: '', gym: '', weight: '' });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 共通CSS（A4・白背景・白黒印刷対応・太字と罫線中心） ---------- */
const BASE_CSS = (orientation = 'portrait') => `
  @page { size: A4 ${orientation}; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo",
                 "Noto Sans JP", "IPAPGothic", "IPAGothic", sans-serif;
    color: #000; background: #eee;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    width: 210mm; height: 297mm; padding: 9mm 11mm;
    margin: 0 auto; background: #fff; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: flex-end; justify-content: space-between;
          border-bottom: 2.4px solid #000; padding-bottom: 2mm; flex: 0 0 auto; }
  .brand { font-size: 10.5pt; font-weight: 700; letter-spacing: .2em; }
  .doc-title { font-size: 16pt; font-weight: 700; letter-spacing: .06em; margin-top: .6mm; }
  .head-right { font-size: 8pt; text-align: right; line-height: 1.6; white-space: nowrap; }
  .head-right .big { font-size: 10pt; font-weight: 700; }
  .fillbox { display: inline-block; min-width: 26mm; border-bottom: 1px solid #555; }
  .sec-title { font-size: 9.6pt; font-weight: 700; background: #000; color: #fff;
               padding: .9mm 2.4mm; letter-spacing: .05em; }
  .sec-title .sub { font-weight: 400; font-size: 7.8pt; letter-spacing: 0; }
  .sec-body { border: 1px solid #000; border-top: none; padding: 2mm 2.6mm 1.2mm; }
  .chk { list-style: none; }
  .chk li { display: flex; align-items: flex-start; gap: 2mm; margin-bottom: 1.3mm;
            font-size: 8.8pt; line-height: 1.35; }
  .chk li::before { content: ""; flex: 0 0 auto; width: 3.4mm; height: 3.4mm;
                    border: 1.3px solid #000; margin-top: .4mm; }
  .chk.plain li::before { display: none; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; page-break-after: always; } .sheet:last-child { page-break-after: auto; } }
  @media screen { .sheet { box-shadow: 0 2px 14px rgba(0,0,0,.25); margin: 7mm auto; } }
`;

const page = (title, css, bodyHtml, orientation = 'portrait') => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS(orientation)}${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;

const penaltyCells = () => PENALTY.map(([d, r]) =>
  `<div class="pcell"><div class="pd">${esc(d)}</div><div class="pr">${esc(r)}</div></div>`).join('');

const PENALTY_CSS = `
  .ptable { display: flex; border: 1.6px solid #000; }
  .pcell { flex: 1; border-left: 1px solid #000; text-align: center; padding: 1mm .5mm; }
  .pcell:first-child { border-left: none; }
  .pcell .pd { font-size: 8.4pt; font-weight: 700; }
  .pcell .pr { font-size: 8.6pt; font-weight: 700; margin-top: .3mm; }
`;

/* ==================================================================
   A｜メディカルチェック＆参加誓約書＆保護者同意書（A4縦1枚・選手1名につき1枚）
   ================================================================== */
function buildA() {
  const css = `
    .sheet { font-size: 8.8pt; line-height: 1.38; }
    .lead { font-size: 8.6pt; margin: 1.8mm 0 1.8mm; }
    .sec { margin-top: 2mm; }
    .row { display: flex; gap: 3mm; }
    .fld { flex: 1; margin-bottom: 1.4mm; }
    .fld .name { font-size: 7.4pt; color: #333; }
    .fld .line { border-bottom: 1px solid #333; height: 5.8mm; }
    .fld.w2 { flex: 2; }
    .fld.sm { flex: .7; }
    .chk li { margin-bottom: 1.1mm; }
    .grp { font-size: 8.4pt; font-weight: 700; border-bottom: 1.2px solid #000;
           margin: 0 0 1.2mm; padding-bottom: .4mm; }
    .grp.second { margin-top: 2mm; }
    .note { font-size: 7.8pt; margin-top: .8mm; }
    .warn { font-weight: 700; }
    .wbar { margin-top: 2mm; border: 1.6px solid #000; padding: 1.4mm 2.4mm; font-size: 8.2pt; line-height: 1.45; }
    .wbar .h { font-weight: 700; font-size: 8.8pt; }
    .wbar .p { font-weight: 700; }
    .sign { margin-top: 2.2mm; border: 2px solid #000; padding: 1.8mm 3mm 1.4mm; }
    .sign p { font-size: 8.8pt; margin-bottom: 1.4mm; }
    .sign .must { font-weight: 700; }
    .sign-row { display: flex; gap: 4mm; align-items: flex-end; }
    .inline { display: flex; align-items: flex-end; border-bottom: 1px solid #333; height: 8.4mm; font-size: 9pt; padding-bottom: .6mm; }
    .inline .gap { display: inline-block; min-width: 9mm; }
    .inline .gap.s { min-width: 6mm; }
    .sign .line { height: 8.4mm; border-bottom: 1px solid #333; }
    .staffbox { margin-top: 2.2mm; border: 1.6px solid #000; }
    .staffbox .t { font-size: 8.4pt; font-weight: 700; background: #000; color: #fff; padding: .7mm 2.4mm; }
    .staffbox .b { display: flex; }
    .staffbox .c { flex: 1; border-left: 1px solid #000; padding: 1.2mm 2mm; font-size: 7.8pt; line-height: 1.5; }
    .staffbox .c:first-child { border-left: none; }
    .sq { display: inline-block; width: 3mm; height: 3mm; border: 1.2px solid #000; vertical-align: -.3mm; margin-right: .8mm; }
    .foot { margin-top: auto; flex: 0 0 auto; padding-top: 1.4mm; border-top: 1px solid #999; font-size: 7pt; color: #333; line-height: 1.5; }
  `;

  const medical = [
    '発熱はありません（37.5℃以上ではない）。',
    '強い体調不良（頭痛・吐き気・めまい・腹痛など）はありません。',
    '試合に支障がある痛み・ケガ（骨折・捻挫・打撲など）はありません。',
    '頭部の強い打撲や脳の異常について、医師から運動を止められていません。',
    '治療中の病気・服薬について、医師から運動を止められていません。',
    '食事・水分・睡眠がとれています。無理な減量はしていません。',
  ];
  const pledge = [
    '大会ルールと、スタッフ・主催者の指示に従います。',
    'レフェリーの判断、ジャッジの判定、ダウン判定、減点、試合停止、勝敗、大会運営上の最終判断に従います。',
    '安全を理由とする試合の停止・中止の判断に従います。',
    '公平で安全な大会運営のため、試合終了後に判定を変更するための異議・不服申し立ては行いません。',
  ];
  const risk = [
    'キックボクシングは打撃をともなう競技です。安全対策を行っても、打撲・鼻血・捻挫・骨折・頭部への衝撃などのケガが起こる可能性を理解しています。',
    '競技に通常ともなうリスクを理解した上で、本人を参加させます。',
    'なお、主催者・スタッフの故意または重大な過失による場合は、この確認の対象ではありません。',
  ];
  const photo = [
    '大会会場内で撮影された写真・映像が、大会記録・SNS・Web・YouTube・広報などに利用されることに同意します。',
    'イベント全体を撮影するため、特定の選手だけを撮影しない個別対応はできない場合があることを理解しています。',
    '利用の範囲は、大会運営・大会記録・広報に必要な範囲に限られます（肖像権の全面的な放棄ではありません）。',
  ];
  const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join('');

  const body = `
<div class="sheet">
  <div class="head">
    <div>
      <div class="brand">${esc(CONFIG.eventName)}</div>
      <div class="doc-title">メディカルチェック／参加誓約書／保護者同意書</div>
    </div>
    <div class="head-right">
      <div class="big">${esc(CONFIG.eventDate)}</div>
      <div>受付No. <span class="fillbox" style="min-width:18mm"></span></div>
    </div>
  </div>

  <p class="lead">
    この用紙1枚で「体調の確認」「参加の誓約」「保護者の同意」を確認します。<br>
    <span class="warn">保護者の方は内容をお読みいただき、最後の欄にご署名をお願いします。</span>署名がない場合、試合に出場できません。
  </p>

  <div class="sec">
    <div class="sec-title">選手・保護者</div>
    <div class="sec-body">
      <div class="row">
        <div class="fld w2"><div class="name">選手名（ふりがな）</div><div class="line"></div></div>
        <div class="fld w2"><div class="name">所属ジム</div><div class="line"></div></div>
        <div class="fld sm"><div class="name">学年／年齢</div><div class="line"></div></div>
      </div>
      <div class="row">
        <div class="fld w2"><div class="name">保護者氏名</div><div class="line"></div></div>
        <div class="fld sm"><div class="name">続柄</div><div class="line"></div></div>
        <div class="fld w2"><div class="name">当日つながる電話番号</div><div class="line"></div></div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">① メディカルチェック <span class="sub">／ 当てはまらない項目の□にチェックしてください</span></div>
    <div class="sec-body">
      <ul class="chk">${li(medical)}</ul>
      <p class="note warn">1つでも当てはまる場合は、チェックせずスタッフへお伝えください。主催者・レフェリーが確認します。</p>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">② 参加にあたっての確認事項 <span class="sub">／ 内容を読んで□にチェック</span></div>
    <div class="sec-body">
      <div class="grp">ルール・判定について</div>
      <ul class="chk">${li(pledge)}</ul>
      <div class="grp second">ケガの可能性について</div>
      <ul class="chk">${li(risk)}</ul>
      <div class="grp second">写真・映像の利用について（肖像権）</div>
      <ul class="chk">${li(photo)}</ul>
    </div>
  </div>

  <div class="wbar">
    <span class="h">③ 計量について</span>　着衣計量です。契約体重は<b>最終対戦カードの数値</b>です（申込時の自己申告体重ではありません）。<br>
    <span class="p">＋500g以内＝減点なし／＋501g〜999g＝1点減点／＋1.0kg〜1.999kg＝2点減点／＋2kg以上＝要相談</span>
    　＋500g以内はキッズ大会・着衣計量の許容範囲で、体重オーバー扱いにはなりません。＋2kg以上も失格ではなく、安全面・体格差を確認して主催者が判断します。
  </div>

  <div class="sign">
    <p>上記①〜③の内容を確認し、本人の大会参加に同意します。</p>
    <div class="sign-row">
      <div style="flex:1.1">
        <div style="font-size:7.4pt;color:#333">日付</div>
        <div class="inline"><span class="gap"></span>年<span class="gap s"></span>月<span class="gap s"></span>日</div>
      </div>
      <div style="flex:1.8">
        <div style="font-size:7.4pt;color:#333">保護者署名（自署）<span class="must">※未成年の選手は必須</span></div>
        <div class="line"></div>
      </div>
    </div>
  </div>

  <div class="staffbox">
    <div class="t">スタッフ記入欄（受付・計量）　※選手・保護者の記入は不要です</div>
    <div class="b">
      <div class="c">
        <span class="sq"></span>参加費 精算確認<br>
        <span class="sq"></span>書類 確認・受領
      </div>
      <div class="c">
        <span class="sq"></span>計量 実施<br>
        実測（任意）<span class="fillbox" style="min-width:15mm"></span>kg
      </div>
      <div class="c">
        判定：<span class="sq"></span>減点なし　<span class="sq"></span>1点<br>
        <span class="sq"></span>2点　<span class="sq"></span>要相談（主催者確認）
      </div>
      <div class="c">
        計量済シール　${esc(CONFIG.stickerPrefix)} <span class="fillbox" style="min-width:12mm"></span> 番<br>
        担当者 <span class="fillbox" style="min-width:17mm"></span>
      </div>
    </div>
  </div>

  <div class="foot">
    ※判定・減点・試合停止などの最終判断は、公平で安全な大会運営のために主催者・レフェリー・ジャッジが行います。<br>
    ※ご記入いただいた情報は、本大会の運営・緊急連絡の目的にのみ使用します。　※「支払い済み」「受付済み」「計量済み」は別の状態です。混同しないでください。
  </div>
</div>`;
  return page(`${CONFIG.eventName} メディカルチェック／参加誓約書／保護者同意書`, css, body);
}

/* ==================================================================
   B｜計量チェックリスト（A4縦1枚・全88名・名前／契約体重／レ点）
   ================================================================== */
function buildB() {
  const roster = loadRoster();
  const half = Math.ceil(CONFIG.athletes / 2); // 44行 × 2列
  const css = `
    ${PENALTY_CSS}
    .sheet { font-size: 8.4pt; }
    .rulebar { margin-top: 2mm; flex: 0 0 auto; }
    .rulenote { font-size: 7.4pt; margin-top: .8mm; line-height: 1.4; }
    .rulenote b { font-size: 7.8pt; }
    .cols { display: flex; gap: 3mm; margin-top: 2mm; flex: 0 0 auto; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: .8px solid #000; height: 4.95mm; padding: 0 1mm; }
    thead th { background: #000; color: #fff; font-size: 7.2pt; height: 4.6mm; }
    td.no { text-align: right; font-size: 7.4pt; width: 7mm; }
    td.nm { font-size: 8.8pt; font-weight: 700; }
    td.wt { text-align: center; font-size: 8.6pt; font-weight: 700; width: 17mm; }
    td.ms { width: 14mm; }
    td.ck { width: 9mm; }
    .foot { margin-top: auto; padding-top: 1.2mm; border-top: 1px solid #999; font-size: 7.2pt; line-height: 1.45; flex: 0 0 auto; }
    .foot b { font-size: 7.6pt; }
  `;

  const rowHtml = (r) => `<tr>
      <td class="no">${r.no}</td>
      <td class="nm">${esc(r.name)}</td>
      <td class="wt">${esc(r.weight)}</td>
      <td class="ms"></td>
      <td class="ck"></td>
    </tr>`;

  const tableHtml = (rows) => `<table>
      <thead><tr><th>No.</th><th>選手名</th><th>契約体重</th><th>実測</th><th>✓</th></tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody>
    </table>`;

  const body = `
<div class="sheet">
  <div class="head">
    <div>
      <div class="brand">${esc(CONFIG.eventName)}</div>
      <div class="doc-title">計量チェックリスト</div>
    </div>
    <div class="head-right">
      <div class="big">${esc(CONFIG.eventDate)}</div>
      <div>担当者 <span class="fillbox" style="min-width:20mm"></span></div>
    </div>
  </div>

  <div class="rulebar">
    <div class="ptable">${penaltyCells()}</div>
    <div class="rulenote">
      <b>＋500g以内は減点なし（着衣計量の許容範囲）。体重オーバー扱いにしない。</b>
      ＋2kg以上は失格ではなく<b>要相談</b>＝主催者・責任者が判断。判断に迷ったらスタッフだけで決めず主催者へ確認。<br>
      <b>契約体重は最終対戦カードの数値</b>（申込時の自己申告体重ではありません）。計量は<b>精算確認 → 書類提出のあと</b>に行います。
    </div>
  </div>

  <div class="cols">
    <div style="flex:1">${tableHtml(roster.slice(0, half))}</div>
    <div style="flex:1">${tableHtml(roster.slice(half))}</div>
  </div>

  <div class="foot">
    <b>✓の条件：</b>① 精算済　② 書類提出済（メディカル・誓約・保護者署名）　③ 計量実施　④ 減点の有無を確認　→ ✓＋<b>「${esc(CONFIG.stickerPrefix)}○番」シール</b>を渡す。<br>
    <b>「支払い済み」「受付済み」「計量済み」は別の状態。</b>混同しないでください。　※当日追加・変更の選手は空欄行または裏面に追記。
  </div>
</div>`;
  return page(`${CONFIG.eventName} 計量チェックリスト`, css, body);
}

/* ==================================================================
   C｜計量完了シール（青・あお1〜88）＋ 減点識別シール
   ================================================================== */
function buildC() {
  const BLUE = '#0B3FA8';
  const YELLOW = '#FFE800';
  const perPage = 48; // 6列 × 8行
  const css = `
    .sheet { padding: 8mm 10mm; }
    .cut { flex: 0 0 auto; border: 1px dashed #666; padding: 1.4mm 2.4mm; font-size: 7.6pt; line-height: 1.5; margin-bottom: 2.5mm; }
    .cut b { font-size: 8.2pt; }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 1fr; gap: 1.5mm; flex: 1 1 auto; }
    .st { border: 2.6px solid ${BLUE}; border-radius: 2mm; display: flex; flex-direction: column;
          align-items: center; justify-content: center; color: ${BLUE}; }
    .st .lbl { font-size: 7.6pt; font-weight: 700; letter-spacing: .1em; }
    .st .num { font-size: 26pt; font-weight: 700; line-height: 1; }
    .st .done { font-size: 6.6pt; letter-spacing: .04em; margin-top: .6mm; }
    .st.spare { border-style: dashed; border-color: #888; color: #888; }
    .st.spare .num { font-size: 11pt; }
    .st.d1 { border-color: #000; background: ${YELLOW}; color: #000; }
    .st.d1 .num { font-size: 15pt; }
    .st.d2 { border-color: #000; color: #000; }
    .st.d2 .num { font-size: 15pt; }
    .st.d2 .memo { font-size: 6.2pt; color: #444; margin-top: .6mm; }
  `;

  const blue = (n) => `<div class="st"><div class="lbl">${esc(CONFIG.stickerPrefix)}</div><div class="num">${n}</div><div class="done">計量済</div></div>`;
  const spare = () => `<div class="st spare"><div class="lbl">予備</div><div class="num">${esc(CONFIG.stickerPrefix)}__</div></div>`;

  const sheets = [];
  for (let start = 1; start <= CONFIG.athletes; start += perPage) {
    const end = Math.min(start + perPage - 1, CONFIG.athletes);
    const cells = [];
    for (let n = start; n <= end; n++) cells.push(blue(n));
    while (cells.length < perPage) cells.push(spare());
    sheets.push(`
<div class="sheet">
  <div class="cut">
    <b>${esc(CONFIG.eventName)} 計量完了シール（青）${start}〜${end}　${esc(CONFIG.eventDate)}</b>　※この帯は切り離してください<br>
    使い方：計量が終わった選手に「${esc(CONFIG.stickerPrefix)}○番」を1枚渡す（または貼る）。番号は計量チェックリストとメディカル用紙に記入。<br>
    <b>貼付場所（服／選手用カード／手首など）は主催者の指示に従う：</b><span style="border-bottom:1px solid #555;display:inline-block;min-width:45mm"></span><br>
    白黒プリンターの場合：青い紙に印刷するか、枠を青ペンでなぞると識別しやすくなります。マス目の線で切り分けてください。
  </div>
  <div class="grid">${cells.join('')}</div>
</div>`);
  }

  // 減点識別シール
  const d2style = CONFIG.deduct2Color ? ` style="background:${CONFIG.deduct2Color};color:#fff"` : '';
  const d1 = Array.from({ length: 12 }, () => `<div class="st d1"><div class="lbl">減点</div><div class="num">1</div><div class="done">計量オーバー</div></div>`);
  const d2 = Array.from({ length: 12 }, () => `<div class="st d2"${d2style}><div class="lbl">減点</div><div class="num">2</div>${CONFIG.deduct2Color ? '<div class="done">計量オーバー</div>' : '<div class="memo">色は主催者指示</div>'}</div>`);
  const d3 = Array.from({ length: 12 }, () => `<div class="st d2"><div class="lbl">要相談</div><div class="num">＋2kg↑</div><div class="memo">主催者が判断</div></div>`);
  const dCells = [...d1, ...d2, ...d3];
  while (dCells.length < perPage) dCells.push(spare());

  sheets.push(`
<div class="sheet">
  <div class="cut">
    <b>${esc(CONFIG.eventName)} 減点識別シール　${esc(CONFIG.eventDate)}</b>　※この帯は切り離してください<br>
    黄色＝<b>減点1（＋501g〜999g）</b>。<b>＋500g以内はシールなし（減点なし）。</b><br>
    <b>減点2（＋1.0kg〜1.999kg）の識別色は主催者未確定です。</b>色が決まるまでは枠のみで印刷しています（決定後に色を指定して再印刷できます）。<br>
    「要相談（＋2kg以上）」は失格ではありません。主催者・責任者の判断を待ってください。
  </div>
  <div class="grid">${dCells.join('')}</div>
</div>`);

  return page(`${CONFIG.eventName} 計量完了シール（${CONFIG.stickerPrefix}1〜${CONFIG.athletes}）`, css, sheets.join('\n'));
}

/* ==================================================================
   D｜受付スタッフ用・5ステップ（A4縦1枚／スマホでも読める）
   ================================================================== */
function buildD() {
  const css = `
    ${PENALTY_CSS}
    .sheet { font-size: 10pt; }
    .steps { margin-top: 3mm; flex: 0 0 auto; }
    .box { flex: 0 0 auto; }
    .three { flex: 0 0 auto; }
    .step { display: flex; align-items: stretch; border: 2px solid #000; margin-bottom: 2.6mm; }
    .step .n { flex: 0 0 15mm; background: #000; color: #fff; font-size: 20pt; font-weight: 700;
               display: flex; align-items: center; justify-content: center; }
    .step .c { flex: 1; padding: 2mm 3mm; }
    .step .t { font-size: 13pt; font-weight: 700; line-height: 1.25; }
    .step .d { font-size: 9.4pt; line-height: 1.45; margin-top: .8mm; }
    .step .d b { background: #000; color: #fff; padding: 0 1mm; }
    .box { border: 2px solid #000; padding: 2mm 3mm; margin-top: 2.4mm; }
    .box .t { font-size: 11pt; font-weight: 700; margin-bottom: 1.2mm; }
    .box ul { list-style: none; }
    .box li { font-size: 9.4pt; line-height: 1.5; padding-left: 4.5mm; position: relative; }
    .box li::before { content: "▶"; position: absolute; left: 0; font-size: 7pt; top: .8mm; }
    .three { display: flex; gap: 2.5mm; margin-top: 2.4mm; }
    .three div { flex: 1; border: 1.6px solid #000; padding: 1.6mm 2mm; font-size: 8.8pt; line-height: 1.4; }
    .memo { flex: 0 0 auto; height: 56mm; border: 1.6px solid #000; margin-top: 2.4mm; padding: 1.6mm 2.5mm 1.6mm; display: flex; flex-direction: column; }
    .memo .t { font-size: 10pt; font-weight: 700; }
    .memo .lines { flex: 1 1 auto; margin-top: 1.4mm; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 7.4mm, #999 7.4mm, #999 7.5mm); }
    .three b { display: block; font-size: 10.5pt; }
    .foot { margin-top: auto; flex: 0 0 auto; padding-top: 1.6mm; border-top: 1px solid #999; font-size: 7.8pt; line-height: 1.5; }
  `;

  const steps = [
    ['名前を確認', '選手名＋<b>所属ジム</b>を確認。同姓同名・兄弟姉妹があるため、名前だけで判断しない。'],
    ['参加費の精算を確認', '未精算の選手は<b>先に精算</b>。精算が終わるまでメディカル・計量へ進めない。未精算者リストは主催者が用意。'],
    ['書類を確認して受け取る', 'メディカルチェック／参加誓約／保護者署名の3つ。<b>未成年は保護者署名がないと出場不可</b>。声かけは「体調をご確認いただいて、内容を読んで保護者の方のご署名をお願いします」でOK。'],
    ['計量', '<b>書類の提出と引き換えに計量</b>。着衣計量。契約体重は<b>最終対戦カードの数値</b>を見る（申込時の申告体重ではない）。'],
    ['✓ と シール', '計量チェックリストに<b>✓</b>を入れる → <b>青シール「あお○番」</b>を渡す。番号はメディカル用紙にも記入。'],
  ];

  const body = `
<div class="sheet">
  <div class="head">
    <div>
      <div class="brand">${esc(CONFIG.eventName)}</div>
      <div class="doc-title">受付スタッフ用・5ステップ</div>
    </div>
    <div class="head-right"><div class="big">${esc(CONFIG.eventDate)}</div><div>この順番で進めてください</div></div>
  </div>

  <div class="steps">
    ${steps.map(([t, d], i) => `<div class="step"><div class="n">${i + 1}</div><div class="c"><div class="t">${t}</div><div class="d">${d}</div></div></div>`).join('')}
  </div>

  <div class="box">
    <div class="t">計量オーバーの対応</div>
    <div class="ptable">${penaltyCells()}</div>
    <ul style="margin-top:1.4mm">
      <li><b>＋500g以内は減点なし。</b>体重オーバー扱いにしない（着衣計量の許容範囲）。</li>
      <li>減点1（＋501g〜999g）＝<b>黄色シール</b>。減点2の識別方法は主催者確認中。</li>
      <li><b>＋2kg以上は失格ではなく「要相談」。</b>主催者・責任者の判断を待つ。</li>
    </ul>
  </div>

  <div class="box">
    <div class="t">スタッフだけで決めないこと（→ 主催者・責任者・レフェリーへ確認）</div>
    <ul>
      <li>500g以内か迷う／減点かどうか迷う／＋2kg以上だった</li>
      <li>発熱・強い体調不良・大きなケガ・試合に支障がある痛み・その他気になる状態</li>
      <li>「大丈夫そうだからOK」と自己判断しない。<b>安全を最優先。</b></li>
    </ul>
  </div>

  <div class="memo">
    <div class="t">メモ（未精算・保護者不在・確認待ちの選手など）</div>
    <div class="lines"></div>
  </div>

  <div class="three">
    <div><b>支払い済み</b>参加費を払った</div>
    <div><b>受付済み</b>必要書類の確認が終わった</div>
    <div><b>計量済み</b>体重確認が終わった</div>
  </div>

  <div class="foot">
    <b>この3つは同じ意味ではありません。</b>「支払い済みだから計量も終わっている」とは判断しないでください。<br>
    計量済みと言えるのは、精算確認 → 書類提出 → 計量実施 → 減点の確認 → 計量表に✓ まで終わった時点です。その後にシールを使います。
  </div>
</div>`;
  return page(`${CONFIG.eventName} 受付スタッフ用・5ステップ`, css, body);
}

/* ---------- 出力 ---------- */
const outputs = [
  ['A_メディカル_誓約_保護者同意.html', buildA()],
  ['B_計量チェックリスト.html', buildB()],
  ['C_計量完了シール_あお1-88.html', buildC()],
  ['D_受付スタッフ5ステップ.html', buildD()],
];
for (const [file, html] of outputs) {
  writeFileSync(join(OUT, file), html, 'utf8');
  console.log(`wrote print/${file} (${html.length} bytes)`);
}
