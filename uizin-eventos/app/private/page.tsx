'use client';

import { useEffect, useMemo, useState } from 'react';
import { emptyTournament, importFighters, validateTournament, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { decryptBackup, encryptBackup, photoToDataUrl, readPrivateEvent, writePrivateEvent } from '../lib/privateStore.ts';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });

export default function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament('my-tournament'));
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState<LocalFighter>(blankFighter);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('event')?.trim() || 'my-tournament';
    readPrivateEvent(id).then((saved) => { setData(saved ?? emptyTournament(id)); setReady(true); }).catch(() => { setData(emptyTournament(id)); setReady(true); });
  }, []);

  const byId = useMemo(() => new Map(data.fighters.map((fighter) => [fighter.id, fighter])), [data.fighters]);
  const save = async (next = data) => { await writePrivateEvent(next); setData(next); setMessage('このパソコンの中だけに保存しました。'); };
  const edit = <K extends keyof LocalTournament>(key: K, value: LocalTournament[K]) => setData((old) => ({ ...old, [key]: value }));

  const readEntryFile = async (file?: File) => {
    if (!file) return;
    if ((data.fighters.length || data.bouts.length) && !window.confirm('今ある選手と対戦カードを、新しいファイルの内容に入れ替えます。よろしいですか？')) return;
    let csv = '';
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const { readSheet } = await import('read-excel-file/browser');
      const rows = await readSheet(file, '選手入力');
      csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    } else {
      csv = await file.text();
    }
    const result = importFighters(csv);
    if (result.blockedHeaders.length) return setMessage('安全のため読み込みを止めました。削除する列: ' + result.blockedHeaders.join('、'));
    setData((old) => ({ ...old, fighters: result.fighters, bouts: [] }));
    setMessage(result.fighters.length + '人を読み込みました。まだこのパソコン内だけです。');
  };

  const addManual = () => {
    if (!manual.name.trim()) return setMessage('選手名を入力してください。');
    setData((old) => ({ ...old, fighters: [...old.fighters, manual] }));
    setManual(blankFighter()); setMessage('選手を追加しました。最後に「保存」を押してください。');
  };

  const addBout = () => edit('bouts', [...data.bouts, { id: crypto.randomUUID(), redId: '', blueId: '', className: '', rule: '' }]);
  const updateBout = (index: number, patch: Partial<LocalTournament['bouts'][number]>) => edit('bouts', data.bouts.map((bout, i) => i === index ? { ...bout, ...patch } : bout));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= data.bouts.length) return;
    const next = [...data.bouts]; [next[index], next[target]] = [next[target], next[index]]; edit('bouts', next);
  };

  const download = async () => {
    try {
      const encrypted = await encryptBackup(data, password);
      const url = URL.createObjectURL(new Blob([encrypted], { type: 'application/octet-stream' }));
      const a = document.createElement('a'); a.href = url; a.download = data.eventId + '.tournament.enc'; a.click(); URL.revokeObjectURL(url);
      setMessage('暗号化バックアップを保存しました。パスワードは別に保管してください。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした。'); }
  };

  const restore = async (file?: File) => {
    if (!file) return;
    try { const restored = await decryptBackup(await file.text(), password); await save(restored); setMessage('復元しました。内容を確認してください。'); }
    catch { setMessage('復元できません。ファイルかパスワードを確認してください。'); }
  };

  if (!ready) return <main className="p-8">このパソコンのデータを読んでいます…</main>;
  const errors = validateTournament(data);
  const live = '/private/live/?event=' + encodeURIComponent(data.eventId);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-5xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-emerald-700">🔐 完全ローカル Tournament OS</p><h1 className="mt-2 text-3xl font-black">個人情報は、このパソコンから出ません</h1><p className="mt-3 leading-relaxed text-slate-700">Cloudflareには、この空の画面だけがあります。選手名・写真・体重・対戦表は、このブラウザの中だけに保存します。</p><div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">別のパソコンには自動で同期しません。同じパソコンの別タブだけが同じ内容になります。</div></header>
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 大会の基本情報</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="font-bold">大会名<input className={field} value={data.title} onChange={(e) => edit('title', e.target.value)} /></label><label className="font-bold">開催日<input className={field} value={data.date} onChange={(e) => edit('date', e.target.value)} /></label><label className="font-bold">会場<input className={field} value={data.venue} onChange={(e) => edit('venue', e.target.value)} /></label></div></section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 選手を入れる</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><b className="text-blue-900">① シートを保存</b><p className="mt-1 text-sm text-blue-950">他ジムの会長へ、このシートを渡します。</p></div><div className="rounded-xl bg-amber-50 p-4"><b className="text-amber-900">② 黄色い欄へ入力</b><p className="mt-1 text-sm text-amber-950">選手1人につき1行です。</p></div><div className="rounded-xl bg-emerald-50 p-4"><b className="text-emerald-900">③ ここで読み込む</b><p className="mt-1 text-sm text-emerald-950">返ってきたExcelをそのまま選べます。</p></div></div><a href="/templates/Tournament_OS_選手入力テンプレート.xlsx" download className="mt-4 block w-full rounded-xl bg-blue-700 p-4 text-center text-xl font-black text-white">📥 選手入力シートを保存する</a><p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">電話番号・メール・住所・生年月日・保護者名は入れません。写真もシートへ貼りません。</p><label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 p-5 text-center font-black text-indigo-800">返ってきた選手入力シートを選ぶ<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="mt-3 block w-full" onChange={(e) => void readEntryFile(e.target.files?.[0])} /></label><details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">1人ずつ手入力する</summary><div className="mt-4 grid gap-3 sm:grid-cols-3">{([['name','選手名'],['gym','ジム名'],['grade','学年'],['age','年齢'],['height','身長'],['weight','体重'],['record','戦績'],['comment','意気込み'],['musicUrl','入場曲URL']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input className={field} value={manual[key]} onChange={(e) => setManual((old) => ({ ...old, [key]: e.target.value }))} /></label>)}</div><button onClick={addManual} className="mt-4 rounded-xl bg-indigo-700 px-5 py-3 font-black text-white">この選手を追加</button></details><p className="mt-4 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {data.fighters.length}人</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.fighters.map((fighter, index) => <article key={fighter.id} className="rounded-xl border p-3"><div className="flex gap-3"><div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center text-xs text-slate-500">画像なし</span>}</div><div><b>{fighter.name}</b><p className="text-sm text-slate-600">{fighter.gym} / {fighter.weight || '体重未入力'}</p><label className="mt-2 block text-xs font-bold">写真<input type="file" accept="image/*" className="block max-w-[240px] text-xs" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const photoDataUrl = await photoToDataUrl(file); edit('fighters', data.fighters.map((item, i) => i === index ? { ...item, photoDataUrl } : item)); } catch (error) { setMessage(error instanceof Error ? error.message : '画像を読めませんでした。'); } }} /></label></div></div></article>)}</div>
    </section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">3. 対戦カードを作る</h2>{data.bouts.map((bout,index) => <article key={bout.id} className="mt-4 rounded-2xl border-2 p-4"><div className="flex flex-wrap items-center gap-2"><b className="mr-auto text-xl">第{index + 1}試合</b><button onClick={() => move(index,-1)} className="rounded-lg border px-3 py-2">↑</button><button onClick={() => move(index,1)} className="rounded-lg border px-3 py-2">↓</button><button onClick={() => updateBout(index,{ redId:bout.blueId, blueId:bout.redId })} className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-white">赤青を入替</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="font-bold text-rose-700">赤<select className={field} value={bout.redId} onChange={(e) => updateBout(index,{redId:e.target.value})}><option value="">選手を選ぶ</option>{data.fighters.map((f)=><option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select></label><label className="font-bold text-blue-700">青<select className={field} value={bout.blueId} onChange={(e) => updateBout(index,{blueId:e.target.value})}><option value="">選手を選ぶ</option>{data.fighters.map((f)=><option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select></label><label className="font-bold">階級<input className={field} value={bout.className} onChange={(e)=>updateBout(index,{className:e.target.value})} /></label><label className="font-bold">ルール<input className={field} value={bout.rule} onChange={(e)=>updateBout(index,{rule:e.target.value})} /></label></div><button onClick={()=>edit('bouts',data.bouts.filter((_,i)=>i!==index))} className="mt-3 text-sm font-bold text-rose-700">この試合を削除</button></article>)}<button onClick={addBout} className="mt-4 w-full rounded-xl border-2 border-dashed border-indigo-300 p-4 font-black text-indigo-800">＋ 試合を追加</button></section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">4. 保存して確認する</h2>{errors.length ? <p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-800">{errors[0]}</p> : null}<button disabled={errors.length>0} onClick={()=>void save()} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">このパソコンの中だけに保存</button><a href={live} target="_blank" className="mt-3 block w-full rounded-xl bg-indigo-700 p-4 text-center text-xl font-black text-white">大会画面を開く</a></section>

    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">5. 暗号化バックアップ</h2><p className="mt-2 text-sm text-slate-300">故障に備える時だけ使います。10文字以上のパスワードで暗号化します。</p><input type="password" className={field + ' text-slate-950'} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="10文字以上のパスワード" /><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={()=>void download()} className="rounded-xl bg-emerald-600 p-3 font-black">暗号化して保存</button><label className="rounded-xl border border-slate-500 p-3 text-center font-black">バックアップを復元<input type="file" accept=".enc" className="mt-2 block w-full text-xs" onChange={(e)=>void restore(e.target.files?.[0])} /></label></div></section>
  </div></main>;
}
