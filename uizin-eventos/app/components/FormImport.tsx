'use client';

import { useEffect, useMemo, useState } from 'react';
import { readFormResponses } from '../lib/client.ts';
import { extractSheetId } from '../../core/eventConfig.ts';
import type { ColumnMapping, FormField, ImportedFighter } from '../../core/formImport.ts';
import { formReaderScript, isFormReaderUrl, newReaderToken } from '../../core/formReader.ts';
import { FORM_FIELD_LABELS, buildImportPreview, detectColumns, missingRequiredFields, remapColumn } from '../../core/formImport.ts';

const TAB_CANDIDATES = ['フォームの回答 1', 'フォームの回答 2', 'フォームの回答 3'];
const PICKABLE: FormField[] = ['fighterName', 'fighterKana', 'gym', 'age', 'grade', 'gender', 'height', 'weight', 'category', 'className', 'record', 'otherExperience', 'style', 'memo', 'comment', 'musicUrl', 'photoUrl', 'canFightTwice', 'timestamp', 'birthDate'];

function mappingLabel(c: ColumnMapping): string {
  if (c.mapped.kind === 'field') return FORM_FIELD_LABELS[c.mapped.field];
  if (c.mapped.kind === 'sensitive') return '個人情報のため取り込まない';
  if (c.mapped.kind === 'consent') return '同意欄（表示しない）';
  return '使わない';
}

/**
 * 既存Googleフォームの回答表から選手を読む画面。
 * 会長がやることは「URLを貼る → 読み込む → 名前と人数を見て確定」の3つだけ。
 */
