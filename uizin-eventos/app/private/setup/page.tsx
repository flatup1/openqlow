'use client';

import { useEffect, useState } from 'react';
import { diagnose, entryConfigFromPing, exportSetup, importSetup, isTemplateCopyLink, parsePing, parsePingText, pingUrl, templateCopyLink, type Diagnosis, type Ping } from '../../../core/setupV3.ts';
import { isAppsScriptUrl, publicEntryHash } from '../../../core/publicEntry.ts';
import { formatDateInput } from '../../../core/dateInput.ts';

const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 text-lg';
const big = 'mt-4 w-full rounded-2xl bg-emerald-700 p-5 text-xl font-black text-white disabled:bg-slate-300';
const STEPS = ['ひな形をコピーして設定', '公開してURLを貼る', '受付を始める'];
const KEY = 'tournament-setup-v3:';

export default function SetupV3() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState('my-tournament');
  const [endpoint, setEndpoint] = useState('');
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
    try {
      const saved = JSON.parse(localStorage.getItem(KEY + id) || 'null');
      if (saved) { setStep(saved.step || 1); setEndpoint(saved.endpoint || ''); }
    } catch { /* 覚えていなくても進められる */ }
    fetch('/template-link.json', { cache: 'no-store' }).then((r) => r.json() as Promise<{ copyUrl?: unknown }>).then((j) => { if (typeof j.copyUrl === 'string' && isTemplateCopyLink(j.copyUrl)) setTemplateUrl(j.copyUrl); }).catch(() => undefined);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY + eventId, JSON.stringify({ step, endpoint })); } catch { /* 保存できなくても使える */ }
  }, [ready, step, eventId, endpoint]);

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

  const diagnosis: Diagnosis | null = ping ? diagnose(ping) : null;
  const blocked = !diagnosis || ['old-build', 'not-setup', 'bad-settings'].includes(diagnosis.stage);
  const link = (mode: 'test' | 'live') => { try { return ping ? '/apply/' + publicEntryHash(entryConfigFromPing(ping, endpoint, mode)) : ''; } catch { return ''; } };
  const copy = async (text: string, done: string) => { try { await navigator.clipboard.writeText(text); setMessage(done); } catch { setMessage('コピーできませんでした。ブラウザの「クリップボードを許可」を押して、もう一度押してください。'); } };
  const fetchTemplate = async (path: string, done: string) => { try { const r = await fetch(path); if (!r.ok) throw new Error(); await copy(await r.text(), done); } catch { setMessage('コピーできませんでした。画面を再読み込みして、もう一度押してください。'); } };
  const download = () => {
    try {
      const text = exportSetup({ eventId, endpoint });
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'tournament-os-setup-' + eventId + '.json'; a.click(); URL.revokeObjectURL(url);
      setMessage('設定を書き出しました。大会の中身はGoogleのシートにあります。個人情報と鍵は入っていません。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '書き出せませんでした。'); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try { const s = importSetup(await file.text()); setEventId(s.eventId); setEndpoint(s.endpoint); setMessage('設定を読み込みました。「いまここ」から続けられます。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '読み込めませんでした。'); }
  };
  const ownerCopy = (() => { try { return ownerSheet.trim() ? templateCopyLink(ownerSheet) : ''; } catch { return 'ERR'; } })();
  const row = (label: string, value?: string) => <tr key={label}><th className="py-1 pr-3 text-left font-bold text-slate-600">{label}</th><td className="py-1 font-bold">{value || '—'}</td></tr>;

  if (!ready) return <main className="p-8">準備しています…</main>;
  const next = step === 1 ? 'ひな形のコピーを作る → 設定タブに書く → 「① 最初の設定」' : step === 2 ? 'ウェブアプリのURLを貼る' : (diagnosis?.message || 'URLを貼って、つながりを確かめる');
  return <main className="min-h-screen bg-indigo-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-2xl">
      <header className="rounded-3xl bg-white p-6 text-center shadow-sm">
        <p className="text-5xl">🥊☁️</p>
        <h1 className="mt-3 text-3xl font-black">受付をつくる（かんたん版）</h1>
        <p className="mt-3 rounded-xl bg-amber-100 p-3 text-lg font-black text-amber-950">いまここ {step} / 3：{STEPS[step - 1]}</p>
        <p className="mt-2 font-bold text-slate-700">次の1つ：{next}</p>
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">大会の情報も、選手の連絡先も、あなた本人のGoogleのシートにだけ入ります。この画面には入りません。</p>
      </header>
      {message ? <p role="status" className="sticky top-2 z-20 mt-4 rounded-xl bg-slate-900 p-4 font-bold text-white">{message}</p> : null}
      <nav className="my-4 grid grid-cols-3 gap-2 text-center text-xs font-black">{STEPS.map((name, i) => <button key={name} onClick={() => setStep(i + 1)} className={'rounded-lg p-2 ' + (step === i + 1 ? 'bg-amber-300' : i + 1 < step ? 'bg-emerald-200' : 'bg-white')}>{i + 1 < step ? '✓ ' : ''}{i + 1}</button>)}</nav>

      {step === 1 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">ひな形をコピーして、設定を書く</h2>
        <p className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">Googleにログインしているのが、<b>あなた1人のアカウントだけ</b>のウィンドウで行います。プライベートウィンドウは使いません。</p>
        {templateUrl
          ? <a href={templateUrl} target="_blank" rel="noreferrer" className="mt-5 block rounded-2xl bg-blue-700 p-5 text-center text-xl font-black text-white">ひな形のコピーを作る（Googleが開きます）</a>
          : <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 font-bold text-amber-950">ひな形のリンクが、まだ設定されていません。大会の管理者（オーナー）が、下の「オーナー向け」でひな形を用意してください。</p>}
        <ol className="mt-5 space-y-4 text-lg font-bold">
          <li>① 開いたら「コピーを作成」を押します。名前は、そのままで大丈夫です。</li>
          <li>② 開いたシートの、下の <b>「設定」タブ</b> を押します。<b>B列</b>に、大会名・開催日・会場・主催者名・問い合わせ先・申込締切を書きます（Excelのように、マスをクリックして書くだけです）。そして、<b>「入場曲」は、必ず「あり」か「なし」を選びます</b>（▼から選べます）。</li>
          <li>③ 上の <b>「Tournament OS」→「① 最初の設定」</b> を押します。許可の画面が出たら、あなたのアカウントを選んで許可します。</li>
          <li>④ 「準備できました」と出れば完了です。<b>架空の1件でのテストも、自動で済みます。</b></li>
        </ol>
        <p className="mt-3 rounded-xl bg-blue-50 p-3 font-bold text-blue-900">日にちは「2027-10-03」でも「2027年10月3日」でも読み取ります。入れ忘れや間違いは、「どこを直すか」を表示して止まります。</p>
        <button onClick={() => setStep(2)} className={big}>「準備できました」と出た →</button>
        <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-black">オーナー向け：ひな形を用意する（最初の1回だけ）</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-bold">
            <li>Googleスプレッドシートを新しく作ります。</li>
            <li>「拡張機能」→「Apps Script」を開き、下の紫のボタンでコピーしたものを、全部消して貼り、保存します。</li>
            <li>Apps Scriptの左の歯車「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」にチェックを入れ、下の水色のボタンでコピーしたものに入れ替えて、保存します（デプロイの「自分／全員」が最初から選ばれます）。</li>
            <li>スプレッドシートの「共有」を、「リンクを知っている全員が閲覧できる」にします（<b>個人情報は入れません</b>。入っているのはプログラムだけです）。</li>
            <li>スプレッドシートのURLを下に貼ると、「コピーを作る」リンクができます。<b>このシートでは「① 最初の設定」を押さないでください。</b></li>
          </ol>
          <button onClick={() => void fetchTemplate('/templates/Tournament_OS_Google受付_v3.gs', 'ひな形のプログラムをコピーしました。')} className="mt-3 w-full rounded-xl bg-violet-700 p-3 font-black text-white">ひな形のプログラムをコピー</button>
          <button onClick={() => void fetchTemplate('/templates/appsscript.json', 'マニフェストをコピーしました。')} className="mt-2 w-full rounded-xl bg-sky-700 p-3 font-black text-white">マニフェスト（appsscript.json）をコピー</button>
          <label className="mt-3 block font-bold">スプレッドシートのURL<input className={field} value={ownerSheet} onChange={(e) => setOwnerSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
          {ownerCopy && ownerCopy !== 'ERR' ? <><p className="mt-2 break-all rounded-lg bg-slate-100 p-2 text-sm">{ownerCopy}</p><button onClick={() => void copy(ownerCopy, '「コピーを作る」リンクをコピーしました。public/template-link.json の copyUrl に入れます。')} className="mt-2 w-full rounded-xl border p-3 font-bold">このリンクをコピー</button></> : null}
          {ownerCopy === 'ERR' ? <p role="alert" className="mt-2 font-bold text-rose-800">スプレッドシートのURL（docs.google.com/spreadsheets/d/…）を貼ってください。</p> : null}
        </details>
      </section> : null}

      {step === 2 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">公開して、URLを貼る</h2>
        <ol className="mt-4 space-y-3 text-lg font-bold">
          <li>① シートの <b>「拡張機能」→「Apps Script」</b> を開きます。</li>
          <li>② 右上の <b>「デプロイ」→「新しいデプロイ」</b> を押します。</li>
          <li>③ 種類が <b>「ウェブアプリ」</b>、実行するユーザーが <b>「自分」</b>、アクセスできるユーザーが <b>「全員」</b> になっているか見ます（最初から選ばれています。違っていたら選び直します）。</li>
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
          <p className="mt-2 text-sm text-slate-600">出る文字には、大会の設定と受付の状態だけが入っています。メールアドレスや鍵、申込の内容は入っていません。</p>
        </details>
        {pingError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{pingError}</p> : null}
        {diagnosis ? <p role="status" className={'mt-3 rounded-xl p-4 font-bold ' + (blocked ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900')}>{blocked ? '' : '✓ '}{diagnosis.message}</p> : null}
        {ping && !ping.settingsProblem && ping.title ? <div className="mt-3 rounded-xl bg-slate-50 p-4"><p className="font-black">シートの「設定」から読み取った内容</p><table className="mt-2 text-sm"><tbody>{row('大会名', ping.title)}{row('開催日', ping.date ? formatDateInput(ping.date) : '')}{row('会場', ping.venue)}{row('主催者名', ping.organizer)}{row('問い合わせ先', ping.contact)}{row('申込締切', ping.deadline ? formatDateInput(ping.deadline) : '')}</tbody></table><p className="mt-2 text-sm text-slate-600">違っていたら、シートの「設定」タブを直して、「もう一度確かめる」を押します。</p></div> : null}
        <button disabled={blocked} onClick={() => setStep(3)} className={big}>つながった → 次へ</button>
        <button onClick={() => setStep(1)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
      </section> : null}

      {step === 3 ? <section className="rounded-3xl border-4 border-amber-300 bg-white p-6 shadow">
        <h2 className="text-2xl font-black">受付を始めて、URLを配る</h2>
        <ol className="mt-4 space-y-3 text-lg font-bold">
          <li>① シートのメニュー <b>「Tournament OS」→「② 受付を開始」</b> を押します。</li>
          <li>② 下の「確かめる」を押します。</li>
          <li>③ 「選手へ渡すURLをコピー」が押せるようになったら、押して、LINEなどで送ります。</li>
        </ol>
        <button disabled={!isAppsScriptUrl(endpoint) || checking} onClick={() => void check()} className="mt-4 w-full rounded-xl border-2 border-indigo-300 p-3 font-black text-indigo-800 disabled:text-slate-400">{checking ? '確かめています…' : '確かめる'}</button>
        {pingError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{pingError}</p> : null}
        {diagnosis ? <p role="status" className={'mt-3 rounded-xl p-4 font-bold ' + (diagnosis.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950')}>{diagnosis.ok ? '✓ ' : ''}{diagnosis.message}</p> : null}
        <button disabled={!diagnosis?.ok || !link('live')} onClick={() => void copy(location.origin + link('live'), '選手へ渡すURLをコピーしました。LINEなどで送ります。')} className={big}>完成：選手へ渡すURLをコピー</button>
        <details className="mt-4 rounded-xl border p-4"><summary className="cursor-pointer font-black">任意：本物の申込画面でも、テストしてみる</summary>
          <p className="mt-3 font-bold">自動テストは済んでいます。選手が見る画面を自分の目で確かめたいときだけ、使ってください。架空の選手を1件送ります（本物の連絡先は使いません）。</p>
          <a aria-disabled={!link('test')} href={link('test') || undefined} target="_blank" rel="noreferrer" className={'mt-3 block rounded-xl p-3 text-center font-black text-white ' + (link('test') ? 'bg-blue-700' : 'pointer-events-none bg-slate-300')}>テスト申込を開く（新しいタブ）</a>
        </details>
        <p className="mt-3 text-sm text-slate-600">名簿のZIPは、受付が終わってから、シートの「④ OS用の名簿ZIPを作る」で作ります。</p>
        <button onClick={() => setStep(2)} className="mt-3 w-full p-3 font-bold text-slate-600">← 前へ戻る</button>
      </section> : null}

      <details className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><summary className="cursor-pointer font-black">別のパソコンで続ける・やり直す（設定ファイル）</summary>
        <p className="mt-3 text-sm text-slate-700">この画面が覚えている受付URLだけを書き出します。大会の中身はGoogleのシートにあります。<b>個人情報と鍵は入りません。</b></p>
        <button onClick={download} className="mt-3 w-full rounded-xl border-2 p-3 font-bold">設定を書き出す</button>
        <label className="mt-3 block rounded-xl border-2 border-dashed p-4 text-center font-bold">設定ファイルを読み込む<input type="file" accept="application/json,.json" className="mt-2 block w-full text-sm" onChange={(e) => void upload(e.target.files?.[0])} /></label>
      </details>
    </div>
  </main>;
}
