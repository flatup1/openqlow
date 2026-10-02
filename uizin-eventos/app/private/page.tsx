'use client';

import { useEffect, useMemo, useState } from 'react';
import { emptyTournament, importFighters, validateTournament, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigSearch, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { EMPTY_PUBLIC_ENTRY_CONFIG, isAppsScriptUrl, publicEntryHash, type PublicEntryConfig } from '../../core/publicEntry.ts';
import { bytesToArrayBuffer, decryptBackup, encryptBackup, photoToDataUrl, readPrivateEvent, writePrivateEvent } from '../lib/privateStore.ts';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });

export default function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament('my-tournament'));
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState<LocalFighter>(blankFighter);
  const [password, setPassword] = useState('');
  const [entryConfig, setEntryConfig] = useState<EntryFormConfig>(DEFAULT_ENTRY_CONFIG);
  const [publicConfig, setPublicConfig] = useState<PublicEntryConfig>(EMPTY_PUBLIC_ENTRY_CONFIG);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('event')?.trim() || 'my-tournament';
    readPrivateEvent(id).then((saved) => { const next=saved ?? emptyTournament(id); setData(next); setPublicConfig((old)=>({...old,eventId:id,title:next.title,date:next.date,venue:next.venue})); setReady(true); }).catch(() => { setData(emptyTournament(id)); setPublicConfig((old)=>({...old,eventId:id})); setReady(true); });
  }, []);

  const byId = useMemo(() => new Map(data.fighters.map((fighter) => [fighter.id, fighter])), [data.fighters]);
  const save = async (next = data) => { await writePrivateEvent(next); setData(next); setMessage('このパソコンの中だけに保存しました。'); };
  const edit = <K extends keyof LocalTournament>(key: K, value: LocalTournament[K]) => setData((old) => ({ ...old, [key]: value }));

  const readEntryFile = async (file?: File) => {
    if (!file) return;
    if ((data.fighters.length || data.bouts.length) && !window.confirm('今ある選手と対戦カードを、新しいファイルの内容に入れ替えます。よろしいですか？')) return;
    try {
      let csv = '';
      let photos: Record<string, Uint8Array> = {};
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        if (file.size > 100 * 1024 * 1024) throw new Error('提出ファイルが大きすぎます。100MB以下にしてください。');
        const { strFromU8, unzipSync } = await import('fflate');
        const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const keys = Object.keys(unpacked);
        if (keys.length > 500) throw new Error('提出ファイル内の数が多すぎます。');
        const csvBytes = unpacked['players.csv'];
        if (!csvBytes) throw new Error('提出ファイルの中にplayers.csvがありません。');
        csv = strFromU8(csvBytes).replace(/^\uFEFF/, '');
        photos = Object.fromEntries(Object.entries(unpacked).filter(([name]) => /^photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(name)));
      } else if (lower.endsWith('.xlsx')) {
        const { readSheet } = await import('read-excel-file/browser');
        const rows = await readSheet(file, '選手入力');
        csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
      } else {
        csv = await file.text();
      }
      const result = importFighters(csv);
      if (result.blockedHeaders.length) return setMessage('安全のため読み込みを止めました。削除する列: ' + result.blockedHeaders.join('、'));
      const fighters = await Promise.all(result.fighters.map(async (fighter) => {
        const photoEntry = Object.entries(photos).find(([name]) => name.replace(/^photos\//, '').replace(/\.[^.]+$/, '') === fighter.id);
        if (!photoEntry) return fighter;
        const extension = photoEntry[0].split('.').pop()?.toLowerCase();
        const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
        return { ...fighter, photoDataUrl: await photoToDataUrl(new File([bytesToArrayBuffer(photoEntry[1])], photoEntry[0], { type })) };
      }));
      setData((old) => ({ ...old, fighters, bouts: [] }));
      setMessage(fighters.length + '人と写真' + fighters.filter((fighter) => fighter.photoDataUrl).length + '枚を読み込みました。まだこのパソコン内だけです。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。');
    }
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
  const entryLink = '/private/entry/?' + entryConfigSearch(entryConfig);
  const setEntryMode = (key: 'grade' | 'age' | 'comment', value: EntryFieldMode) => setEntryConfig((old) => ({ ...old, [key]: value }));
  const copyEntryLink = async () => {
    await navigator.clipboard.writeText(location.origin + entryLink);
    setMessage('設定済みのエントリーURLをコピーしました。');
  };
  const publicApplyLink = '/apply/' + publicEntryHash({ ...publicConfig, eventId:data.eventId, title:publicConfig.title || data.title, date:publicConfig.date || data.date, venue:publicConfig.venue || data.venue, music:entryConfig.music, grade:entryConfig.grade, age:entryConfig.age, comment:entryConfig.comment });
  const copyPublicApplyLink = async () => {
    if (!isAppsScriptUrl(publicConfig.endpoint)) return setMessage('先にGoogle受付URLを貼ってください。');
    await navigator.clipboard.writeText(location.origin + publicApplyLink);
    setMessage('選手本人へ渡す一般公開フォームのURLをコピーしました。');
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><div className="mx-auto max-w-5xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-black text-emerald-700">🔐 完全ローカル Tournament OS</p><h1 className="mt-2 text-3xl font-black">個人情報は、このパソコンから出ません</h1><p className="mt-3 leading-relaxed text-slate-700">Cloudflareには、この空の画面だけがあります。選手名・写真・体重・対戦表は、このブラウザの中だけに保存します。</p><div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">別のパソコンには自動で同期しません。同じパソコンの別タブだけが同じ内容になります。</div></header>
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><p className="font-black text-indigo-700">🌐 選手本人が1人ずつ申し込む場合</p><h2 className="mt-1 text-2xl font-black">主催者のGoogleへ直接ためる</h2><p className="mt-3 leading-relaxed text-slate-700">Cloudflareには画面だけを置きます。選手情報と写真は、ここで指定した主催者本人のGoogleスプレッドシート・Driveだけへ届きます。</p><div className="mt-4 rounded-2xl bg-amber-50 p-5"><h3 className="text-lg font-black">初回だけ、主催者本人が行う3つ</h3><ol className="mt-2 list-decimal space-y-2 pl-6"><li>主催者本人のGoogleアカウントでApps Scriptを開く</li><li>下の受付プログラムを貼り、説明どおりに設定する</li><li>できた「ウェブアプリURL」をこの欄へ貼る</li></ol><a href="/templates/Tournament_OS_Google受付.gs" download className="mt-4 block rounded-xl bg-slate-900 p-4 text-center font-black text-white">Google受付プログラムを保存</a></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="font-bold sm:col-span-2">Google受付URL 必須<input className={field} value={publicConfig.endpoint} placeholder="https://script.google.com/macros/s/.../exec" onChange={(e)=>setPublicConfig((old)=>({...old,endpoint:e.target.value}))}/><span className="mt-1 block text-xs text-slate-600">主催者本人が作成したウェブアプリURLだけを使います。</span></label><label className="font-bold">主催者名<input className={field} value={publicConfig.organizer} onChange={(e)=>setPublicConfig((old)=>({...old,organizer:e.target.value}))}/></label><label className="font-bold">申込締切<input className={field} value={publicConfig.deadline} onChange={(e)=>setPublicConfig((old)=>({...old,deadline:e.target.value}))}/></label><label className="font-bold sm:col-span-2">問い合わせ先<input className={field} value={publicConfig.contact} placeholder="公式LINEなど" onChange={(e)=>setPublicConfig((old)=>({...old,contact:e.target.value}))}/></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><a href={publicApplyLink} target="_blank" className="rounded-xl bg-indigo-700 p-4 text-center text-lg font-black text-white">一般公開フォームを確認</a><button onClick={()=>void copyPublicApplyLink()} className="rounded-xl bg-emerald-700 p-4 text-lg font-black text-white">選手へ渡すURLをコピー</button></div><p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">重要：別の人のGoogleアカウントで設定すると、その人のGoogleへ保存されます。必ず主催者本人のアカウントで作成してください。</p></section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">1. 大会の基本情報</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="font-bold">大会名<input className={field} value={data.title} onChange={(e) => edit('title', e.target.value)} /></label><label className="font-bold">開催日<input className={field} value={data.date} onChange={(e) => edit('date', e.target.value)} /></label><label className="font-bold">会場<input className={field} value={data.venue} onChange={(e) => edit('venue', e.target.value)} /></label></div></section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">2. 選手を入れる</h2><div className="mt-4 rounded-2xl bg-blue-50 p-5"><h3 className="text-xl font-black text-blue-950">先に、募集項目を決める</h3><label className="mt-3 flex items-center gap-3 font-bold"><input type="checkbox" checked={entryConfig.music} onChange={(e)=>setEntryConfig((old)=>({...old,music:e.target.checked}))} className="h-5 w-5"/>この大会は入場曲を使う</label><p className="mt-3 text-sm font-bold text-blue-950">写真・身長・体重・戦績・ジム名・選手名は必ず入力されます。</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{([['grade','学年'],['age','年齢'],['comment','意気込み']] as const).map(([key,label])=><label key={key} className="font-bold">{label}<select className={field} value={entryConfig[key]} onChange={(e)=>setEntryMode(key,e.target.value as EntryFieldMode)}><option value="off">表示しない</option><option value="optional">任意で入力</option><option value="required">必須にする</option></select></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><a href={entryLink} target="_blank" className="rounded-xl bg-emerald-700 p-4 text-center text-lg font-black text-white">設定した入力画面を確認</a><button onClick={()=>void copyEntryLink()} className="rounded-xl bg-blue-700 p-4 text-lg font-black text-white">会長へ渡すURLをコピー</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><b className="text-blue-900">① URLを渡す</b><p className="mt-1 text-sm text-blue-950">設定済みURLを他ジムの会長へ渡します。</p></div><div className="rounded-xl bg-amber-50 p-4"><b className="text-amber-900">② 会長が選手を入力</b><p className="mt-1 text-sm text-amber-950">CSVと写真が1つにまとまります。</p></div><div className="rounded-xl bg-emerald-50 p-4"><b className="text-emerald-900">③ ここで読み込む</b><p className="mt-1 text-sm text-emerald-950">返ってきたZIPを選ぶだけです。</p></div></div><details className="mt-3 rounded-xl border p-4"><summary className="cursor-pointer font-black">Excelシートを使う場合</summary><a href="/templates/Tournament_OS_選手入力テンプレート.xlsx" download className="mt-3 block rounded-xl bg-blue-700 p-3 text-center font-black text-white">選手入力シートを保存する</a></details><p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">電話番号・メール・住所・生年月日・保護者名は入れません。入力データはCloudflareへ送りません。</p><label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 p-5 text-center font-black text-indigo-800">返ってきた提出ファイルを選ぶ<input type="file" accept=".zip,.xlsx,.csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="mt-3 block w-full" onChange={(e) => void readEntryFile(e.target.files?.[0])} /></label><details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">1人ずつ手入力する</summary><div className="mt-4 grid gap-3 sm:grid-cols-3">{([['name','選手名'],['gym','ジム名'],['grade','学年'],['age','年齢'],['height','身長'],['weight','体重'],['record','戦績'],['comment','意気込み'],['musicUrl','入場曲URL']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input className={field} value={manual[key]} onChange={(e) => setManual((old) => ({ ...old, [key]: e.target.value }))} /></label>)}</div><button onClick={addManual} className="mt-4 rounded-xl bg-indigo-700 px-5 py-3 font-black text-white">この選手を追加</button></details><p className="mt-4 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {data.fighters.length}人</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.fighters.map((fighter, index) => <article key={fighter.id} className="rounded-xl border p-3"><div className="flex gap-3"><div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center text-xs text-slate-500">画像なし</span>}</div><div><b>{fighter.name}</b><p className="text-sm text-slate-600">{fighter.gym} / {fighter.weight || '体重未入力'}</p><label className="mt-2 block text-xs font-bold">写真<input type="file" accept="image/*" className="block max-w-[240px] text-xs" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const photoDataUrl = await photoToDataUrl(file); edit('fighters', data.fighters.map((item, i) => i === index ? { ...item, photoDataUrl } : item)); } catch (error) { setMessage(error instanceof Error ? error.message : '画像を読めませんでした。'); } }} /></label></div></div></article>)}</div>
    </section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">3. 対戦カードを作る</h2>{data.bouts.map((bout,index) => <article key={bout.id} className="mt-4 rounded-2xl border-2 p-4"><div className="flex flex-wrap items-center gap-2"><b className="mr-auto text-xl">第{index + 1}試合</b><button onClick={() => move(index,-1)} className="rounded-lg border px-3 py-2">↑</button><button onClick={() => move(index,1)} className="rounded-lg border px-3 py-2">↓</button><button onClick={() => updateBout(index,{ redId:bout.blueId, blueId:bout.redId })} className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-white">赤青を入替</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="font-bold text-rose-700">赤<select className={field} value={bout.redId} onChange={(e) => updateBout(index,{redId:e.target.value})}><option value="">選手を選ぶ</option>{data.fighters.map((f)=><option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select></label><label className="font-bold text-blue-700">青<select className={field} value={bout.blueId} onChange={(e) => updateBout(index,{blueId:e.target.value})}><option value="">選手を選ぶ</option>{data.fighters.map((f)=><option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select></label><label className="font-bold">階級<input className={field} value={bout.className} onChange={(e)=>updateBout(index,{className:e.target.value})} /></label><label className="font-bold">ルール<input className={field} value={bout.rule} onChange={(e)=>updateBout(index,{rule:e.target.value})} /></label></div><button onClick={()=>edit('bouts',data.bouts.filter((_,i)=>i!==index))} className="mt-3 text-sm font-bold text-rose-700">この試合を削除</button></article>)}<button onClick={addBout} className="mt-4 w-full rounded-xl border-2 border-dashed border-indigo-300 p-4 font-black text-indigo-800">＋ 試合を追加</button></section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">4. 保存して確認する</h2>{errors.length ? <p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-800">{errors[0]}</p> : null}<button disabled={errors.length>0} onClick={()=>void save()} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">このパソコンの中だけに保存</button><a href={live} target="_blank" className="mt-3 block w-full rounded-xl bg-indigo-700 p-4 text-center text-xl font-black text-white">大会画面を開く</a></section>

    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">5. 暗号化バックアップ</h2><p className="mt-2 text-sm text-slate-300">故障に備える時だけ使います。10文字以上のパスワードで暗号化します。</p><input type="password" className={field + ' text-slate-950'} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="10文字以上のパスワード" /><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={()=>void download()} className="rounded-xl bg-emerald-600 p-3 font-black">暗号化して保存</button><label className="rounded-xl border border-slate-500 p-3 text-center font-black">バックアップを復元<input type="file" accept=".enc" className="mt-2 block w-full text-xs" onChange={(e)=>void restore(e.target.files?.[0])} /></label></div></section>
  </div></main>;
}
