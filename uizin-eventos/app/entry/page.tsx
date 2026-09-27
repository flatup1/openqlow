'use client';

import { useEffect, useState } from 'react';
import type { EntryInput, EntrySiteConfig } from '../../core/entry.ts';
import { EMPTY_ENTRY_CONFIG } from '../../core/entry.ts';
import { apiUrl, getApiBase, getEventId } from '../lib/config.ts';

const EMPTY_FORM: EntryInput = {
  fighterName: '', fighterKana: '', gym: '', gender: '', grade: '', age: '', category: '', height: '', weight: '',
  experience: '', record: '', canFightTwice: '', comment: '', musicChoice: '未定', musicUrl: '', contactName: '',
  contactPhone: '', contactEmail: '', consentPublicity: false, consentRules: false, website: '',
};

export default function EntryPage() {
  const [config, setConfig] = useState<EntrySiteConfig>(EMPTY_ENTRY_CONFIG);
  const [form, setForm] = useState<EntryInput>(EMPTY_FORM);
  const [status, setStatus] = useState('大会情報を読み込んでいます…');
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    fetch(apiUrl(getApiBase(), '/api/entry-config'), { cache: 'no-store' })
      .then((r) => r.json()).then((value: unknown) => {
        const body = value as { config?: EntrySiteConfig };
        setConfig(body.config ?? EMPTY_ENTRY_CONFIG);
        setStatus(body.config?.published ? '' : '現在は募集していません。');
      }).catch(() => setStatus('大会情報を読み込めません。時間をおいて再度お試しください。'));
  }, []);

  const set = (name: keyof EntryInput, value: string | boolean) => setForm((v) => ({ ...v, [name]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending || receipt) return;
    setSending(true); setStatus('送信しています。画面を閉じないでください…');
    try {
      const payload = new FormData(); payload.set('entry', JSON.stringify(form)); if (photo) payload.set('photo', photo);
      const res = await fetch(apiUrl(getApiBase(), '/api/entries'), {
        method: 'POST', body: payload, signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json() as { ok?: boolean; receiptNo?: string; reason?: string };
      if (!res.ok || !body.ok || !body.receiptNo) throw new Error(body.reason ?? '送信できませんでした。');
      setReceipt(body.receiptNo); setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '送信できませんでした。');
    } finally { setSending(false); }
  };

  if (receipt) return <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900"><section className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-lg"><p className="text-5xl">✅</p><h1 className="mt-4 text-3xl font-black">エントリーを受け付けました</h1><p className="mt-5 text-slate-600">お問い合わせの際に必要です。スクリーンショットを保存してください。</p><p className="mt-4 rounded-2xl bg-indigo-50 p-5 text-3xl font-black tracking-wider text-indigo-800">{receipt}</p></section></main>;

  const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100';
  return <main className="min-h-screen bg-slate-50 pb-16 text-slate-900">
    <header className="bg-indigo-800 px-4 py-9 text-white"><div className="mx-auto max-w-2xl"><p className="text-sm font-bold tracking-widest">ENTRY FORM</p><h1 className="mt-2 text-3xl font-black">{config.title || '大会エントリー'}</h1><p className="mt-3 whitespace-pre-line leading-relaxed text-indigo-100">{config.description}</p></div></header>
    <div className="mx-auto max-w-2xl px-4">
      <section className="-mt-4 grid gap-2 rounded-2xl bg-white p-5 shadow-md sm:grid-cols-2">
        <p><b>開催日</b><br />{config.date || '未設定'}</p><p><b>会場</b><br />{config.venue || '未設定'}</p>
        <p><b>計量 / 開始</b><br />{config.weighInAt || '—'} / {config.startAt || '—'}</p><p><b>参加費</b><br />{config.fee || '未設定'}</p>
        <p className="sm:col-span-2"><b>締切</b><br /><span className="font-black text-rose-700">{config.deadline || '未設定'}</span></p>
      </section>
      {status ? <p role="alert" className="mt-5 rounded-xl bg-amber-100 p-4 font-bold text-amber-900">{status}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-7 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <fieldset disabled={!config.published || sending} className="space-y-5 disabled:opacity-60">
          <legend className="text-2xl font-black">選手情報</legend>
          <label className="block font-bold">選手名（リングネーム）<span className="text-rose-600"> 必須</span><input className={input} value={form.fighterName} onChange={(e) => set('fighterName', e.target.value)} required /></label>
          <label className="block font-bold">ふりがな<input className={input} value={form.fighterKana} onChange={(e) => set('fighterKana', e.target.value)} /></label>
          <label className="block font-bold">所属ジム<span className="text-rose-600"> 必須</span><input className={input} value={form.gym} onChange={(e) => set('gym', e.target.value)} required /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block font-bold">性別<select className={input} value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">選択</option><option>男性</option><option>女性</option><option>回答しない</option></select></label><label className="block font-bold">学年<input className={input} value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="例: 小学5年 / 高校2年 / 社会人" /></label></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block font-bold">年齢<span className="text-rose-600"> 必須</span><input className={input} type="number" min="4" max="100" value={form.age} onChange={(e) => set('age', e.target.value)} required /></label><label className="block font-bold">参加区分<input className={input} value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="キッズ / ジュニア / 一般" /></label></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block font-bold">身長（cm）<input className={input} type="number" min="70" max="230" step="0.1" value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="例: 145.5" /></label><label className="block font-bold">希望体重（kg）<span className="text-rose-600"> 必須</span><input className={input} type="number" min="10" max="200" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)} required /></label></div>
          <label className="block font-bold">試合経験<select className={input} value={form.experience} onChange={(e) => set('experience', e.target.value)}><option value="">選択</option><option>試合は初めて</option><option>1〜3試合</option><option>4試合以上</option></select></label>
          <label className="block font-bold">戦績・競技歴<textarea className={input} rows={3} value={form.record} onChange={(e) => set('record', e.target.value)} /></label>
          <label className="block font-bold">2試合可能か<select className={input} value={form.canFightTwice} onChange={(e) => set('canFightTwice', e.target.value)}><option value="">選択</option><option>可能</option><option>1試合のみ希望</option></select></label>
          <label className="block font-bold">試合への意気込み<span className="text-rose-600"> 必須</span><textarea className={input} rows={4} maxLength={500} value={form.comment} onChange={(e) => set('comment', e.target.value)} required /></label>
          {config.usesWalkoutMusic ? <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50 p-4"><h2 className="text-lg font-black">入場曲</h2><label className="mt-3 block font-bold">入場曲を使いますか？<select className={input} value={form.musicChoice} onChange={(e) => set('musicChoice', e.target.value)}><option>未定</option><option>あり</option><option>なし</option></select></label>{form.musicChoice === 'あり' ? <label className="mt-4 block font-bold">入場曲URL<span className="mt-1 block text-sm font-normal text-slate-500">Apple Music推奨。なければYouTube。</span><input className={input} type="url" value={form.musicUrl} onChange={(e) => set('musicUrl', e.target.value)} placeholder="https://music.apple.com/…" required /></label> : null}</section> : null}
          <section className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 p-4"><h2 className="text-lg font-black">顔写真をアップロード</h2><p className="mt-1 text-sm text-slate-600">選手本人の顔が正面から分かる写真を選んでください。</p><label className="mt-3 block font-bold">顔写真ファイル<input className={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /><span className="mt-1 block text-sm font-normal text-slate-500">JPEG・PNG・WebP、2MB以下。広報利用に同意しない写真はTournament OSの表示用データへ出しません。</span></label></section>
          <hr className="border-slate-200" />
          <legend className="text-2xl font-black">連絡先</legend>
          <label className="block font-bold">連絡先氏名<span className="text-rose-600"> 必須</span><input className={input} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} required /></label>
          <label className="block font-bold">電話番号<span className="text-rose-600"> 必須</span><input className={input} inputMode="tel" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} required /></label>
          <label className="block font-bold">メールアドレス<span className="text-rose-600"> 必須</span><input className={input} type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} required /></label>
          <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} /></label>
          <label className="flex gap-3 rounded-xl bg-slate-50 p-4"><input type="checkbox" checked={form.consentPublicity} onChange={(e) => set('consentPublicity', e.target.checked)} /><span><b>写真・映像の広報利用に同意します</b><br /><span className="text-sm text-slate-500">同意しない場合もエントリーできます。</span></span></label>
          <label className="flex gap-3 rounded-xl bg-slate-50 p-4"><input type="checkbox" checked={form.consentRules} onChange={(e) => set('consentRules', e.target.checked)} required /><span><b>大会規約・安全上の注意・個人情報の取扱いに同意します</b><span className="text-rose-600"> 必須</span></span></label>
          <button className="w-full rounded-xl bg-indigo-700 p-4 text-xl font-black text-white disabled:bg-slate-400" disabled={!config.published || sending}>{sending ? '送信中…' : '内容を確認して送信'}</button>
        </fieldset>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">主催: {config.organizer || '未設定'}{config.contact ? ' / ' + config.contact : ''}<br />大会ID: {getEventId()}</p>
    </div>
  </main>;
}
