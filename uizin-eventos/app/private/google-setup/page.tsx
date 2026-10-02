'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch } from '../../../core/entryPackage.ts';
import { isAppsScriptUrl, publicEntryHash } from '../../../core/publicEntry.ts';

const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 text-lg';

export default function GoogleSetup() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState('my-tournament');
  const [title, setTitle] = useState('大会名未設定');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [venueUrl, setVenueUrl] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [deadline, setDeadline] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [accountChecked, setAccountChecked] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [testChecked, setTestChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [entryConfig, setEntryConfig] = useState(DEFAULT_ENTRY_CONFIG);
  const [programTemplate, setProgramTemplate] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setEventId(params.get('event')?.trim() || 'my-tournament');
    setTitle(params.get('title')?.trim() || '大会名未設定');
    setDate(params.get('date')?.trim() || '');
    setVenue(params.get('venue')?.trim() || '');
    setVenueUrl(params.get('venueUrl')?.trim() || '');
    setEntryConfig(entryConfigFromSearch(location.search));
    setReady(true);
    fetch('/templates/Tournament_OS_Google受付.gs').then((response) => { if (!response.ok) throw new Error(); return response.text(); }).then(setProgramTemplate).catch(() => setMessage('準備に失敗しました。画面を再読み込みしてください。'));
  }, []);

  const applyLink = useMemo(() => '/apply/' + publicEntryHash({ endpoint, eventId, title, organizer, date, venue, venueUrl, deadline, contact, ...entryConfig }), [endpoint,eventId,title,organizer,date,venue,venueUrl,deadline,contact,entryConfig]);
  const copyProgram = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage('主催者本人のGoogleメールアドレスを入力してください。');
    if (!programTemplate) return setMessage('まだ準備中です。数秒後に、もう一度押してください。');
    const customized = programTemplate.replace("eventId: 'my-tournament'", `eventId: ${JSON.stringify(eventId)}`).replace("tournamentName: '大会名をここに入力'", `tournamentName: ${JSON.stringify(title)}`).replace("expectedOwner: '主催者のGoogleメールアドレス'", `expectedOwner: ${JSON.stringify(email.trim().toLowerCase())}`);
    try { await navigator.clipboard.writeText(customized); setMessage('受付プログラムをコピーしました。次は紫のボタンを押します。'); setStep(2); }
    catch { setMessage('コピーできませんでした。ブラウザの「クリップボードを許可」を押して、もう一度お試しください。'); }
  };
  const copyEntryLink = async () => {
    if (!isAppsScriptUrl(endpoint)) return setMessage('GoogleからコピーしたURLを貼ってください。');
    if (!testChecked) return setMessage('先にテスト申込を行い、Googleの申込表と写真を確認してください。');
    await navigator.clipboard.writeText(location.origin + applyLink);
    setMessage('選手へ渡すURLをコピーしました。');
  };

  if (!ready) return <main className="p-8">準備しています…</main>;
  return <main className="min-h-screen bg-indigo-50 px-4 py-8 text-slate-950">
<div className="mx-auto max-w-2xl">
    <header className="rounded-3xl bg-white p-6 text-center shadow-sm">
