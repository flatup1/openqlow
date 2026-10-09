'use client';

import { useEffect, useState } from 'react';
import { boutWarnings, emptyTournament, importFighters, mergeFighters, validateTournament, type LocalFighter, type LocalTournament } from '../../core/privateTournament.ts';
import { formatDateInput, isCompleteDate } from '../../core/dateInput.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigSearch, entryErrors, type EntryFieldMode, type EntryFormConfig } from '../../core/entryPackage.ts';
import { bytesToArrayBuffer, decryptBackup, encryptBackup, photoToDataUrl, cloudStorage, PrivateSaveConflict, readPrivateEvent, writePrivateEvent } from '../lib/privateStore.ts';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
const blankFighter = (): LocalFighter => ({ id: crypto.randomUUID(), gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', photoDataUrl: '' });

export default function PrivateAdmin() {
  const [data, setData] = useState<LocalTournament>(() => emptyTournament('my-tournament'));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState<LocalFighter>(blankFighter);
  const [cloudMode,setCloudMode] = useState(false);
  const [password, setPassword] = useState('');
  const entryConfig: EntryFormConfig = data.entryConfig ?? DEFAULT_ENTRY_CONFIG;

  useEffect(() => {
    setCloudMode(cloudStorage());
    const id = new URLSearchParams(location.search).get('event')?.trim() || 'my-tournament';
    readPrivateEvent(id).then((saved) => { setData(saved ?? emptyTournament(id)); setReady(true); }).catch(() => { setLoadError(cloudStorage() ? 'クラウドの大会を読み取れませんでした。管理者の接続を確認してください。端末内データへの切り替えや上書きはしていません。' : 'このパソコンの保存データを読み取れませんでした。データは消していません。ブラウザの保存設定・空き容量を確認してください。'); setReady(true); });
  }, []);

  const save = async (next = data) => {
    try { const saved = await writePrivateEvent(next); setData(saved); setMessage(cloudStorage() ? 'クラウドに保存しました。別の端末でも同じ大会を開けます。' : 'このパソコンの中だけに保存しました。'); return true; }
    catch (error) { setMessage(error instanceof PrivateSaveConflict ? error.message + ' 入力内容は画面に残しています。必要な入力をメモしてから、この画面を読み直してください。' : '保存できませんでした。入力内容は画面に残しています。空き容量を確認して、もう一度保存してください。'); return false; }
  };
  const edit = <K extends keyof LocalTournament>(key: K, value: LocalTournament[K]) => setData((old) => ({ ...old, [key]: value, currentBout:key==='bouts'?Math.min(old.currentBout,Math.max(0,(value as LocalTournament['bouts']).length-1)):old.currentBout }));

  const readEntryFile = async (file?: File) => {
    if (!file) return;
    try {
      if(file.size>100*1024*1024)throw new Error('提出ファイルが大きすぎます。100MB以下にしてください。');
      let csv = '';
      let photos: Record<string, Uint8Array> = {};
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        if (file.size > 100 * 1024 * 1024) throw new Error('提出ファイルが大きすぎます。100MB以下にしてください。');
        const { strFromU8, unzipSync } = await import('fflate');
        let unpackedBytes=0, fileCount=0;
        const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:(entry)=>{
          fileCount++;unpackedBytes+=entry.originalSize;
          if(fileCount>3001||entry.originalSize>20*1024*1024||unpackedBytes>100*1024*1024)throw new Error('展開後のファイルが大きすぎます。100MB以下に分けてください。');
          return entry.name==='players.csv'||/^photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(entry.name);
        }});
        const keys = Object.keys(unpacked);
        if (keys.length > 3001) throw new Error('提出ファイル内の数が多すぎます。');
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
      if(!result.fighters.length)throw new Error('選手を1人も読み取れませんでした。見出しと名前を確認してください。今ある名簿は変えていません。');
      const fighters = await Promise.all(result.fighters.map(async (fighter) => {
        const photoEntry = Object.entries(photos).find(([name]) => name.replace(/^photos\//, '').replace(/\.[^.]+$/, '') === fighter.id);
        if (!photoEntry) return fighter;
        const extension = photoEntry[0].split('.').pop()?.toLowerCase();
        const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
        return { ...fighter, photoDataUrl: await photoToDataUrl(new File([bytesToArrayBuffer(photoEntry[1])], photoEntry[0], { type })) };
      }));
      // Validate before scheduling the state update; existing card order and current bout stay intact.
      mergeFighters(data.fighters,fighters);
      setData((old) => ({ ...old, fighters:mergeFighters(old.fighters,fighters) }));
      setMessage(fighters.length + '人分を読み込みました。同じ管理番号は更新し、新しい選手は追加します。元の選手・写真・対戦カード・試合順は削除していません。最後に保存してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。');
    }
  };

  const addManual = () => {
    const errors=entryErrors(manual,true,entryConfig);
    if(errors.length)return setMessage(errors[0]);
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
      const a = document.createElement('a'); a.href = url; a.download = data.eventId + '.tournament.enc'; a.click();
      // Give the browser time to start its download before releasing the file URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage('予備ファイルのダウンロードを始めました。パソコンの「ダウンロード」にファイルができたことを確認してください。パスワードは別に保管してください。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした。'); }
  };

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const restored = await decryptBackup(await file.text(), password);
      if(restored.eventId!==data.eventId)return setMessage('別の大会のバックアップです。この大会のデータは変えていません。');
      if(!window.confirm('この大会をバックアップの内容へ戻します。今のデータを上書きしてよろしいですか？'))return;
      if(await save({...restored,updatedAt:data.updatedAt}))setMessage('復元しました。内容を確認してください。');
    }
    catch { setMessage('復元できません。ファイルかパスワードを確認してください。'); }
  };

  if (!ready) return <main className="p-8">このパソコンのデータを読んでいます…</main>;
  if(loadError)return <main className="p-8"><p role="alert">{loadError}</p><button className="mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white" onClick={()=>location.reload()}>もう一度読み込む</button></main>;
  const errors = validateTournament(data);
  const live = '/cloud-manage/live/?event=' + encodeURIComponent(data.eventId)+(cloudMode?'&storage=cloud':'');
  const entryLink = '/private/entry/?' + entryConfigSearch(entryConfig);
  const setEntryMode = (key: 'grade' | 'age' | 'comment', value: EntryFieldMode) => edit('entryConfig', { ...entryConfig, [key]: value });
  const copyEntryLink = async () => {
    await navigator.clipboard.writeText(location.origin + entryLink);
    setMessage('設定済みのエントリーURLをコピーしました。');
  };
  const googleSetup = '/private/google-setup/?' + new URLSearchParams({ event:data.eventId, title:data.title, date:data.date, venue:data.venue, music:entryConfig.music?'on':'off', grade:entryConfig.grade, age:entryConfig.age, comment:entryConfig.comment }).toString();

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
<div className="mx-auto max-w-5xl">
    <header className="rounded-3xl bg-white p-6 shadow-sm">
<p className="font-black text-emerald-700">{cloudMode?"☁️ Cloudflare Tournament OS":"🔐 完全ローカル Tournament OS"}</p>
<h1 className="mt-2 text-3xl font-black">{cloudMode?"大会当日の名簿をクラウドに保存":"大会当日の名簿は、このパソコンに保存"}</h1>
<p className="mt-3 leading-relaxed text-slate-700">{cloudMode?"名簿・写真・対戦カードは、認証したCloudflareの大会に保存します。写真を含めて8MBまでです。Googleから個人情報は取得しません。":"Cloudflareには、この空の画面だけがあります。選手名・写真・体重・対戦表は、このブラウザの中だけに保存します。"}</p>
<div className="mt-4 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">{cloudMode?"別の端末でも、認証後に同じ大会コードで保存した内容を開けます。":"別のパソコンには自動で同期しません。同じパソコンの別タブだけが同じ内容になります。"}</div>
</header>
    {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-indigo-700 p-4 font-bold text-white shadow">{message}</p> : null}
    {!cloudMode && <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm"><p className="text-4xl">🌐</p><h2 className="mt-2 text-2xl font-black">選手本人からネットで申し込みを受ける</h2><p className="mt-3 leading-relaxed text-slate-700">主催者本人のGoogleに、申込表と写真フォルダを作ります。画面の説明どおり、上から1つずつ進めます。</p><a href={googleSetup} onClick={async(e)=>{e.preventDefault();if(await save())location.href=googleSetup;}} className="mt-4 block rounded-2xl bg-indigo-700 p-5 text-center text-xl font-black text-white">はじめてのGoogle受付設定を開く →</a><p className="mt-3 text-center text-sm font-bold text-emerald-800">選手情報はCloudflareへ保存しません</p></section>}

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
<h2 className="text-2xl font-black">1. 大会の基本情報</h2>
<div className="mt-4 grid gap-3 sm:grid-cols-3">
<label className="font-bold">大会名<input className={field} value={data.title} onChange={(e) => edit('title', e.target.value)} />
</label>
<label className="font-bold">開催日<input className={field} inputMode="numeric" placeholder="例: 20271003" value={data.date} onChange={(e) => edit('date', e.target.value)} onBlur={(e) => { const next = formatDateInput(e.target.value); if (next !== e.target.value) edit('date', next); }} />
{data.date.trim() && !isCompleteDate(data.date) ? <span role="alert" className="mt-1 block text-sm font-bold text-rose-700">日にちまで入れてください。例：20271003（半角でも全角でもOK）</span> : <span className="mt-1 block text-sm font-normal text-slate-500">数字だけでOK。20271003 → 2027年10月3日</span>}
</label>
<label className="font-bold">会場<input className={field} value={data.venue} onChange={(e) => edit('venue', e.target.value)} />
</label>
</div>
</section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
<h2 className="text-2xl font-black">2. 選手を入れる</h2>
<div className="mt-4 rounded-2xl bg-blue-50 p-5">
<h3 className="text-xl font-black text-blue-950">先に、募集項目を決める</h3>
<label className="mt-3 flex items-center gap-3 font-bold">
<input type="checkbox" checked={entryConfig.music} onChange={(e)=>edit('entryConfig',{...entryConfig,music:e.target.checked})} className="h-5 w-5"/>この大会は入場曲を使う</label>
<p className="mt-3 text-sm font-bold text-blue-950">写真・身長・体重・戦績・ジム名・選手名は必ず入力されます。</p>
<div className="mt-3 grid gap-3 sm:grid-cols-3">{([['grade','学年'],['age','年齢'],['comment','意気込み']] as const).map(([key,label])=>
<label key={key} className="font-bold">{label}<select className={field} value={entryConfig[key]} onChange={(e)=>setEntryMode(key,e.target.value as EntryFieldMode)}>
<option value="off">表示しない</option>
<option value="optional">任意で入力</option>
<option value="required">必須にする</option>
</select>
</label>)}</div>
<div className="mt-4 grid gap-3 sm:grid-cols-2">
<a href={entryLink} target="_blank" className="rounded-xl bg-emerald-700 p-4 text-center text-lg font-black text-white">設定した入力画面を確認</a>
<button onClick={()=>void copyEntryLink()} className="rounded-xl bg-blue-700 p-4 text-lg font-black text-white">会長へ渡すURLをコピー</button>
</div>
</div>
<div className="mt-4 grid gap-3 sm:grid-cols-3">
<div className="rounded-xl bg-blue-50 p-4">
<b className="text-blue-900">① URLを渡す</b>
<p className="mt-1 text-sm text-blue-950">設定済みURLを他ジムの会長へ渡します。</p>
</div>
<div className="rounded-xl bg-amber-50 p-4">
<b className="text-amber-900">② 会長が選手を入力</b>
<p className="mt-1 text-sm text-amber-950">CSVと写真が1つにまとまります。</p>
</div>
<div className="rounded-xl bg-emerald-50 p-4">
<b className="text-emerald-900">③ ここで読み込む</b>
<p className="mt-1 text-sm text-emerald-950">返ってきたZIPを選ぶだけです。</p>
</div>
</div>
<details className="mt-3 rounded-xl border p-4">
<summary className="cursor-pointer font-black">Excelシートを使う場合</summary>
<a href="/templates/Tournament_OS_選手入力テンプレート.xlsx" download className="mt-3 block rounded-xl bg-blue-700 p-3 text-center font-black text-white">選手入力シートを保存する</a>
</details>
<p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">電話番号・メール・住所・生年月日・保護者名は入れません。入力データはCloudflareへ送りません。</p>
<label className="mt-4 block rounded-xl border-2 border-dashed border-indigo-300 p-5 text-center font-black text-indigo-800">返ってきた提出ファイルを選ぶ<input type="file" accept=".zip,.xlsx,.csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="mt-3 block w-full" onChange={(e) => void readEntryFile(e.target.files?.[0])} />
</label>
<details className="mt-4 rounded-xl border p-4">
<summary className="cursor-pointer font-black">1人ずつ手入力する</summary>
<div className="mt-4 grid gap-3 sm:grid-cols-3">{([['name','選手名'],['gym','ジム名'],['grade','学年'],['age','年齢'],['height','身長'],['weight','体重'],['record','戦績'],['comment','意気込み'],['musicUrl','入場曲URL']] as const).map(([key,label]) => <label key={key} className="font-bold">{label}<input className={field} value={manual[key]} onChange={(e) => setManual((old) => ({ ...old, [key]: e.target.value }))} />
</label>)}</div>
<button onClick={addManual} className="mt-4 rounded-xl bg-indigo-700 px-5 py-3 font-black text-white">この選手を追加</button>
</details>
<p className="mt-4 rounded-xl bg-emerald-50 p-4 font-black text-emerald-900">現在 {data.fighters.length}人</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.fighters.map((fighter, index) => <article key={fighter.id} className="rounded-xl border p-3">
<div className="flex gap-3">
<div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">{fighter.photoDataUrl ? <img src={fighter.photoDataUrl} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center text-xs text-slate-500">画像なし</span>}</div>
<div>
<b>{fighter.name}</b>
<p className="text-sm text-slate-600">{fighter.gym} / {fighter.weight || '体重未入力'}</p>
<label className="mt-2 block text-xs font-bold">写真<input type="file" accept="image/*" className="block max-w-[240px] text-xs" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const photoDataUrl = await photoToDataUrl(file); edit('fighters', data.fighters.map((item, i) => i === index ? { ...item, photoDataUrl } : item)); } catch (error) { setMessage(error instanceof Error ? error.message : '画像を読めませんでした。'); } }} />
</label>
</div>
</div>
</article>)}</div>
    </section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
