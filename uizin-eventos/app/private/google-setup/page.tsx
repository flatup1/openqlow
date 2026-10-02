'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch } from '../../../core/entryPackage.ts';
import { publicEntryHash } from '../../../core/publicEntry.ts';
import { createGoogleConnectionRequest, deadlineIso, googleConnectionFresh, verifyGoogleConnection, type GoogleConnection, type GoogleConnectionRequest } from '../../../core/googleConnection.ts';
import { isAppsScriptUrl } from '../../../core/publicEntry.ts';

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
  const [setupKey, setSetupKey] = useState('');
  const [code, setCode] = useState('');
  const [connection, setConnection] = useState<GoogleConnection | null>(null);
  const [message, setMessage] = useState('');
  const [entryConfig, setEntryConfig] = useState(DEFAULT_ENTRY_CONFIG);
  const [programTemplate, setProgramTemplate] = useState('');
  const [generatedProgram, setGeneratedProgram] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [request, setRequest] = useState<GoogleConnectionRequest | null>(null);
  const [draftRequest, setDraftRequest] = useState<GoogleConnectionRequest | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setEventId(params.get('event')?.trim() || 'my-tournament');
    setTitle(params.get('title')?.trim() || '大会名未設定');
    setDate(params.get('date')?.trim() || '');
    setVenue(params.get('venue')?.trim() || '');
    setVenueUrl(params.get('venueUrl')?.trim() || '');
    setEntryConfig(entryConfigFromSearch(location.search));
    try {
      const id=params.get('event')?.trim()||'my-tournament';
      const saved=JSON.parse(localStorage.getItem('tournament-google-setup:'+id)||sessionStorage.getItem('tournament-google-setup:'+id)||'null');
      if (saved && /^[\w-]{32,100}$/.test(saved.setupKey)) {
        setSetupKey(saved.setupKey);setEmail(saved.email||'');setTitle(params.get('title')?.trim()||saved.title||'大会名未設定');setDate(params.get('date')?.trim()||saved.date||'');setVenue(params.get('venue')?.trim()||saved.venue||'');setVenueUrl(params.get('venueUrl')?.trim()||saved.venueUrl||'');setDeadline(saved.deadline||'');setOrganizer(saved.organizer||'');setContact(saved.contact||'');setStep([1,2,3,4,5].includes(saved.step)?saved.step:1);setAccountChecked(Boolean(saved.accountChecked));
        if(!params.has('music')&&saved.entryConfig)setEntryConfig(entryConfigFromSearch('?'+new URLSearchParams({...saved.entryConfig,music:saved.entryConfig.music?'on':'off'}).toString()));
        setCode(saved.code||'');
        setEndpoint(saved.endpoint||'');setRequest(saved.request||null);
      } else setSetupKey(crypto.randomUUID()+crypto.randomUUID());
    } catch { setSetupKey(crypto.randomUUID()+crypto.randomUUID()); }
    setReady(true);
    fetch('/templates/Tournament_OS_Google受付.gs').then((response) => { if (!response.ok) throw new Error(); return response.text(); }).then(setProgramTemplate).catch(() => setMessage('準備に失敗しました。画面を再読み込みしてください。'));
  }, []);

  const policy=JSON.stringify({title,deadline:deadlineIso(deadline),...entryConfig});
  useEffect(()=>{
    if(!ready||!setupKey)return;
    try { localStorage.setItem('tournament-google-setup:'+eventId,JSON.stringify({setupKey,email,title,date,venue,venueUrl,deadline,organizer,contact,step,accountChecked,code,entryConfig,endpoint,request})); } catch { setMessage('設定をこのブラウザに保存できません。この画面を閉じずに設定を続けてください。'); }
  },[ready,setupKey,eventId,email,title,date,venue,venueUrl,deadline,organizer,contact,step,accountChecked,code,entryConfig,endpoint,request]);
  useEffect(()=>{
    setDraftRequest(null);if(!ready||!isAppsScriptUrl(endpoint))return;
    let active=true;
    createGoogleConnectionRequest(endpoint,setupKey,eventId).then(value=>{if(active)setDraftRequest(value);}).catch(()=>{});
    return()=>{active=false;};
  },[ready,endpoint,setupKey,eventId,requestVersion]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    setConnection(null);
    if(!code||!setupKey)return;
    let active=true;
    verifyGoogleConnection(code,setupKey,eventId,email,policy,request).then((result)=>{if(active)setConnection(result);}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'接続を確認し直してください。');});
    return()=>{active=false;};
  },[code,setupKey,eventId,email,policy,request,endpoint]);
  const applyLink=(mode:'test'|'live')=>'/apply/'+publicEntryHash({endpoint:connection?.endpoint||'',protocol:'2',entryKey:mode==='test'?connection?.testKey||'':connection?.entryKey||'',mode,eventId,title,organizer,date,venue,venueUrl,deadline,contact,...entryConfig});
  const testReady=Boolean(googleConnectionFresh(connection,now)&&connection?.endpoint===endpoint.trim());
  const canShare=Boolean(googleConnectionFresh(connection,now)&&connection?.endpoint===endpoint.trim()&&connection?.testComplete&&connection.accepting&&organizer.trim()&&deadlineIso(date)&&venue.trim()&&deadlineIso(deadline)&&Date.parse(deadlineIso(deadline)+'T23:59:59+09:00')>=now&&deadlineIso(deadline)<=deadlineIso(date)&&contact.trim());
  const copyProgram = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage('主催者本人のGoogleメールアドレスを入力してください。');
    if (!programTemplate) return setMessage('まだ準備中です。数秒後に、もう一度押してください。');
    if (!title.trim()||title==='大会名未設定'||!deadlineIso(deadline)) return setMessage('大会名と申込締切を先に入力してください。');
    if(Date.parse(deadlineIso(deadline)+'T23:59:59+09:00')<Date.now())return setMessage('申込締切が過ぎています。これから募集する締切の日付を入れてください。');
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventId))return setMessage('大会の管理番号が正しくありません。大会準備画面へ戻って確認してください。');
    try{localStorage.setItem('tournament-google-setup:'+eventId,JSON.stringify({setupKey,email,title,date,venue,venueUrl,deadline,organizer,contact,step,accountChecked,code,entryConfig,endpoint,request}));}
    catch{return setMessage('設定をこのブラウザに保存できません。データを消さず、通常のブラウザで開き直してください。');}
    const settings={eventId,tournamentName:title,expectedOwner:email.trim().toLowerCase(),setupKey,deadline:deadlineIso(deadline),...entryConfig};
    const customized = programTemplate.replace(/^const SETTINGS = .*;$/m,'const SETTINGS = '+JSON.stringify(settings)+';');
    setGeneratedProgram(customized);
    try { await navigator.clipboard.writeText(customized); setMessage('受付プログラムをコピーしました。次は紫のボタンを押します。'); setStep(2); }
    catch { setMessage('コピーできませんでした。ブラウザの「クリップボードを許可」を押して、もう一度お試しください。'); }
  };
  const copyEntryLink = async () => {
    if (!canShare) return setMessage('Googleの接続確認とテスト申込を最後まで行ってください。');
    if(!googleConnectionFresh(connection))return setMessage('確認から時間が過ぎました。「Googleの接続を確かめる」で受付の状態を確認し直してください。');
    try { await navigator.clipboard.writeText(location.origin+applyLink('live'));setMessage('選手へ渡すURLをコピーしました。'); }
    catch {setMessage('コピーを許可して、もう一度押してください。');}
  };

  if (!ready) return <main className="p-8">準備しています…</main>;
  return <main className="min-h-screen bg-indigo-50 px-4 py-8 text-slate-950">