<p className="text-5xl">🥊☁️</p>
<h1 className="mt-3 text-3xl font-black">Google受付をつなぐ</h1>
<p className="mt-3 text-lg font-bold text-slate-700">今、黄色になっている所だけ行います。終わったら「できた」を押してください。</p>
<p className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">選手情報と写真は、主催者本人のGoogleだけに保存します。</p>
</header>
    {message?<p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-slate-900 p-4 font-bold text-white">{message}</p>:null}
    <nav className="my-4 grid grid-cols-5 gap-2 text-center text-xs font-black">{[1,2,3,4,5].map((number)=>
<span key={number} className={'rounded-lg p-2 '+(step===number?'bg-amber-300':'bg-white')}>{number}</span>)}</nav>

    {step===1?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">1 / 5</p>
<h2 className="mt-1 text-2xl font-black">主催者本人のGoogleを確認</h2>
<p className="mt-3 leading-relaxed">Googleを開き、右上の丸い写真を押します。大会主催者本人のアカウントになっているか確認します。</p>
<a href="https://myaccount.google.com/" target="_blank" className="mt-4 block rounded-2xl bg-blue-700 p-4 text-center text-xl font-black text-white">Googleの名前を確認する</a>
<label className="mt-4 block font-black">主催者本人のGoogleメールアドレス<input className={field} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="例：gym@example.com"/>
</label>
<label className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 font-bold">
<input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={accountChecked} onChange={(e)=>setAccountChecked(e.target.checked)}/>主催者本人のGoogleになっています</label>
<button disabled={!programTemplate||!accountChecked||!/^\S+@\S+\.\S+$/.test(email)} onClick={()=>void copyProgram()} className="mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300">確認できた → プログラムをコピー</button>
</section>:null}

    {step===2?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">2 / 5</p>
<h2 className="mt-1 text-2xl font-black">Googleの白い画面へ貼る</h2>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① 下の紫ボタンを押す</li>
<li>② 白い画面が開いたら、元からある文字を全部消す</li>
<li>③ キーボードで <kbd className="rounded bg-slate-200 px-2 py-1">⌘ V</kbd> を押して貼る</li>
<li>④ 上の「保存」💾を押す</li>
</ol>
<a href="https://script.google.com/home/projects/create" target="_blank" className="mt-5 block rounded-2xl bg-indigo-700 p-5 text-center text-xl font-black text-white">Googleの白い画面を開く</a>
<button onClick={()=>setStep(3)} className="mt-3 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">貼って保存できた →</button>
<button onClick={()=>void copyProgram()} className="mt-3 w-full rounded-xl border p-3 font-bold">もう一度コピーする</button>
</section>:null}

    {step===3?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">3 / 5</p>
<h2 className="mt-1 text-2xl font-black">申込表と写真フォルダを作る</h2>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① Google画面の上にある「関数なし ▼」を押す</li>
<li>② 出てきた一覧から <code>setupTournament</code> を押す（コピーする文字ではありません）</li>
<li>③ その右にある「実行」▶を押す</li>
<li>④ Googleから確認が出たら、主催者本人のアカウントを選んで許可する</li>
<li>⑤ 下に「実行完了」と出るまで待つ</li>
</ol>
<p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">違うGoogleアカウントでは動かない安全設定です。</p>
<button onClick={()=>setStep(4)} className="mt-5 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">「実行完了」が出た →</button>
<button onClick={()=>setStep(2)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}

    {step===4?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">4 / 5</p>
<h2 className="mt-1 text-2xl font-black">受付用URLを作る</h2>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① 右上の「デプロイ」を押す</li>
<li>② 「新しいデプロイ」を押す</li>
<li>③ 種類は「ウェブアプリ」</li>
<li>④ 実行するユーザーは「自分」</li>
<li>⑤ アクセスできるユーザーは「全員」</li>
<li>⑥ 「デプロイ」を押し、最後に出たURLをコピー</li>
</ol>
<p className="mt-4 rounded-xl bg-blue-50 p-4 font-bold text-blue-900">「全員」は申込を送れるという意味です。Googleの申込表と写真フォルダが全員に公開されるわけではありません。</p>
<button onClick={()=>setStep(5)} className="mt-5 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">URLをコピーできた →</button>
<button onClick={()=>setStep(3)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}

    {step===5?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">5 / 5</p>
<h2 className="mt-1 text-2xl font-black">最後に1回だけテストする</h2>
<label className="mt-4 block font-black">コピーしたGoogleのURLを貼る<input className={field} value={endpoint} onChange={(e)=>setEndpoint(e.target.value.trim())} placeholder="https://script.google.com/macros/s/.../exec"/>
</label>
<div className="mt-4 grid gap-3 sm:grid-cols-2">
<label className="font-bold">主催者名<input className={field} value={organizer} onChange={(e)=>setOrganizer(e.target.value)}/>
</label>
<label className="font-bold">申込締切<input className={field} value={deadline} onChange={(e)=>setDeadline(e.target.value)}/>
</label>
<label className="font-bold sm:col-span-2">問い合わせ先<input className={field} value={contact} onChange={(e)=>setContact(e.target.value)}/>
</label>
<label className="font-bold sm:col-span-2">会場のGoogle地図URL（任意）<input className={field} value={venueUrl} onChange={(e)=>setVenueUrl(e.target.value.trim())} placeholder="https://share.google/..."/>
</label>
</div>{isAppsScriptUrl(endpoint)?<a href={applyLink} target="_blank" className="mt-5 block rounded-2xl bg-indigo-700 p-5 text-center text-xl font-black text-white">テスト申込画面を開く</a>:<p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">GoogleのURLを貼ると、テストボタンが出ます。</p>}<label className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 font-bold">
<input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={testChecked} onChange={(e)=>setTestChecked(e.target.checked)}/>テスト申込が申込表に入り、写真もGoogle Driveに入った</label>
<button disabled={!testChecked||!isAppsScriptUrl(endpoint)||!organizer.trim()||!deadline.trim()} onClick={()=>void copyEntryLink()} className="mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300">完成：選手へ渡すURLをコピー</button>
<button onClick={()=>setStep(4)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}
  </div>
</main>;
}