<h2 className="text-2xl font-black">3. 対戦カードを作る</h2>{data.bouts.map((bout,index) => <article key={bout.id} className="mt-4 rounded-2xl border-2 p-4">
<div className="flex flex-wrap items-center gap-2">
<b className="mr-auto text-xl">第{index + 1}試合</b>
<button disabled={index===0} onClick={() => move(index,-1)} className="rounded-lg border px-3 py-2 disabled:text-slate-300">↑ 上へ</button>
<button disabled={index===data.bouts.length-1} onClick={() => move(index,1)} className="rounded-lg border px-3 py-2 disabled:text-slate-300">↓ 下へ</button>
<button onClick={() => updateBout(index,{ redId:bout.blueId, blueId:bout.redId })} className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-white">赤青を入替</button>
</div>
<div className="mt-3 grid gap-3 sm:grid-cols-2">
<label className="font-bold text-rose-700">赤コーナー<select aria-label="赤コーナーの選手" className={field} value={bout.redId} onChange={(e) => updateBout(index,{redId:e.target.value})}>
<option value="">選手を選ぶ</option>{data.fighters.map((f)=>
<option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select>
</label>
<label className="font-bold text-blue-700">青コーナー<select aria-label="青コーナーの選手" className={field} value={bout.blueId} onChange={(e) => updateBout(index,{blueId:e.target.value})}>
<option value="">選手を選ぶ</option>{data.fighters.map((f)=>
<option key={f.id} value={f.id}>{f.name}（{f.gym}）</option>)}</select>
</label>
<label className="font-bold">階級<input className={field} value={bout.className} onChange={(e)=>updateBout(index,{className:e.target.value})} />
</label>
<label className="font-bold">ルール<input className={field} value={bout.rule} onChange={(e)=>updateBout(index,{rule:e.target.value})} />
</label>
</div>
{boutWarnings(bout,data.fighters,data.bouts).map((w)=><p key={w} role="status" className="mt-3 rounded-xl bg-amber-100 p-3 font-bold text-amber-950">⚠ {w}</p>)}
<button onClick={()=>edit('bouts',data.bouts.filter((_,i)=>i!==index))} className="mt-3 text-sm font-bold text-rose-700">この試合を削除</button>
</article>)}<button onClick={addBout} className="mt-4 w-full rounded-xl border-2 border-dashed border-indigo-300 p-4 font-black text-indigo-800">＋ 試合を追加</button>
</section>

    <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
<h2 className="text-2xl font-black">4. 保存して確認する</h2>{errors.length ? <p className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-800">{errors[0]}</p> : null}<button disabled={errors.length>0} onClick={()=>void save()} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 text-xl font-black text-white disabled:bg-slate-300">{cloudMode?"クラウドに保存":"このパソコンの中だけに保存"}</button>
<a href={live} target="_blank" className="mt-3 block w-full rounded-xl bg-indigo-700 p-4 text-center text-xl font-black text-white">大会画面を開く</a>
</section>

    <section className="my-5 rounded-2xl bg-slate-900 p-6 text-white">
<h2 className="text-xl font-black">5. 暗号化バックアップ</h2>
<p className="mt-2 text-sm text-slate-300">名簿や対戦カードを直したら、ここで予備のファイルを保存します。パソコンの故障やブラウザのデータ消去に備えます。10文字以上のパスワードで鍵をかけます。</p>
<p className="mt-2 text-sm text-amber-200">名簿・写真・対戦カード・募集項目の設定が入ります。Google受付の接続設定は別です。予備ファイルはUSBなどにも保管し、パスワードは別に控えてください。</p>
<input type="password" className={field + ' text-slate-950'} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="10文字以上のパスワード" />
<div className="mt-3 grid gap-3 sm:grid-cols-2">
<button onClick={()=>void download()} className="rounded-xl bg-emerald-600 p-3 font-black">暗号化して保存</button>
<label className="rounded-xl border border-slate-500 p-3 text-center font-black">バックアップを復元<input type="file" accept=".enc" className="mt-2 block w-full text-xs" onChange={(e)=>void restore(e.target.files?.[0])} />
</label>
</div>
</section>
  </div>
</main>;
}