<div className="mx-auto max-w-2xl">
    <header className="rounded-3xl bg-white p-6 text-center shadow-sm">
<p className="text-5xl">🥊☁️</p>
<h1 className="mt-3 text-3xl font-black">Google受付をつなぐ</h1>
<p className="mt-3 text-lg font-bold text-slate-700">今、黄色になっている所だけ行います。終わったら「できた」を押してください。</p>
<p className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">選手情報と写真は、主催者本人のGoogleだけに保存します。</p>
<p className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">会長ごとに、この設定を最初から行います。他の会長が作った受付URLは使い回しません。</p>
</header>
    {message?<p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-slate-900 p-4 font-bold text-white">{message}</p>:null}
    <nav className="my-4 grid grid-cols-5 gap-2 text-center text-xs font-black">{[1,2,3,4,5].map((number)=>
<span key={number} className={'rounded-lg p-2 '+(step===number?'bg-amber-300':'bg-white')}>{number}</span>)}</nav>

    {step===1?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">1 / 5</p>
<h2 className="mt-1 text-2xl font-black">主催者本人のGoogleを確認</h2>
<p className="mt-3 leading-relaxed">大会主催者が自分でGoogleを開き、右上の丸い写真を押します。大会主催者本人のアカウントになっているか確認します。</p>
<a href="https://myaccount.google.com/" target="_blank" className="mt-4 block rounded-2xl bg-blue-700 p-4 text-center text-xl font-black text-white">Googleの名前を確認する</a>
<label className="mt-4 block font-black">主催者本人のGoogleメールアドレス<input className={field} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="例：gym@example.com"/>
</label>
<label className="mt-4 block font-black">大会名<input className={field} value={title} onChange={(e)=>setTitle(e.target.value)}/></label>
<label className="mt-4 block font-black">申込締切<input type="date" className={field} value={deadlineIso(deadline)} onChange={(e)=>setDeadline(e.target.value)}/></label>
<label className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 font-bold">
<input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={accountChecked} onChange={(e)=>setAccountChecked(e.target.checked)}/>主催者本人のGoogleになっています</label>
<button disabled={!programTemplate||!accountChecked||!setupKey||!deadlineIso(deadline)||!title.trim()||title==='大会名未設定'||!/^\S+@\S+\.\S+$/.test(email)} onClick={()=>void copyProgram()} className="mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300">確認できた → プログラムをコピー</button>
</section>:null}

    {step===2?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">2 / 5</p>
<h2 className="mt-1 text-2xl font-black">Googleの白い画面へ貼る</h2>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① 下の紫ボタンを押す</li>
<li>② 白い画面が開いたら、元からある文字を全部消す</li>
<li>③ Macなら <kbd className="rounded bg-slate-200 px-2 py-1">⌘ V</kbd>、Windowsなら <kbd className="rounded bg-slate-200 px-2 py-1">Ctrl V</kbd> を押して貼る</li>
<li>④ 上の「保存」💾を押す</li>
</ol>
<a href="https://script.google.com/home/projects/create" target="_blank" className="mt-5 block rounded-2xl bg-indigo-700 p-5 text-center text-xl font-black text-white">Googleの白い画面を開く</a>
<button onClick={()=>setStep(3)} className="mt-3 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">貼って保存できた →</button>
<button onClick={()=>void copyProgram()} className="mt-3 w-full rounded-xl border p-3 font-bold">もう一度コピーする</button>
{generatedProgram?<details className="mt-4 rounded-xl border bg-slate-50 p-4"><summary className="cursor-pointer font-bold">コピーできないとき：プログラムを表示する</summary><p className="mt-3 font-bold">この文字を全部選んでコピーし、自分で作ったGoogleの白い画面にだけ貼ります。SNSや他の人へ送りません。</p><textarea aria-label="この大会専用の受付プログラム" readOnly value={generatedProgram} className={field+' h-48 font-mono text-sm'}/></details>:null}
</section>:null}

    {step===3?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">3 / 5</p>
<h2 className="mt-1 text-2xl font-black">申込表と写真フォルダを作る</h2>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① Google画面の上にある「関数なし ▼」を押す（すでに英語の名前が出ていたら、その名前の右の ▼ を押す）</li>
<li>② 出てきた一覧から <code>setupTournament</code> を押す（コピーする文字ではありません）</li>
<li>③ その右にある「実行」▶を押す</li>
<li>④ Googleから確認が出たら、主催者本人のアカウントを選んで許可する</li>
<li>⑤ 下に「実行完了」と出るまで待つ</li>
</ol>
<p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">違うGoogleアカウントでは動かない安全設定です。</p>
<p className="mt-3 rounded-xl bg-amber-50 p-4 font-bold">Googleの許可画面は、本人が内容を読んで決めます。「Googleが確認していないアプリ」と出た場合も、知らない人のプログラムでは先へ進みません。不安なときは画面をAIへ見せてください。</p>
<button onClick={()=>setStep(4)} className="mt-5 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">「実行完了」が出た →</button>
<button onClick={()=>setStep(2)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}

    {step===4?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">4 / 5</p>
<h2 className="mt-1 text-2xl font-black">受付用URLを作る</h2>
<p className="mt-3 rounded-xl bg-amber-50 p-4 font-black text-amber-950">ここで作るURLは、この会長・この大会だけの専用URLです。他の大会には使いません。</p>
<ol className="mt-4 space-y-4 text-lg font-bold">
<li>① 右上の「デプロイ」を押す</li>
<li>② 「新しいデプロイ」を押す</li>
<li>③ 種類は「ウェブアプリ」</li>
<li>④ 実行するユーザーは「自分」</li>
<li>⑤ アクセスできるユーザーは「全員」</li>
<li>⑥ 「デプロイ」を押し、最後にURLが出たことを確認する</li>
</ol>
<p className="mt-4 rounded-xl bg-blue-50 p-4 font-bold text-blue-900">「全員」は申込を送れるという意味です。Googleの申込表と写真フォルダが全員に公開されるわけではありません。</p>
<p className="mt-3 rounded-xl bg-amber-50 p-4 font-bold">プログラムを貼り替えた場合は「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」で更新します。保存だけでは受付画面に反映されません。</p>
<button onClick={()=>setStep(5)} className="mt-5 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white">URLが出た →</button>
<button onClick={()=>setStep(3)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}

    {step===5?<section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
<p className="font-black text-indigo-700">5 / 5</p>
<h2 className="mt-1 text-2xl font-black">接続を確認して、1件だけ試す</h2>
<ol className="mt-4 space-y-3 text-lg font-bold"><li>① Googleの「ウェブアプリ URL」の「コピー」を押す</li><li>② 下の「Googleの受付URL」へ貼る</li><li>③ 紫色の「Googleの接続を確かめる」を押す</li><li>④ Googleの白い欄をコピー → ブラウザ左上の「←」で戻る → 下の「Googleの接続確認コード」へ貼る</li></ol>
<p className="mt-3 rounded-xl bg-blue-50 p-4 font-bold text-blue-950">プログラムの文字を書き直す必要はありません。この確認では、選手の名簿や写真は送りません。</p>
<label className="mt-4 block font-black">Googleの受付URL<input type="url" className={field} value={endpoint} onChange={e=>{setEndpoint(e.target.value.trim());setRequest(null);setConnection(null);}} placeholder="https://script.google.com/macros/s/…/exec"/></label>
{endpoint&&!isAppsScriptUrl(endpoint)?<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">「デプロイID」ではなく「ウェブアプリ URL」を貼ります。最後が /exec のURLです。</p>:null}
<form action={isAppsScriptUrl(endpoint)?endpoint:undefined} method="post" target="_self" onSubmit={e=>{
  if(!draftRequest||draftRequest.endpoint!==endpoint||Date.now()-draftRequest.issuedAt>5*60_000){e.preventDefault();setRequestVersion(v=>v+1);setMessage('接続確認を準備し直しました。もう一度、紫のボタンを押してください。');return;}
  try{const saved=JSON.parse(localStorage.getItem('tournament-google-setup:'+eventId)||'{}');localStorage.setItem('tournament-google-setup:'+eventId,JSON.stringify({...saved,endpoint,request:draftRequest,code:''}));}
  catch{e.preventDefault();setMessage('このブラウザに設定を保存できません。データを消さず、通常のブラウザで開き直してください。');return;}
  // Do not regenerate hidden form fields while the browser is serializing this POST.
  // The persisted challenge must be the exact challenge received by Google.
  setCode('');setRequest(draftRequest);setConnection(null);setMessage('Googleの白い欄をコピーし、ブラウザ左上の「←」でこの画面へ戻ってください。途中の設定は保存しています。');
}}>
<input type="hidden" name="action" value="verifyConnection"/><input type="hidden" name="protocol" value="2"/><input type="hidden" name="payload" value={draftRequest?.payload||''}/><input type="hidden" name="signature" value={draftRequest?.signature||''}/>
<button type="submit" disabled={!draftRequest} className="mt-3 w-full rounded-2xl bg-indigo-700 p-5 text-xl font-black text-white disabled:bg-slate-300">Googleの接続を確かめる</button>
</form>
<label className="mt-4 block font-black">Googleの接続確認コード<textarea className={field+' h-32 text-sm'} value={code} onChange={(e)=>setCode(e.target.value.trim())} placeholder="TOS2.から始まるコード"/></label>
<p className="mt-2 text-sm font-bold text-slate-700">確認コードは15分以内に貼ります。15分で受付URLが使えなくなるわけではありません。時間が過ぎたら紫のボタンで確認し直すだけです。</p>
<button onClick={async()=>{try{const result=await verifyGoogleConnection(code,setupKey,eventId,email,policy,request);setConnection(result);setNow(Date.now());setMessage(result.deploymentVerified?'公開済みの受付・主催者・大会・非公開の保存先を確認できました。':'以前の確認コードは読めました。配布前に、上の紫ボタンで公開済みの受付も確認してください。');}catch(error){setConnection(null);setMessage(error instanceof Error?error.message:'確認できませんでした。');}}} className="mt-3 w-full rounded-xl bg-blue-700 p-4 font-black text-white">この大会の保存先を確認する</button>
<div className="mt-4 grid gap-3 sm:grid-cols-2">
<label className="font-bold">開催日<input type="date" className={field} value={deadlineIso(date)} onChange={(e)=>setDate(e.target.value)}/></label>
<label className="font-bold">会場<input className={field} value={venue} onChange={(e)=>setVenue(e.target.value)}/></label>
<label className="font-bold">主催者名<input className={field} value={organizer} onChange={(e)=>setOrganizer(e.target.value)}/>
</label>
<label className="font-bold sm:col-span-2">問い合わせ先<input className={field} value={contact} onChange={(e)=>setContact(e.target.value)}/>
</label>
<label className="font-bold sm:col-span-2">会場のGoogle地図URL（任意）<input className={field} value={venueUrl} onChange={(e)=>setVenueUrl(e.target.value.trim())} placeholder="https://share.google/..."/>
</label>
</div>{testReady?<a href={applyLink('test')} target="_blank" className="mt-5 block rounded-2xl bg-indigo-700 p-5 text-center text-xl font-black text-white">テスト申込画面を開く</a>:<p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">公開されたGoogle受付と確認コードが一致した場合だけ、テストボタンが出ます。</p>}
{testReady?<div className="mt-4 space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><p className="font-black">テスト画面で架空の申込1件を送り、受付番号が出たらここへ戻ります。</p><ol className="space-y-2 font-bold"><li>⑤ Google画面で <code>openEntries</code> を選んで「実行」▶を押す（本番の受付を開始します）</li><li>⑥ 上の紫色の「Googleの接続を確かめる」をもう一度押し、新しい確認コードを白い欄へ貼り替える</li></ol><p>Googleが原本・OS用の表・写真を照合してから受付を開始します。</p></div>:null}
{connection?.deploymentVerified&&!googleConnectionFresh(connection,now)?<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">確認から時間が過ぎました。上の紫色のボタンで、今の受付状態を確認し直してください。</p>:null}
<p className="mt-4 rounded-xl bg-blue-50 p-4 font-bold text-blue-950">{testReady&&connection?.testComplete&&connection.accepting?'✓ テスト申込・写真・受付開始を確認できました。':'公開受付・申込表・写真がそろうまで、選手用URLは作れません。'}</p>
<details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">テストの名簿と写真を、大会画面でも確かめる</summary><ol className="mt-3 space-y-3 font-bold"><li>① Google画面で <code>exportTestTournament</code> を選び「実行」▶を押す</li><li>② 実行ログの「OSへ取り込むファイル」を開き、ZIPをダウンロードする</li><li>③ 大会準備画面で本番とは別の「テスト専用の大会」を作り、このZIPを選ぶ</li></ol><p className="mt-3 text-sm">最後のテスト申込1件だけを使います。本番の名簿へ追加したり、本番受付を開始したりする必要はありません。</p></details>
<button disabled={!canShare} onClick={()=>void copyEntryLink()} className="mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300">完成：選手へ渡すURLをコピー</button>
{!canShare&&connection?.accepting?<p className="mt-3 font-bold text-rose-800">開催日・会場・主催者名・問い合わせ先を確認してください。締切は開催日以前で、まだ過ぎていない日付にします。接続確認の時間が過ぎた場合も、上の紫色のボタンで確認し直します。</p>:null}
<details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">申込が届いたら、大会画面へ入れる</summary><ol className="mt-3 space-y-3 font-bold"><li>① Google画面で <code>exportTournament</code> を選び「実行」▶を押す</li><li>② 実行ログの「OSへ取り込むファイル」のリンクを開く</li><li>③ Googleドライブで「ダウンロード」を押す</li><li>④ 大会準備画面の「返ってきた提出ファイルを選ぶ」で、そのZIPを選ぶ</li><li>⑤ 名前・写真・身長・体重を確認し、赤・青を選んで保存する</li></ol><p className="mt-3 text-sm">連絡先はZIPに入れません。名簿と写真は、このパソコンだけへ取り込みます。テスト申込は本番に混ぜません。</p><a href={'/private/?event='+encodeURIComponent(eventId)} className="mt-4 block rounded-xl bg-indigo-700 p-3 text-center font-bold text-white">大会準備画面へ戻る</a></details>
<button onClick={()=>setStep(4)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
</section>:null}
<details className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><summary className="cursor-pointer text-lg font-black">次の日・次の大会でも使えますか？</summary><div className="mt-3 space-y-3 leading-relaxed"><p>同じ大会・同じ会長の受付は、普通は毎回つなぎ直す必要はありません。申込締切を過ぎると、新しい申し込みは止まります。</p><p>別の大会では、大会準備画面で別の管理番号を使い、その大会の名前・締切・Google受付を用意します。前の大会の名簿や写真はそのまま残します。</p><p>Googleの制限や仕様変更、パソコンの故障があるため、永久に動くとは約束できません。募集を始める前に架空の1件で試し、大会準備画面で名簿と写真の予備ファイルを保存してください。</p><p>この設定は今使っているブラウザに残ります。ブラウザのデータを消したり別のパソコンへ移ったりすると、設定の復元・再確認が必要です。Googleにある申込表と写真まで自動で消えるわけではありません。</p></div></details>
  </div>
</main>;
}
