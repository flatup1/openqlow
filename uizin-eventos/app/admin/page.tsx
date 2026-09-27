'use client';

import { useEffect, useMemo, useState } from 'react';
import { reloadProgram, uploadProgram } from '../lib/client.ts';
import { saveEntryConfig } from '../lib/client.ts';
import { getApiBase, getEventId, getOperatorKey, setApiBase, setEventId, setOperatorKey } from '../lib/config.ts';
import { eventLivePath, extractSheetId, validateNewEvent } from '../../core/eventConfig.ts';
import { normalizeEventId } from '../../core/eventId.ts';
import type { EntrySiteConfig } from '../../core/entry.ts';
import { EMPTY_ENTRY_CONFIG } from '../../core/entry.ts';

export default function AdminPage() {
  const [eventId, updateEventId] = useState('');
  const [sheet, setSheet] = useState('');
  const [api, setApi] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [eventCsv, setEventCsv] = useState('');
  const [matchesCsv, setMatchesCsv] = useState('');
  const [musicCsv, setMusicCsv] = useState('');
  const [entryConfig, setEntryConfig] = useState<EntrySiteConfig>(EMPTY_ENTRY_CONFIG);

  useEffect(() => {
    const initialEvent = getEventId(); const initialApi = getApiBase();
    updateEventId(initialEvent);
    setApi(initialApi);
    setKey(getOperatorKey());
    fetch(new URL('/api/entry-config?event=' + encodeURIComponent(initialEvent), initialApi || window.location.origin))
      .then((r) => r.json()).then((value: unknown) => {
        const body = value as { config?: EntrySiteConfig }; if (body.config) setEntryConfig(body.config);
      }).catch(() => undefined);
  }, []);

  const normalizedId = normalizeEventId(eventId);
  const errors = useMemo(() => validateNewEvent(eventId, sheet), [eventId, sheet]);
  const saveConnection = () => {
    setEventId(normalizedId);
    setApiBase(api);
    setOperatorKey(key);
  };

  const importSheet = async () => {
    if (errors.length) return setMessage(errors[0]);
    if (!api.trim() || !key.trim()) return setMessage('接続先と操作キーを入力してください。');
    saveConnection();
    setBusy(true);
    setMessage('進行表を確認しています…');
    const result = await reloadProgram(extractSheetId(sheet));
    setBusy(false);
    setMessage(result.ok ? '取り込みました。本番画面を開いて内容を確認してください。' : '取り込めません: ' + (result.reason ?? '理由不明'));
  };

  const importCsv = async () => {
    if (!matchesCsv.trim()) return setMessage('matches CSVが空です。');
    if (!api.trim() || !key.trim()) return setMessage('接続先と操作キーを入力してください。');
    saveConnection();
    setBusy(true);
    setMessage('CSVを確認しています…');
    const result = await uploadProgram({ event: eventCsv, matches: matchesCsv, music: musicCsv });
    setBusy(false);
    setMessage(result.ok ? 'CSVを取り込みました。本番画面を確認してください。' : '取り込めません: ' + (result.reason ?? '理由不明'));
  };
  const saveEntry = async () => {
    if (!api.trim() || !key.trim()) return setMessage('先に接続先と操作キーを入力してください。');
    saveConnection(); setBusy(true); setMessage('エントリーサイトを保存しています…');
    const result = await saveEntryConfig(entryConfig);
    setBusy(false); setMessage(result.ok ? '保存しました。公開リンクで内容を確認してください。' : '保存できません: ' + (result.reason ?? '理由不明'));
  };
  const entryLink = '../entry/?event=' + encodeURIComponent(normalizedId);
  const updateEntry = (name: keyof EntrySiteConfig, value: string | boolean) => setEntryConfig((v) => ({ ...v, [name]: value }));
  const downloadEntries = async (view: 'os' | 'full') => {
    if (!api.trim() || !key.trim()) return setMessage('接続先と操作キーを入力してください。');
    const url = new URL(api.replace(/\/+$/, '') + '/api/entries/export');
    url.searchParams.set('event', normalizedId); url.searchParams.set('view', view);
    const res = await fetch(url, { headers: { 'x-operator-key': key } });
    const body = await res.json() as { entries?: Array<Record<string, unknown>>; reason?: string };
    if (!res.ok) return setMessage('出力できません: ' + (body.reason ?? '理由不明'));
    const rows = body.entries ?? []; if (!rows.length) return setMessage('エントリーはまだありません。');
    const columns = Object.keys(rows[0]);
    const cell = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const csv = '\uFEFF' + [columns.map(cell).join(','), ...rows.map((row) => columns.map((key) => cell(row[key])).join(','))].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = normalizedId + '-entries-' + view + '.csv'; link.click(); URL.revokeObjectURL(link.href);
    setMessage(view === 'os' ? 'OS用CSVを出力しました。連絡先は含まれていません。' : '申込原本CSVを出力しました。個人情報として安全に保管してください。');
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold text-indigo-700">TOURNAMENT OS</p>
        <h1 className="mt-1 text-3xl font-black">新しい大会を準備する</h1>
        <p className="mt-2 text-slate-600">上から順番に入力し、「進行表を取り込む」を押します。既存大会のデータは変更しません。</p>

        <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="font-bold">1. 大会ID</span>
            <span className="ml-2 text-sm text-slate-500">例: narita-kick-2027</span>
            <input value={eventId} onChange={(e) => updateEventId(e.target.value.toLowerCase())} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-lg" placeholder="narita-kick-2027" />
            <span className="mt-1 block text-sm text-slate-500">半角英数字とハイフン。大会ごとに違う名前にします。</span>
          </label>

          <label className="block">
            <span className="font-bold">2. 進行表のGoogleスプレッドシート</span>
            <input value={sheet} onChange={(e) => setSheet(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
            <span className="mt-1 block text-sm font-semibold text-rose-700">電話番号・メール・住所が入った申込原本は使わないでください。</span>
          </label>

          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-bold">3. 接続設定（最初の1回だけ）</summary>
            <div className="mt-4 space-y-3">
              <input value={api} onChange={(e) => setApi(e.target.value)} className="w-full rounded-xl border border-slate-300 p-3" placeholder="Worker URL" />
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className="w-full rounded-xl border border-slate-300 p-3" placeholder="操作キー" />
              <p className="text-sm text-slate-500">操作キーはこの端末だけに保存され、画面には再表示しません。</p>
            </div>
          </details>

          {message ? <p role="status" className="rounded-xl bg-slate-100 p-4 font-bold">{message}</p> : null}
          <button disabled={busy || errors.length > 0} onClick={() => void importSheet()} className="w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? '確認中…' : '進行表を取り込む'}</button>

          <a href={eventLivePath(normalizedId)} className="block w-full rounded-xl border-2 border-indigo-700 p-4 text-center text-lg font-black text-indigo-800">本番画面を開く</a>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-indigo-700">ENTRY SITE</p>
          <h2 className="mt-1 text-2xl font-black">エントリーサイトを作る</h2>
          <p className="mt-2 text-slate-600">大会ごとにここだけ変更します。申込原本と本番進行データは分けて保存します。</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="font-bold sm:col-span-2">大会名<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.title} onChange={(e) => updateEntry('title', e.target.value)} placeholder="初心者向けキックボクシング大会" /></label>
            <label className="font-bold">主催者<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.organizer} onChange={(e) => updateEntry('organizer', e.target.value)} /></label>
            <label className="font-bold">開催日<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.date} onChange={(e) => updateEntry('date', e.target.value)} placeholder="2027年9月23日" /></label>
            <label className="font-bold sm:col-span-2">会場<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.venue} onChange={(e) => updateEntry('venue', e.target.value)} /></label>
            <label className="font-bold">計量<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.weighInAt} onChange={(e) => updateEntry('weighInAt', e.target.value)} placeholder="10:00" /></label>
            <label className="font-bold">試合開始<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.startAt} onChange={(e) => updateEntry('startAt', e.target.value)} placeholder="11:00" /></label>
            <label className="font-bold">参加費<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.fee} onChange={(e) => updateEntry('fee', e.target.value)} placeholder="4,000円" /></label>
            <label className="font-bold">締切<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.deadline} onChange={(e) => updateEntry('deadline', e.target.value)} /></label>
            <label className="font-bold sm:col-span-2">紹介文<textarea className="mt-1 w-full rounded-xl border p-3" rows={5} value={entryConfig.description} onChange={(e) => updateEntry('description', e.target.value)} placeholder="初心者・試合経験ゼロ歓迎。安全で公平なマッチメイクを目指します。" /></label>
            <label className="font-bold sm:col-span-2">問い合わせ先<input className="mt-1 w-full rounded-xl border p-3" value={entryConfig.contact} onChange={(e) => updateEntry('contact', e.target.value)} placeholder="公式LINEまたはメール" /></label>
          </div>
          <label className="mt-5 flex gap-3 rounded-xl bg-amber-50 p-4"><input type="checkbox" checked={entryConfig.published} onChange={(e) => updateEntry('published', e.target.checked)} /><span><b>エントリー受付を公開する</b><br /><span className="text-sm text-slate-600">内容確認後にチェックしてください。OFFなら申込できません。</span></span></label>
          <button disabled={busy} onClick={() => void saveEntry()} className="mt-4 w-full rounded-xl bg-indigo-700 p-4 text-lg font-black text-white disabled:bg-slate-300">エントリーサイト設定を保存</button>
          <a href={entryLink} className="mt-3 block w-full rounded-xl border-2 border-indigo-700 p-3 text-center font-black text-indigo-800">公開リンクを確認する</a>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => void downloadEntries('os')} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">OS用CSV（連絡先なし）</button><button onClick={() => void downloadEntries('full')} className="rounded-xl border border-rose-300 p-3 font-bold text-rose-800">申込原本CSV（個人情報あり）</button></div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="font-bold text-slate-700">{advanced ? '−' : '＋'} Google Sheetsが使えないときの予備取り込み</button>
          {advanced ? <div className="mt-4 space-y-3">
            <textarea value={eventCsv} onChange={(e) => setEventCsv(e.target.value)} rows={4} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="event CSV" />
            <textarea value={matchesCsv} onChange={(e) => setMatchesCsv(e.target.value)} rows={8} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="matches CSV（必須）" />
            <textarea value={musicCsv} onChange={(e) => setMusicCsv(e.target.value)} rows={6} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder="music CSV" />
            <button disabled={busy} onClick={() => void importCsv()} className="w-full rounded-xl bg-slate-800 p-3 font-bold text-white">予備CSVを取り込む</button>
          </div> : null}
        </section>
      </div>
    </main>
  );
}
