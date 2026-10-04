'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch, type EntryFieldMode } from '../../../core/entryPackage.ts';
import { formatDateInput, isCompleteDate } from '../../../core/dateInput.ts';
import { deadlineIso } from '../../../core/googleConnection.ts';
import { diagnose, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, settingsPaste, templateCopyLink, type Diagnosis, type Ping } from '../../../core/setupV3.ts';
import { isAppsScriptUrl, publicEntryHash } from '../../../core/publicEntry.ts';

const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 text-lg';
const big = 'mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300';
const STEPS = ['ひな形をコピー', '最初の設定', '公開してURLを貼る', 'テスト → 受付開始'];
const KEY = 'tournament-setup-v3:';

export default function SetupV3() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState('my-tournament');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [venueUrl, setVenueUrl] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [contact, setContact] = useState('');
  const [deadline, setDeadline] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [config, setConfig] = useState(DEFAULT_ENTRY_CONFIG);
  const [templateUrl, setTemplateUrl] = useState('');
  const [ownerSheet, setOwnerSheet] = useState('');
  const [message, setMessage] = useState('');
  const [ping, setPing] = useState<Ping | null>(null);
  const [pingError, setPingError] = useState('');
  const [checking, setChecking] = useState(false);
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('event')?.trim() || 'my-tournament';
    setEventId(id);
    setConfig(entryConfigFromSearch(location.search));
    if (params.get('title')) setTitle(params.get('title')!.trim());
    try {
      const saved = JSON.parse(localStorage.getItem(KEY + id) || 'null');
      if (saved) {
        setStep(saved.step || 1); setTitle(params.get('title')?.trim() || saved.title || ''); setDate(saved.date || ''); setVenue(saved.venue || ''); setVenueUrl(saved.venueUrl || '');
        setOrganizer(saved.organizer || ''); setContact(saved.contact || ''); setDeadline(saved.deadline || ''); setEndpoint(saved.endpoint || '');
        if (!params.has('music') && saved.config) setConfig(saved.config);
      }
    } catch { /* 覚えていなくても進められる */ }
    fetch('/template-link.json', { cache: 'no-store' }).then((r) => r.json() as Promise<{ copyUrl?: unknown }>).then((j) => { if (typeof j.copyUrl === 'string' && isTemplateCopyLink(j.copyUrl)) setTemplateUrl(j.copyUrl); }).catch(() => undefined);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY + eventId, JSON.stringify({ step, title, date, venue, venueUrl, organizer, contact, deadline, endpoint, config })); } catch { /* 保存できなくても使える */ }
  }, [ready, step, eventId, title, date, venue, venueUrl, organizer, contact, deadline, endpoint, config]);

  const check = async (quiet = false) => {
    setPingError('');
    let url: string;
    try { url = pingUrl(endpoint); } catch (error) { setPing(null); if (!quiet) setPingError(error instanceof Error ? error.message : ''); return; }
    setChecking(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      setPing(parsePing(await response.json()));
    } catch (error) {
      setPing(null);
      setPingError(error instanceof SyntaxError || (error instanceof Error && error.message.includes('Tournament OS')) ? 'Googleから別の答えが返りました。「デプロイ」の「アクセスできるユーザー」が「全員」か、確認してください。' : 'つながりません。URLの打ち間違いか、デプロイの「アクセスできるユーザー」が「全員」になっていない可能性があります。');
    }
    setChecking(false);
  };
  useEffect(() => {
    if (!ready || !isAppsScriptUrl(endpoint)) { setPing(null); return; }
    const timer = window.setTimeout(() => void check(true), 600);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, endpoint]);

  const diagnosis: Diagnosis | null = ping ? diagnose(ping, eventId) : null;
  const deadlineOk = deadlineIso(formatDateInput(deadline));
  const titleOk = title.trim().length > 0;
  const infoOk = Boolean(organizer.trim() && isCompleteDate(date) && venue.trim() && contact.trim() && deadlineOk);
  const applyLink = (mode: 'test' | 'live') => '/apply/' + publicEntryHash({ endpoint: endpoint.trim(), protocol: '3', mode, eventId, title, organizer, date: formatDateInput(date), venue, venueUrl, deadline: deadlineOk, contact, ...config });
  const copy = async (text: string, done: string) => { try { await navigator.clipboard.writeText(text); setMessage(done); } catch { setMessage('コピーできませんでした。ブラウザの「クリップボードを許可」を押して、もう一度押してください。'); } };
  const modeSelect = (label: string, key: 'grade' | 'age' | 'comment') => <label className="block font-bold">{label}<select className={field} value={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.value as EntryFieldMode })}><option value="optional">任意</option><option value="required">必須</option><option value="off">なし</option></select></label>;
  const download = () => {
    try {
      const text = exportSetup({ eventId, title, date, venue, venueUrl, organizer, contact, deadline, endpoint, config });
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'tournament-os-setup-' + eventId + '.json'; a.click(); URL.revokeObjectURL(url);
      setMessage('設定を書き出しました。個人情報と鍵は入っていません。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '書き出せませんでした。'); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const s = importSetup(await file.text());
      setEventId(s.eventId); setTitle(s.title); setDate(s.date); setVenue(s.venue); setVenueUrl(s.venueUrl); setOrganizer(s.organizer); setContact(s.contact); setDeadline(s.deadline); setEndpoint(s.endpoint); setConfig(s.config);
      setMessage('設定を読み込みました。「いまここ」から続けられます。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '読み込めませんでした。'); }
  };
  const ownerCopy = (() => { try { return ownerSheet.trim() ? templateCopyLink(ownerSheet) : ''; } catch { return 'ERR'; } })();

  if (!ready) return <main className="p-8">準備しています…</main>;
  const next = step === 1 ? 'ひな形のコピーを作る' : step === 2 ? 'シートのメニューから「① 最初の設定」' : step === 3 ? 'ウェブアプリのURLを貼る' : (diagnosis?.message || 'URLを貼って、つながりを確かめる');
  return <main className="min-h-screen bg-indigo-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-2xl">
      <header className="rounded-3xl bg-white p-6 text-center shadow-sm">
        <p className="text-5xl">🥊☁️</p>
        <h1 className="mt-3 text-3xl font-black">受付をつくる（かんたん版）</h1>
        <p className="mt-3 rounded-xl bg-amber-100 p-3 text-lg font-black text-amber-950">いまここ {step} / 4：{STEPS[step - 1]}</p>
        <p className="mt-2 font-bold text-slate-700">次の1つ：{next}</p>
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">選手の連絡先は、あなた本人のGoogleだけに入ります。この画面には入りません。</p>
      </header>
      {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-slate-900 p-4 font-bold text-white">{message}</p> : null}
      <nav className="my-4 grid grid-cols-4 gap-2 text-center text-xs font-black">{STEPS.map((name, i) => <button key={name} onClick={() => setStep(i + 1)} className={'rounded-lg p-2 ' + (step === i + 1 ? 'bg-amber-300' : i + 1 < step ? 'bg-emerald-200' : 'bg-white')}>{i + 1 < step ? '✓ ' : ''}{i + 1}</button>)}</nav>

      {step === 1 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">ひな形をコピーする</h2>
        <p className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">Googleにログインしているのが、<b>あなた1人のアカウントだけ</b>の画面で行います。ほかの人のアカウントが入っていると失敗します。</p>
        <label className="mt-4 block font-black">大会名<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：第1回 ○○ジム大会" /></label>
        <label className="mt-4 block font-black">申込の締切日<input className={field} inputMode="numeric" placeholder="例: 20271003" value={deadline} onChange={(e) => setDeadline(e.target.value)} onBlur={(e) => { const v = formatDateInput(e.target.value); if (v !== e.target.value) setDeadline(v); }} /></label>
        <p className="mt-1 text-sm text-slate-600">数字だけでOK。20271003 → 2027年10月3日</p>
        {templateUrl
          ? <a href={templateUrl} target="_blank" rel="noreferrer" className="mt-5 block rounded-2xl bg-blue-700 p-5 text-center text-xl font-black text-white">ひな形のコピーを作る（Googleが開きます）</a>
          : <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">ひな形のリンクが、まだ設定されていません。大会の管理者（オーナー）が、下の「オーナー向け」でひな形を用意してください。</p>}
        <p className="mt-3 text-slate-700">開いたら「コピーを作成」を押します。名前は、そのままで大丈夫です。</p>
        <button disabled={!titleOk || !deadlineOk} onClick={() => setStep(2)} className={big}>コピーを作った →</button>
        <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-black">オーナー向け：ひな形を用意する（最初の1回だけ）</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-bold">
            <li>Googleスプレッドシートを新しく作ります。</li>
            <li>「拡張機能」→「Apps Script」を開き、下のボタンでコピーしたものを全部消して貼り、保存します。</li>
            <li>スプレッドシートの「共有」を、「リンクを知っている全員が閲覧できる」にします（<b>個人情報は入れません</b>。入っているのはプログラムだけです）。</li>
            <li>スプレッドシートのURLを下に貼ると、「コピーを作る」リンクができます。</li>
          </ol>
          <button onClick={async () => { try { const r = await fetch('/templates/Tournament_OS_Google受付_v3.gs'); if (!r.ok) throw new Error(); await copy(await r.text(), 'ひな形のプログラムをコピーしました。'); } catch { setMessage('コピーできませんでした。画面を再読み込みして、もう一度押してください。'); } }} className="mt-3 w-full rounded-xl bg-violet-700 p-3 font-black text-white">ひな形のプログラムをコピー</button>
          <label className="mt-3 block font-bold">スプレッドシートのURL<input className={field} value={ownerSheet} onChange={(e) => setOwnerSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
          {ownerCopy && ownerCopy !== 'ERR' ? <><p className="mt-2 break-all rounded-lg bg-slate-100 p-2 text-sm">{ownerCopy}</p><button onClick={() => void copy(ownerCopy, '「コピーを作る」リンクをコピーしました。public/template-link.json の copyUrl に入れます。')} className="mt-2 w-full rounded-xl border p-3 font-bold">このリンクをコピー</button></> : null}
          {ownerCopy === 'ERR' ? <p role="alert" className="mt-2 font-bold text-rose-800">スプレッドシートのURL（docs.google.com/spreadsheets/d/…）を貼ってください。</p> : null}
        </details>
      </section> : null}

      {step === 2 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">最初の設定（シートの中で行います）</h2>
        <ol className="mt-4 space-y-4 text-lg font-bold">
          <li>① コピーしたスプレッドシートを開きます。上に <b>「Tournament OS」</b> というメニューが出ます（出ないときは、画面を再読み込み）。</li>
          <li>② <b>「Tournament OS」→「① 最初の設定」</b> を押します。許可の画面が出たら、あなたのアカウントを選んで許可します。</li>
          <li>③ 1回目は「設定タブを入れてください」と出ます。<b>それが正しい動きです。</b> 下のボタンで文字をコピーし、<b>「設定」タブの B2 のマス</b>をクリックして貼ります（⌘ V / Ctrl V）。</li>
          <li>④ もう一度 <b>「① 最初の設定」</b> を押します。「準備できました」と出れば完了です。</li>
        </ol>
        <button disabled={!titleOk || !deadlineOk} onClick={() => void copy(settingsPaste({ eventId, title, deadlineIso: deadlineOk, config }), '設定の文字をコピーしました。「設定」タブの B2 に貼ります。')} className="mt-4 w-full rounded-2xl bg-violet-700 p-5 text-xl font-black text-white disabled:bg-slate-300">設定の文字をコピー</button>
        <details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">申込の項目を変える（入場曲・学年・年齢・意気込み）</summary>
          <label className="mt-3 flex items-center gap-3 font-bold"><input type="checkbox" className="h-6 w-6" checked={config.music} onChange={(e) => setConfig({ ...config, music: e.target.checked })} />入場曲を聞く</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{modeSelect('学年', 'grade')}{modeSelect('年齢', 'age')}{modeSelect('意気込み', 'comment')}</div>
        </details>
        <p className="mt-4 rounded-xl bg-blue-50 p-3 font-bold text-blue-900">書いてあるのは、大会ID「{eventId}」・大会名・締切・項目だけです。メールアドレスや鍵は入りません。</p>
        <button onClick={() => setStep(3)} className={big}>「準備できました」と出た →</button>
        <button onClick={() => setStep(1)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
      </section> : null}

      {step === 3 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">公開して、URLを貼る</h2>
        <ol className="mt-4 space-y-3 text-lg font-bold">
          <li>① スプレッドシートの <b>「拡張機能」→「Apps Script」</b> を開きます。</li>
          <li>② 右上の <b>「デプロイ」→「新しいデプロイ」</b> を押します。</li>
          <li>③ 種類は <b>「ウェブアプリ」</b>、実行するユーザーは <b>「自分」</b>、アクセスできるユーザーは <b>「全員」</b>。</li>
          <li>④ <b>「デプロイ」</b> を押します（許可の画面が出たら許可）。</li>
          <li>⑤ 出てきた <b>「ウェブアプリ」のURL</b>（…/exec で終わる）の「コピー」を押し、下に貼ります。</li>
        </ol>
        <p className="mt-3 rounded-xl bg-blue-50 p-3 font-bold text-blue-900">「全員」は、申込を送れるという意味です。申込表と写真フォルダが公開されるわけではありません。</p>
        <label className="mt-4 block font-black">ウェブアプリのURL<input className={field} value={endpoint} onChange={(e) => setEndpoint(e.target.value.trim())} placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" /></label>
        <button disabled={!isAppsScriptUrl(endpoint) || checking} onClick={() => void check()} className="mt-3 w-full rounded-xl border-2 border-indigo-300 p-3 font-black text-indigo-800 disabled:text-slate-400">{checking ? '確かめています…' : 'もう一度確かめる'}</button>
        <details className="mt-3 rounded-xl border p-4"><summary className="cursor-pointer font-black">自動で確かめられないとき（貼って確かめる）</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-bold">
            <li>下のボタンで、確かめるページを開きます。文字が出ます。</li>
            <li>その文字を、すべてコピーします。</li>
            <li>この画面に戻って、下の欄に貼ります。</li>
          </ol>
          <a aria-disabled={!isAppsScriptUrl(endpoint)} href={isAppsScriptUrl(endpoint) ? endpoint + '?action=ping' : undefined} target="_blank" rel="noreferrer" className={'mt-3 block rounded-xl p-3 text-center font-black text-white ' + (isAppsScriptUrl(endpoint) ? 'bg-indigo-700' : 'pointer-events-none bg-slate-300')}>確かめるページを開く</a>
          <label className="mt-3 block font-bold">出た文字を貼る<textarea className={field + ' h-28 text-sm'} value={pasted} onChange={(e) => { const text = e.target.value; setPasted(text); if (!text.trim()) return; try { setPing(parsePingText(text)); setPingError(''); } catch (error) { setPing(null); setPingError(error instanceof Error ? error.message : ''); } }} placeholder='{"app":"tournament-os", …}' /></label>
          <p className="mt-2 text-sm text-slate-600">出る文字には、大会ID・版・受付の状態だけが入っています。メールアドレスや鍵、申込の内容は入っていません。</p>
        </details>
        {pingError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{pingError}</p> : null}
        {diagnosis ? <p role="status" className={'mt-3 rounded-xl p-4 font-bold ' + (diagnosis.stage === 'old-build' || diagnosis.stage === 'not-setup' || diagnosis.stage === 'wrong-event' ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900')}>{diagnosis.stage === 'need-test' || diagnosis.stage === 'need-open' || diagnosis.stage === 'ready' ? '✓ ' : ''}{diagnosis.message}</p> : null}
        <button disabled={!diagnosis || ['old-build', 'not-setup', 'wrong-event'].includes(diagnosis.stage)} onClick={() => setStep(4)} className={big}>つながった → 次へ</button>
        <button onClick={() => setStep(2)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
      </section> : null}

      {step === 4 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">テストを1件送って、受付を始める</h2>
        <p className="mt-3 font-bold">申込ページに出す大会の情報です。</p>
        <label className="mt-3 block font-bold">開催日<input className={field} inputMode="numeric" placeholder="例: 20271003" value={date} onChange={(e) => setDate(e.target.value)} onBlur={(e) => { const v = formatDateInput(e.target.value); if (v !== e.target.value) setDate(v); }} /></label>
        <label className="mt-3 block font-bold">会場<input className={field} value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
        <label className="mt-3 block font-bold">会場のGoogle地図URL（任意）<input className={field} value={venueUrl} onChange={(e) => setVenueUrl(e.target.value)} /></label>
        <label className="mt-3 block font-bold">主催者名<input className={field} value={organizer} onChange={(e) => setOrganizer(e.target.value)} /></label>
        <label className="mt-3 block font-bold">問い合わせ先（電話やLINEなど。選手に見えます）<input className={field} value={contact} onChange={(e) => setContact(e.target.value)} /></label>
        {!infoOk ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 font-bold text-amber-950">開催日・会場・主催者名・問い合わせ先を入れてください。締切は、日にちまで入っている必要があります。</p> : null}
        <ol className="mt-5 space-y-3 text-lg font-bold">
          <li>① 下の青いボタンで申込ページを開き、<b>架空の選手</b>を1件送ります（本物の連絡先は使いません）。</li>
          <li>② 「確かめる」を押します。</li>
          <li>③ シートの <b>「Tournament OS」→「② 受付を開始」</b> を押します。</li>
          <li>④ もう一度「確かめる」を押すと、選手に渡すURLがコピーできます。</li>
        </ol>
        <a aria-disabled={!infoOk} href={infoOk ? applyLink('test') : undefined} target="_blank" rel="noreferrer" className={'mt-4 block rounded-2xl p-5 text-center text-xl font-black text-white ' + (infoOk ? 'bg-blue-700' : 'pointer-events-none bg-slate-300')}>テスト申込を送る（新しいタブ）</a>
        <button disabled={!isAppsScriptUrl(endpoint) || checking} onClick={() => void check()} className="mt-3 w-full rounded-xl border-2 border-indigo-300 p-3 font-black text-indigo-800 disabled:text-slate-400">{checking ? '確かめています…' : '確かめる'}</button>
        {pingError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{pingError}</p> : null}
        {diagnosis ? <p role="status" className={'mt-3 rounded-xl p-4 font-bold ' + (diagnosis.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950')}>{diagnosis.message}</p> : null}
        <button disabled={!diagnosis?.ok || !infoOk} onClick={() => void copy(location.origin + applyLink('live'), '選手へ渡すURLをコピーしました。LINEなどで送ります。')} className={big}>完成：選手へ渡すURLをコピー</button>
        <p className="mt-3 text-sm text-slate-600">名簿のZIPは、受付が終わってから、シートの「④ OS用の名簿ZIPを作る」で作ります。</p>
        <button onClick={() => setStep(3)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
      </section> : null}

      <details className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><summary className="cursor-pointer font-black">別のパソコンで続ける・やり直す（設定ファイル）</summary>
        <p className="mt-3 text-sm text-slate-700">大会名・締切・会場・受付URL・項目だけを書き出します。<b>個人情報と鍵は入りません。</b></p>
        <button onClick={download} className="mt-3 w-full rounded-xl border-2 p-3 font-bold">設定を書き出す</button>
        <label className="mt-3 block rounded-xl border-2 border-dashed p-4 text-center font-bold">設定ファイルを読み込む<input type="file" accept="application/json,.json" className="mt-2 block w-full text-sm" onChange={(e) => void upload(e.target.files?.[0])} /></label>
      </details>
    </div>
  </main>;
}