export function FormImport({ eventId, disabled, currentCount, onConfirm }: {
  eventId: string;
  disabled: boolean;
  currentCount: number;
  onConfirm: (fighters: ImportedFighter[]) => { before: number; after: number; added: number; updated: number };
}) {
  const [url, setUrl] = useState('');
  const [tab, setTab] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [columns, setColumns] = useState<ColumnMapping[]>([]);
  const [done, setDone] = useState('');
  const [tabs, setTabs] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  // 合言葉は大会ごとにこの端末で1つだけ作って覚える。サーバーには保存しない。
  // 前に使ったURLも覚えておき、2回目からは「読み込む」を押すだけにする。
  useEffect(() => {
    if (!eventId) return;
    try {
      const saved = window.localStorage.getItem('tos-reader-token:' + eventId);
      const next = saved && /^[A-Za-z0-9]{20,64}$/.test(saved) ? saved : newReaderToken();
      if (!saved) window.localStorage.setItem('tos-reader-token:' + eventId, next);
      setToken(next);
      setUrl(window.localStorage.getItem('tos-reader-url:' + eventId) ?? '');
    } catch { setToken(newReaderToken()); }
  }, [eventId]);
  const safeMode = isFormReaderUrl(url);
  const copyScript = async () => {
    try { await navigator.clipboard.writeText(formReaderScript(token)); setCopied(true); } catch { setNote('コピーできませんでした。もう一度押してください。'); }
  };

  const preview = useMemo(() => (rows.length && columns.length ? buildImportPreview(headers, rows, columns) : null), [headers, rows, columns]);
  const missingRequired = columns.length ? missingRequiredFields(columns) : [];
  const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  const read = async () => {
    setDone('');
    if (!safeMode && !extractSheetId(url)) return setNote('URLを確認してください。「https://script.google.com/」か「https://docs.google.com/spreadsheets/」で始まるものです。');
    setBusy(true); setNote('回答表を読んでいます。元の表は書き換えません…');
    const result = await readFormResponses(url.trim(), tab, safeMode ? token : '');
    setBusy(false);
    if (result.tabs.length) setTabs(result.tabs);
    // 失敗したときは、前に読めていたプレビューも今の選手一覧も消さない。
    if (!result.ok) return setNote('読めませんでした: ' + (result.reason ?? '理由不明'));
    try { window.localStorage.setItem('tos-reader-url:' + eventId, url.trim()); } catch { /* 覚えられなくても読める */ }
    if (result.tab) setTab(result.tab);
    setHeaders(result.headers); setRows(result.rows); setRemoved(result.removedColumns);
    setColumns(detectColumns(result.headers));
    setNote(result.rows.length + '件の回答を読みました。下で名前と人数を確認してください。まだ確定していません。');
  };

  const confirm = () => {
    if (!preview || preview.fighters.length === 0) return;
    const dupNote = preview.duplicates.length ? '\n\n同じ選手かもしれない組が ' + preview.duplicates.length + ' 組あります。まとめずにそのまま取り込みます。' : '';
    if (!window.confirm(preview.fighters.length + '人を選手一覧へ入れます。元の回答表は変わりません。' + dupNote)) return;
    const r = onConfirm(preview.fighters);
    setDone('できました。選手一覧は ' + r.before + '人 → ' + r.after + '人 になりました（新しく ' + r.added + '人・更新 ' + r.updated + '人）。');
    setNote('');
  };

  return <div className="mt-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
    <p className="text-lg font-black text-emerald-950">Googleフォームの回答表から読み込む</p>
    <p className="mt-1 text-sm text-slate-700">いまのGoogleフォームはそのまま使えます。元の回答表は<b>読むだけ</b>で、書き換えません。</p>

    <details open={howOpen || !url} onToggle={(e) => setHowOpen((e.target as HTMLDetailsElement).open)} className="mt-4 rounded-xl border-2 border-emerald-200 bg-white p-4">
      <summary className="cursor-pointer text-lg font-black">はじめての大会だけ：読み取りの準備（5分・1回だけ）</summary>
      <p className="mt-2 text-sm text-slate-700">回答表の共有設定は<b>今のまま（制限付き）</b>で大丈夫です。回答表の中に「読むだけの小さなプログラム」を1回貼ります。</p>
      <ol className="mt-3 space-y-3 text-base">
        <li><b>1.</b> 下の緑のボタンを押す<button type="button" onClick={() => void copyScript()} disabled={!token} className="mt-2 block w-full rounded-xl bg-emerald-600 p-3 font-black text-white disabled:bg-slate-300">{copied ? 'コピーしました ✓' : '読み取り用プログラムをコピー'}</button></li>
        <li><b>2.</b> Googleで回答表を開き、上の <b>「拡張機能」</b> → <b>「Apps Script」</b> を押す</li>
        <li><b>3.</b> 最初から入っている文字を全部消して、<b>貼り付け</b>る（⌘ + V）。上の <b>💾 保存</b> を押す</li>
        <li><b>4.</b> 右上の <b>「デプロイ」</b> → <b>「新しいデプロイ」</b> → 種類は <b>「ウェブアプリ」</b>。<br /><span className="text-sm">「次のユーザーとして実行」は<b>自分</b>、「アクセスできるユーザー」は<b>全員</b>を選んで「デプロイ」。許可を聞かれたら自分のアカウントで<b>許可</b>します。</span></li>
        <li><b>5.</b> 最後に出る <b>「ウェブアプリのURL」</b> をコピーして、下の欄に貼る</li>
      </ol>
      <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-slate-700">このプログラムは回答表を読むだけです。書き換え・削除はしません。メール・電話・保護者名・住所は送りません。合言葉を知らない人には何も見せません。</p>
    </details>

    <label className="mt-4 block font-bold">① URLを貼る<span className="block text-sm font-normal text-slate-600">「https://script.google.com/」で始まるURL（おすすめ）</span><input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
    {url && !safeMode && extractSheetId(url) ? <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-bold text-amber-900">⚠ 回答表そのもののURLです。この方法は回答表を「リンクを知っている全員」に共有しないと読めず、メールなどが他の人に見えるおそれがあります。できれば上の「読み取りの準備」を使ってください。</p> : null}
    {tabs.length > 1 ? <div className="mt-3"><p className="font-bold">回答のタブを選ぶ</p><div className="mt-2 flex flex-wrap gap-2">{tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={'rounded-lg border-2 px-3 py-2 font-bold ' + (tab === t ? 'border-emerald-600 bg-emerald-100' : 'border-slate-200 bg-white')}>{t}</button>)}</div><p className="mt-1 text-sm text-slate-600">選んだら、もう一度「② 申込者を読み込む」を押してください。</p></div>
      : <label className="mt-3 block font-bold">回答のタブ名 <span className="text-sm font-normal text-slate-600">（分からなければ空のままでOK。いちばん左のタブを読みます）</span>
      <input className={input} list="form-tab-candidates" value={tab} onChange={(e) => setTab(e.target.value)} placeholder="例: フォームの回答 2" />
      <datalist id="form-tab-candidates">{TAB_CANDIDATES.map((t) => <option key={t} value={t} />)}</datalist></label>}
    <button disabled={disabled || busy} onClick={() => void read()} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">② 申込者を読み込む</button>
    {note ? <p role="status" className="mt-3 rounded-xl bg-white p-3 font-bold text-slate-800">{note}</p> : null}

    {preview ? <div className="mt-5 space-y-4">
      <div className="rounded-xl bg-white p-4 text-center"><p className="text-sm font-bold text-slate-600">③ 名前と人数を確認する</p>
        <p className="mt-1 text-3xl font-black">{preview.fighters.length}人</p>
        <p className="text-sm text-slate-600">いまの選手一覧: {currentCount}人{preview.skipped.length ? '・選手名が空で読まなかった行: ' + preview.skipped.length : ''}{preview.sameRowCount ? '・全く同じ回答（1人にまとめた）: ' + preview.sameRowCount : ''}</p></div>

      {missingRequired.length ? <p className="rounded-xl bg-rose-100 p-3 font-bold text-rose-900">「選手名」の列が見つかりません。下の「列の対応」で、選手名の列を選んでください。</p> : null}

      {preview.duplicates.length ? <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3"><p className="font-black text-amber-900">⚠ 同じ選手か確認してください（自動でまとめていません）</p>
        <ul className="mt-2 list-disc pl-5 text-sm">{preview.duplicates.map((d) => <li key={d.receiptNos.join('-')}>{d.names}</li>)}</ul></div> : null}

      <div className="max-h-96 overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">行</th><th className="p-2">選手名</th><th className="p-2">所属</th><th className="p-2">体重</th><th className="p-2">年齢</th><th className="p-2">足りない項目</th></tr></thead>
        <tbody>{preview.fighters.map((f) => <tr key={f.receiptNo} className="border-t"><td className="p-2 text-slate-500">{f.sheetRow}</td><td className="p-2 font-bold">{f.fighterName}</td><td className="p-2">{f.gym || '未登録'}</td><td className="p-2">{f.weight ? f.weight + 'kg' : '未登録'}</td><td className="p-2">{f.age || '—'}</td>
          <td className="p-2 text-xs text-slate-600">{f.missing.length ? f.missing.map((m) => FORM_FIELD_LABELS[m]).join('・') + ' は未登録' : 'なし'}</td></tr>)}</tbody></table></div>

      <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer font-bold">列の対応を見る・直す（ふだんは開かなくてOK）</summary>
        {removed.length ? <p className="mt-2 text-sm text-slate-600">個人情報なので読み込んでいない列: {removed.join('、')}</p> : null}
        <ul className="mt-3 space-y-2">{columns.map((c) => <li key={c.index} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
          <span className="text-sm">「{c.header || '（見出しなし）'}」{c.auto ? ' ✓自動' : ''}</span>
          {c.mapped.kind === 'field' || c.mapped.kind === 'ignore'
            ? <select className="rounded-lg border p-2" value={c.mapped.kind === 'field' ? c.mapped.field : ''} onChange={(e) => setColumns((cols) => remapColumn(cols, c.index, e.target.value as FormField | ''))}>
              <option value="">使わない</option>{PICKABLE.map((f) => <option key={f} value={f}>{FORM_FIELD_LABELS[f]}</option>)}</select>
            : <span className="text-sm text-slate-500">{mappingLabel(c)}</span>}
        </li>)}</ul></details>

      <button disabled={disabled || preview.fighters.length === 0 || missingRequired.length > 0} onClick={confirm} className="w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:bg-slate-300">この{preview.fighters.length}人で確定する</button>
    </div> : null}
    {done ? <p role="status" className="mt-3 rounded-xl bg-emerald-100 p-3 font-black text-emerald-900">✓ {done}</p> : null}
  </div>;
}
