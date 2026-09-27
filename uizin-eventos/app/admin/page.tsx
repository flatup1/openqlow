'use client';

import { useEffect, useMemo, useState } from 'react';
import { reloadProgram, uploadProgram } from '../lib/client.ts';
import { getApiBase, getEventId, getOperatorKey, setApiBase, setEventId, setOperatorKey } from '../lib/config.ts';
import { eventLivePath, extractSheetId, validateNewEvent } from '../../core/eventConfig.ts';
import { normalizeEventId } from '../../core/eventId.ts';

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

  useEffect(() => {
    updateEventId(getEventId());
    setApi(getApiBase());
    setKey(getOperatorKey());
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
