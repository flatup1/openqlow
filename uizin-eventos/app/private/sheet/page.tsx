'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLUMN_GAP_MM, HEADER_MM, ROW_GAP_MM, buildSheet, clampPerPage, fitCenter, fitSide, fitTitleMm, pageCount, pagesIfTarget, parseSheetPrefs, perPageLimit, resolvePerPage, sheetMetrics, type SheetBout, type SheetMetrics, type SheetNotes, type SheetOrientation, type SheetPrefs, type SheetShow, type SheetSide } from '../../../core/boutSheet.ts';
import type { LocalTournament } from '../../../core/privateTournament.ts';
import { CkaLogo } from '../../components/CkaLogo.tsx';
import { readPrivateEvent, watchPrivateEvent } from '../../lib/privateStore.ts';
import { isTitleReal } from '../logic.ts';
import { makeThumb } from '../../lib/thumb.ts';
import { Caution, ErrorLine, Hint, LockReason, NextSlot, OkLine, cx } from '../live/liveMarks.tsx';

/*
  A3 対戦一覧表（掲示用）。主催者が決めた対戦カードを、見やすい一覧表にして印刷（PDF）する。組み合わせは、ここでは決めない・変えない。
  読むだけの画面：保存してある大会から作る（保存データには書き込まない。覚えるのは、このブラウザの設定だけ）。順番・相手・欠場は、準備の画面で直して「保存する」→ この画面を開いたままなら自動で、閉じたなら「A3の対戦一覧表をつくる」をもう一度押すと、入れかわる。
  載せるのは core/boutSheet.ts が通した項目だけ（氏名・ジム名・小さな顔写真・クラス/区分/階級・試合番号・ルール）。電話・生年月日・健康・同意の記録は、載らない。
  印刷は、ブラウザの印刷の画面（プリンターを選ぶ欄を「PDFに保存」にするとPDF。Chromeでは「送信先」）。用紙の大きさ（A3・縦／横）は、このページから指定する。
*/

/** 1mm が何px か（画面の96dpi）。プレビューの縮尺に使う */
const MM_PX = 96 / 25.4;
const storeKey = (eventId: string) => 'tos-sheet:' + eventId;
const readStored = (eventId: string): string | null => { try { return localStorage.getItem(storeKey(eventId)); } catch { return null; } };
const writeStored = (eventId: string, value: string): void => { try { localStorage.setItem(storeKey(eventId), value); } catch { /* 覚えておけなくても、使える */ } };

const button = 'live-list-focus touch-manipulation inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 px-4 text-[17px] font-bold ';
const idle = button + 'border-slate-500 bg-white text-slate-900';
const pressed = button + 'border-4 border-slate-900 bg-slate-200 text-slate-950';
const locked = button + 'tos-locked border-slate-400 bg-white text-slate-600';

/** 横の紙で、1ページに載せられる試合数の上限（「横にすると…」の案内に使う） */
const PAGE_LAND_MAX = perPageLimit('landscape').max;

/** 試合番号の並びを、読める言葉にする（例：「第2・5試合」） */
export const numbersText = (numbers: number[]): string => '第' + numbers.join('・') + '試合';
const orientationWord = (orientation: SheetOrientation): string => orientation === 'portrait' ? '縦' : '横';
const clockText = (at: number): string => new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Side({ side, who, m, show, thumbs }: { side: SheetSide; who: 'red' | 'blue'; m: SheetMetrics; show: SheetShow; thumbs: Map<string, string> }) {
  const shown = side.photo ? (thumbs.get(side.photo) ?? side.photo) : '';
  // 氏名・ジム名・札は、枠の高さに入る大きさと行数にする（入らないときは小さく／1行に切る。あふれない）
  const fit = fitSide(side, m, show.photo);
  const clamp = (lines: number) => ({ WebkitLineClamp: lines });
  return <div className={cx('sheet-side', 'sheet-' + who, side.state !== 'ok' && 'sheet-state-' + side.state)} style={{ width: m.sideW + 'mm' }}>
    {show.photo ? <div className="sheet-photo" aria-hidden="true" style={{ width: m.photoW + 'mm', height: m.photoH + 'mm' }}>{shown ? <img src={shown} alt="" /> : null}</div> : null}
    <div className="sheet-text">
      <p className="sheet-corner" style={{ fontSize: fit.corner + 'mm' }}><span>{who === 'red' ? '▲ 赤' : '■ 青'}</span>{side.state === 'absent' ? <span className="sheet-absent">欠場</span> : null}</p>
      <p className={cx('sheet-name', side.state === 'empty' && 'sheet-undecided')} style={{ fontSize: fit.name + 'mm', ...clamp(fit.nameLines) }}>{side.state === 'empty' ? '未定' : side.name}</p>
      {side.gym ? <p className="sheet-gym" style={{ fontSize: fit.gym + 'mm', ...clamp(fit.gymLines) }}>{side.gym}</p> : null}
      {side.tag && side.state !== 'absent' ? <p className="sheet-tag" style={{ fontSize: fit.tag + 'mm', ...clamp(fit.tagLines) }}>{side.tag}</p> : null}
    </div>
  </div>;
}

function Bout({ bout, m, show, thumbs }: { bout: SheetBout; m: SheetMetrics; show: SheetShow; thumbs: Map<string, string> }) {
  // まん中の列も、枠の高さに入る大きさと行数にする（長い文字は、番号を小さく → 文字を小さく → 行を切る）
  const c = fitCenter(bout, m);
  return <article className="sheet-bout" data-sheet-bout={bout.number} aria-label={bout.label}>
    <Side side={bout.red} who="red" m={m} show={show} thumbs={thumbs} />
    <div className="sheet-center" style={{ width: m.centerW + 'mm' }}>
      {c.compact
        ? <p className="sheet-no-row"><span className="sheet-no-word" style={{ fontSize: c.word + 'mm' }}>第</span><span className="sheet-no" style={{ fontSize: c.no + 'mm' }}>{bout.number}</span><span className="sheet-no-word" style={{ fontSize: c.word + 'mm' }}>試合</span></p>
        : <>
            <p className="sheet-no-word" style={{ fontSize: c.word + 'mm' }}>第</p>
            <p className="sheet-no" style={{ fontSize: c.no + 'mm' }}>{bout.number}</p>
            <p className="sheet-no-word" style={{ fontSize: c.word + 'mm' }}>試合</p>
          </>}
      {bout.classLine && c.classLines > 0 ? <p className="sheet-classline" style={{ fontSize: c.classLine + 'mm', WebkitLineClamp: c.classLines }}>{bout.classLine}</p> : null}
      {bout.rule && c.ruleLines > 0 ? <p className="sheet-rule" style={{ fontSize: c.rule + 'mm', WebkitLineClamp: c.ruleLines }}>{bout.rule}</p> : null}
    </div>
    <Side side={bout.blue} who="blue" m={m} show={show} thumbs={thumbs} />
  </article>;
}

/** 印刷の前に確かめてもらうこと。止めない（印刷はできる）。上から、直したほうがよい順 */
function Checks({ notes, total, ready, pending, showPhoto, titleReal, cutBouts, leftOut, fighterCount }: { notes: SheetNotes; total: number; ready: boolean; pending: number; showPhoto: boolean; titleReal: boolean; cutBouts: number[]; leftOut: number; fighterCount: number }) {
  const problems: string[] = [];
  if (!titleReal) problems.push('大会の名前がまだ入っていません。一覧表の各ページの上に「大会名未設定」と出ます。');
  if (notes.empty.length) problems.push(numbersText(notes.empty) + 'は、選手がまだ決まっていません。一覧表には「未定」と出ます。');
  if (notes.same.length) problems.push(numbersText(notes.same) + 'は、赤と青が同じ選手です。');
  if (notes.noName.length) problems.push(numbersText(notes.noName) + 'に、名前が入っていない選手がいます。「名前未入力」と出ます。');
  if (notes.absent.length) problems.push(numbersText(notes.absent) + 'に、欠場の選手がいます。一覧表には「欠場」と出ます。');
  if (notes.twice.length) problems.push('2つ以上の試合に入っている選手がいます：' + notes.twice.slice(0, 5).join('、') + (notes.twice.length > 5 ? ' ほか' + (notes.twice.length - 5) + '人' : '') + '。');
  return <div className="sheet-noprint mt-4 space-y-2" data-sheet-checks="1">
    {total > 0 && problems.length === 0 && cutBouts.length === 0 && leftOut === 0 ? (ready
      ? <OkLine>どの試合も、赤と青が決まっています。そのまま印刷できます。</OkLine>
      : <Hint>どの試合も、赤と青が決まっています。写真をととのえ終わると、印刷できます（あと{pending}人）。</Hint>) : null}
    {problems.map((text) => <Caution key={text} title="印刷の前に確かめてください">{text}</Caution>)}
    {cutBouts.length > 0 ? <Caution title="印刷の前に確かめてください" id="sheet-cut-note">{numbersText(cutBouts.slice(0, 5))}{cutBouts.length > 5 ? ' ほか' + (cutBouts.length - 5) + '試合' : ''}は、名前・ジム名・クラスの文字が長くて、紙の上で一部が「…」と切れます。1ページの試合数をへらすと、文字が大きくなって入ることがあります。それでも切れるときは、準備の画面で、書き方（名前・ジム名）を確かめます。</Caution> : null}
    {problems.length || cutBouts.length ? <Hint>直すときは、上の「この画面を閉じる」で準備の画面にもどり、直して「保存する」を押します。そのあと、準備の画面の「A3の対戦一覧表をつくる」を、もう一度押します。</Hint> : null}
    {showPhoto && notes.noPhoto > 0 ? <Hint>写真がない選手が{notes.noPhoto}人います。その人は、名前の横が灰色の四角になります。{notes.noPhoto >= fighterCount ? '全員いないときは、「小さな顔写真」のチェックを外すと、文字だけになります。' : ''}</Hint> : null}
  </div>;
}

export default function BoutSheet() {
  const [data, setData] = useState<LocalTournament | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [readAt, setReadAt] = useState(0);
  /** 「最新の内容を読み込む」を押した結果（押したときだけ出す） */
  const [reloadNote, setReloadNote] = useState<{ ok: boolean; at: number } | null>(null);
  const [prefs, setPrefs] = useState<SheetPrefs>(() => parseSheetPrefs(null));
  /** 試合数の欄に打っている途中の文字（打ち終わるまで、数にもどさない） */
  const [draft, setDraft] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [thumbs, setThumbs] = useState<Map<string, string>>(() => new Map());
  const [boxW, setBoxW] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inflight = useRef<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const { orientation, show } = prefs;

  const eventId = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('event') || 'my-tournament';
  const back = '/private/?event=' + encodeURIComponent(eventId);

  useEffect(() => setMounted(true), []);
  // 明るい配色（準備の画面と同じ決まり）。画面を離れたら元に戻る
  useEffect(() => {
    const root = document.documentElement;
    const booted = root.hasAttribute('data-theme-boot');
    const before = booted ? null : root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => { root.removeAttribute('data-theme-boot'); if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
  }, []);

  // 保存してある大会を読む。別の画面で保存されたとき・この画面にもどってきたときに、読み直す。読めたかどうかを返す
  const load = useCallback((): Promise<boolean> => readPrivateEvent(eventId)
    .then((value) => { setData(value); setReadFailed(false); setLoaded(true); setReadAt(Date.now()); return true; })
    .catch(() => { setReadFailed(true); setLoaded(true); return false; }), [eventId]);
  useEffect(() => {
    void load();
    const stop = watchPrivateEvent(eventId, () => { void load(); });
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => { stop(); window.removeEventListener('focus', onFocus); };
  }, [eventId, load]);
  const reload = () => { void load().then((ok) => setReloadNote({ ok, at: Date.now() })); };

  // 前に決めた設定（向き・載せる項目・1ページの試合数／枚数）を、このブラウザから戻す。最初の1回だけ
  useEffect(() => {
    if (restored || !loaded) return;
    setPrefs(parseSheetPrefs(readStored(eventId)));
    setRestored(true);
  }, [loaded, restored, eventId]);
  // 大会があるときだけ覚える（大会がない画面で、ごみを残さない）
  const hasData = !!data;
  useEffect(() => {
    if (!restored || !hasData) return;
    writeStored(eventId, JSON.stringify({ orientation: prefs.orientation, show: prefs.show, ...(prefs.pages !== null ? { pages: prefs.pages } : prefs.count !== null ? { perPage: prefs.count } : {}) }));
  }, [restored, hasData, eventId, prefs]);

  // 紙の向きは、印刷の画面に伝える（@page は、ここでしか決められない）
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'sheet-page-size';
    style.textContent = '@page{size:A3 ' + orientation + ';margin:0}';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [orientation]);

  const total = data?.bouts.length ?? 0;
  const perPage = resolvePerPage(prefs, total);
  const limit = perPageLimit(orientation);
  const model = useMemo(() => data ? buildSheet(data, { perPage, orientation, show }) : null, [data, perPage, orientation, show]);
  const m = useMemo(() => sheetMetrics(perPage, orientation, show.photo), [perPage, orientation, show.photo]);
  // 印刷の前に知らせること：まん中の列に入らず省いた文字（ルール・体重の区分など）／紙の上で切れる、名前・ジム名・クラスの文字
  const warn = useMemo(() => {
    const cut: number[] = [], rule: number[] = [], classLine: number[] = [];
    if (!model) return { cut, rule, classLine };
    for (const page of model.pages) for (const b of page.bouts) {
      const c = fitCenter(b, m);
      if (c.droppedRule) rule.push(b.number);
      if (c.droppedClass) classLine.push(b.number);
      for (const side of [b.red, b.blue]) { const f = fitSide(side, m, show.photo); if (f.cut.name || f.cut.gym || f.cut.tag) { cut.push(b.number); break; } }
    }
    return { cut, rule, classLine };
  }, [model, m, show.photo]);

  // 写真を、一覧表に載せる小さい大きさにする。できるまで、印刷のボタンは待つ（作れなかった写真は、元の写真のまま。止まらない）
  const wanted = useMemo(() => {
    if (!data || !show.photo) return [] as string[];
    const used = new Set<string>();
    for (const bout of data.bouts) for (const id of [bout.redId, bout.blueId]) { const f = data.fighters.find((x) => x.id === id); if (f && f.photoDataUrl && f.absent !== true) used.add(f.photoDataUrl); }
    return [...used];
  }, [data, show.photo]);
  const pending = wanted.filter((url) => !thumbs.has(url)).length;
  useEffect(() => {
    for (const url of wanted) {
      if (thumbs.has(url) || inflight.current.has(url)) continue;
      inflight.current.add(url);
      void makeThumb(url).then((small) => { inflight.current.delete(url); setThumbs((old) => { if (old.has(url)) return old; const next = new Map(old); next.set(url, small); return next; }); });
    }
  }, [wanted, thumbs]);

  // プレビューの縮尺。紙の幅を、画面の幅に合わせる（大きくはしない）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxW(Math.floor(el.getBoundingClientRect().width));
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => { window.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [loaded, !!data]);

  const pageW = m.pageW * MM_PX, pageH = m.pageH * MM_PX;
  const scale = boxW > 0 ? Math.min(1, boxW / pageW) : 0.3;
  const pages = model ? pageCount(model.totalBouts, perPage) : 0;
  const pageTitle = '対戦一覧表 ' + (data?.title.trim() ?? '');

  const print = () => {
    const before = document.title;
    const restore = () => { document.title = before; window.removeEventListener('afterprint', restore); };
    document.title = pageTitle.trim();
    window.addEventListener('afterprint', restore);
    try { window.print(); } catch { restore(); }
  };
  // この画面は、準備の画面から別のタブで開いている。閉じられるときは閉じて（準備の画面が出る）、閉じられないときは、準備の画面へ移る
  const leave = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try { window.close(); } catch { /* 閉じられなければ、下で移る */ }
    window.setTimeout(() => { location.href = back; }, 250);
  };

  const shell = 'tos-read min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-6';
  const backLink = <a href={back} onClick={leave} className={cx(idle, 'no-underline')}>準備の画面へもどる</a>;
  if (!loaded) return <main data-tos-loading="1" className={shell}><div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    <h1 className="text-xl font-bold">このパソコンのデータを読んでいます…</h1>
    {mounted ? <Caution title="そのまま待つ" className="mt-3">⏳ 画面が出るまで、3秒ほどかかります。</Caution> : null}
  </div></main>;
  if (!data || !model) return <main className={shell}><div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    <h1 className="mb-3 text-xl font-black">対戦一覧表（A3）</h1>
    {readFailed
      ? <>
          <ErrorLine role="alert">保存データを読めません（データは消えていません）</ErrorLine>
          <p className="mt-3 font-bold">① プライベートウィンドウでは使えません。ふつうのウィンドウで開き直してください</p>
          <p className="mt-1 font-bold">② それでもだめなときは、下の「準備の画面へもどる」を押します。準備の画面で「コピーのファイルから戻す」を使います</p>
        </>
      : <>
          <ErrorLine role="alert">この大会は、このブラウザにありません</ErrorLine>
          <p className="mt-3">この大会は、別のパソコンかブラウザで作りましたか？ 作ったパソコンの、同じブラウザで開いてください。</p>
        </>}
    <NextSlot active label={readFailed ? '①をしてもだめなとき：準備の画面へ' : '準備の画面へもどる'} className="mt-4">{backLink}</NextSlot>
    {readFailed ? <div className="mt-4"><button type="button" onClick={() => location.reload()} className={idle}>もう一度ひらく</button><Hint className="mt-1">ふつうのウィンドウで開いても読めないとき、もう一度ためします</Hint></div> : null}
    <Hint className="mt-3">別のパソコンで使うときは、準備の画面の「コピーのファイル」から戻します</Hint>
  </div></main>;

  const hasBouts = model.totalBouts > 0;
  const ready = hasBouts && pending === 0;
  // 試合に入っている選手の人数（同じ人は1人）。「写真がない人が全員」かを調べるのに使う
  const fighterCount = new Set(data.bouts.flatMap((b) => [b.redId, b.blueId]).filter((id) => data.fighters.some((f) => f.id === id && f.absent !== true))).size;
  const setCount = (value: number) => { setDraft(null); setPrefs((old) => ({ ...old, count: clampPerPage(value, old.orientation), pages: null })); };
  const setPages = (value: 3 | 4) => { setDraft(null); setPrefs((old) => ({ ...old, count: null, pages: value })); };
  const setAuto = () => { setDraft(null); setPrefs((old) => ({ ...old, count: null, pages: null })); };
  const setOrientation = (value: SheetOrientation) => setPrefs((old) => ({ ...old, orientation: value }));
  const toggle = (key: keyof SheetShow) => setPrefs((old) => ({ ...old, show: { ...old.show, [key]: !old.show[key] } }));
  const atMin = perPage <= limit.min, atMax = perPage >= limit.max;
  const isAuto = prefs.count === null && prefs.pages === null;
  const nothingDecided = hasBouts && model.notes.empty.length === total;
  // 打っている途中の数が、使える範囲の外のとき
  const typed = draft !== null && draft !== '' ? Number(draft) : null;
  const typedOut = typed !== null && Number.isFinite(typed) && (typed > limit.max || typed < limit.min);
  const commitDraft = () => { const n = Number(draft); if (draft !== null && draft !== '' && Number.isFinite(n)) setCount(Math.round(n)); setDraft(null); };
  // 「A3を3枚／4枚にする」は、いまの試合数と上限で、その枚数にできるときだけ押せる
  const target = (n: 3 | 4) => ({ can: pagesIfTarget(total, n, orientation) === n, got: pagesIfTarget(total, n, orientation), other: pagesIfTarget(total, n, orientation === 'portrait' ? 'landscape' : 'portrait') });
  const t3 = target(3), t4 = target(4);
  const lockText = (n: 3 | 4, t: ReturnType<typeof target>): string => (prefs.pages === n ? '前に選んだ「A3を' + n + '枚にする」は、いまはできません。' : '「A3を' + n + '枚にする」は押せません。') + whyNot(n, t);
  const whyNot = (n: 3 | 4, t: ReturnType<typeof target>): string => '全' + total + '試合は、' + orientationWord(orientation) + 'では、A3を' + n + '枚にできません（' + t.got + '枚になります）。' + (t.other === n ? orientationWord(orientation === 'portrait' ? 'landscape' : 'portrait') + 'にすると' + n + '枚になります。' : '');
  const title = fitTitleMm(model.title, m.pageW - 20 - 66 - (model.logo ? HEADER_MM - 2 : 0));
  // 紙の枚数をへらす方法の案内（本当にへるときだけ「横」をすすめる。上限にぶつかっていないときは、＋か自動）
  const landPages = pageCount(total, resolvePerPage({ ...prefs, orientation: 'landscape' }, total));
  const reduceHint = pages <= 4 ? '' : orientation === 'portrait' && landPages < pages ? '紙を減らしたいときは、「横」にすると、' + landPages + '枚になります。' : atMax ? '1ページに載せられる数の上限のため、これ以上は減りません。' : '紙を減らしたいときは、1ページの試合数をふやす（＋）か、「自動」を押します。';

  return <main className={shell}>
    <div className="mx-auto max-w-5xl">
      <div className="sheet-noprint">
        <h1 className="text-2xl font-black [overflow-wrap:anywhere]">対戦一覧表（A3）</h1>
        <p className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">{model.title}</p>
        <Hint className="mt-2">保存した対戦カードから、掲示用の一覧表を作ります。組み合わせは、ここでは変えません。このままでよければ、下の「印刷する」を押します。順番・相手・欠場を直すときは、上の「この画面を閉じる」で準備の画面にもどり、直して「保存する」を押し、もう一度「A3の対戦一覧表をつくる」を押します。</Hint>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[17px] font-bold text-slate-800">
          <span id="sheet-saved-at">保存した時刻：{data.updatedAt ? clockText(data.updatedAt) : '（不明）'}</span>
          <span id="sheet-read-at">最後に読み込んだ時刻：{readAt ? clockText(readAt) : ''}</span>
          <button type="button" id="sheet-reload" onClick={reload} className={idle}>最新の内容を読み込む</button>
          <a href={back} id="sheet-back" onClick={leave} className={cx(idle, 'no-underline')}>この画面を閉じる（準備の画面にもどる）</a>
        </p>
        {reloadNote ? <div className="mt-2" id="sheet-reload-note">{reloadNote.ok
          ? <OkLine role="status">最新の内容を読み込みました（{clockText(reloadNote.at)}）。</OkLine>
          : <ErrorLine role="alert">読み込めませんでした。いま出ているのは、前に読み込んだ内容です。もう一度おしてください。</ErrorLine>}</div> : null}

        {hasBouts ? <section aria-label="一覧表の設定" className="mt-4 space-y-4 rounded-2xl bg-white p-4">
          <div>
            <h2 className="text-lg font-black">紙の向き</h2>
            <div role="group" aria-label="紙の向き" className="mt-2 flex flex-wrap gap-3">
              <button type="button" aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')} className={orientation === 'portrait' ? pressed : idle}>{orientation === 'portrait' ? <span aria-hidden="true">✓ </span> : null}縦（おすすめ）</button>
              <button type="button" aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')} className={orientation === 'landscape' ? pressed : idle}>{orientation === 'landscape' ? <span aria-hidden="true">✓ </span> : null}横（2列に並べます）</button>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-black">1ページに載せる試合の数</h2>
            <div role="group" aria-label="1ページに載せる試合の数" className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" id="sheet-less" aria-label="1ページの試合数を1つへらす" aria-disabled={atMin || undefined} aria-describedby={atMin ? 'sheet-limit-notes' : undefined} onClick={() => { if (!atMin) setCount(perPage - 1); }} className={atMin ? locked : idle}>－</button>
              <label className="flex items-center gap-2 text-[17px] font-bold">試合数<input id="sheet-per-page" type="number" inputMode="numeric" min={limit.min} max={limit.max} value={draft ?? String(perPage)}
                onChange={(e) => {
                  const text = e.target.value;
                  setDraft(text);
                  const n = Number(text);
                  // 打っている途中（空・範囲の外）は、数を変えない。範囲の中の整数になったら、すぐ反映する
                  if (text !== '' && Number.isInteger(n) && n >= limit.min && n <= limit.max) setPrefs((old) => ({ ...old, count: n, pages: null }));
                }}
                onBlur={commitDraft}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(); } }}
                aria-describedby="sheet-limit-notes"
                className="min-h-[48px] w-24 rounded-xl border-2 border-slate-500 bg-white px-3 text-center text-[17px] font-bold" /></label>
              <button type="button" id="sheet-more" aria-label="1ページの試合数を1つふやす" aria-disabled={atMax || undefined} aria-describedby={atMax ? 'sheet-limit-notes' : undefined} onClick={() => { if (!atMax) setCount(perPage + 1); }} className={atMax ? locked : idle}>＋</button>
              <button type="button" id="sheet-pages-3" aria-pressed={prefs.pages === 3 && t3.can} aria-disabled={!t3.can || undefined} aria-describedby={!t3.can ? 'sheet-limit-notes' : undefined} onClick={() => { if (t3.can) setPages(3); }} className={!t3.can ? locked : prefs.pages === 3 ? pressed : idle}>{prefs.pages === 3 && t3.can ? <span aria-hidden="true">✓ </span> : null}A3を3枚にする</button>
              <button type="button" id="sheet-pages-4" aria-pressed={prefs.pages === 4 && t4.can} aria-disabled={!t4.can || undefined} aria-describedby={!t4.can ? 'sheet-limit-notes' : undefined} onClick={() => { if (t4.can) setPages(4); }} className={!t4.can ? locked : prefs.pages === 4 ? pressed : idle}>{prefs.pages === 4 && t4.can ? <span aria-hidden="true">✓ </span> : null}A3を4枚にする</button>
              <button type="button" id="sheet-auto" aria-pressed={isAuto} onClick={setAuto} className={isAuto ? pressed : idle}>{isAuto ? <span aria-hidden="true">✓ </span> : null}自動（A3が4枚くらい）</button>
            </div>
            <p id="sheet-count-note" className="mt-2 text-[17px] font-bold" role="status">全{total}試合 → A3 {pages}枚（1ページ {perPage} 試合）</p>
            <div className="mt-1 space-y-1" id="sheet-limit-notes">
              {typedOut ? <LockReason>{typed! > limit.max ? limit.max + '試合までです。' : limit.min + '試合からです。'}Enter（またはほかの所を押す）と、{typed! > limit.max ? limit.max : limit.min}試合になります。</LockReason> : null}
              {atMin ? <LockReason>これ以上へらせません（{orientationWord(orientation)}は1ページ {limit.min} 試合から）。</LockReason> : null}
              {atMax ? <LockReason>これ以上ふやせません（{orientationWord(orientation)}は1ページ {limit.max} 試合まで）。</LockReason> : null}
              {!t3.can ? <LockReason>{lockText(3, t3)}</LockReason> : null}
              {!t4.can ? <LockReason>{lockText(4, t4)}</LockReason> : null}
              {warn.rule.length > 0 ? <Caution title="印刷の前に確かめてください">1ページに載せる試合が多いため、{numbersText(warn.rule.slice(0, 5))}{warn.rule.length > 5 ? ' ほか' + (warn.rule.length - 5) + '試合' : ''}の「ルール」の文字は、入りきらないので載りません。ルールは、短いときだけ載ります。1ページの試合数をへらすと載ることもありますが、長いルールは、1ページ1試合でも載りません。</Caution> : null}
              {warn.classLine.length > 0 ? <Caution title="印刷の前に確かめてください">1ページに載せる試合が多いため、{numbersText(warn.classLine.slice(0, 5))}{warn.classLine.length > 5 ? ' ほか' + (warn.classLine.length - 5) + '試合' : ''}のまん中の列の文字（体重の区分など）は、入りきらないので載りません。選手のそばの「クラス・区分・階級」は載ります。</Caution> : null}
              {reduceHint ? <Hint>A3が{pages}枚になります。{reduceHint}</Hint> : null}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-black">一覧表に載せるもの</h2>
            <p className="mt-1 text-[17px]">氏名は、いつも載ります。ほかは、載せるものを選びます。</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
              {([['photo', '小さな顔写真'], ['gym', 'ジム名'], ['classLine', 'クラス・区分・階級'], ['rule', 'ルール']] as const).map(([key, label]) =>
                <label key={key} className="flex min-h-[48px] items-center gap-3 text-[17px] font-bold"><input type="checkbox" checked={show[key]} onChange={() => toggle(key)} className="h-6 w-6" />{label}</label>)}
            </div>
            {/* 顔写真は、はじめは「出さない」。「出す」にしたときだけ、すぐそばに黄色の1行（壁に貼る紙に載ること）。出さないときは、何も出さない */}
            {show.photo ? <Caution id="sheet-photo-note" role="status">顔写真が、壁に貼る紙に載ります。申し込みページの『使い道』にも書いてあります。</Caution> : null}
            <Hint className="mt-1">名前・ジム名・顔写真は、会場に貼る紙に載ります。載せてよいかは、会長が決めます。電話番号・生年月日・健康のこと・同意の記録は、一覧表には出ません。</Hint>
          </div>
        </section> : null}

        <Checks notes={model.notes} total={total} ready={ready} pending={pending} showPhoto={show.photo} titleReal={isTitleReal(model.title)} cutBouts={warn.cut} leftOut={warn.rule.length + warn.classLine.length} fighterCount={fighterCount} />

        <div className="mt-4">
          {hasBouts
            ? <>
                {nothingDecided ? <NextSlot active label="選手を決める（準備の画面へ）" className="mb-3 max-w-xl">{backLink}</NextSlot> : null}
                <NextSlot active={ready && !nothingDecided} label="印刷の画面を開く" className="max-w-xl">
                  <button type="button" id="sheet-print" aria-disabled={!ready || undefined} aria-describedby={!ready ? 'sheet-print-reason' : undefined} onClick={() => { if (ready) print(); }} className={cx(button, 'w-full border-slate-900 bg-slate-900 text-white', !ready && 'tos-locked')}>印刷する（PDFにもできます）</button>
                  {!ready ? <LockReason id="sheet-print-reason">写真を、一覧表の大きさにととのえています（あと{pending}人）。少し待ちます。</LockReason> : null}
                </NextSlot>
              </>
            : <>
                <Caution title="対戦カードがありません">準備の画面で対戦カードを作って「保存する」を押してから、ここにもどります。</Caution>
                <NextSlot active label="準備の画面へもどる" className="mt-3 max-w-xl">{backLink}</NextSlot>
              </>}
          {hasBouts ? <Hint className="mt-2 max-w-3xl">印刷の画面が開いたら、プリンターを選ぶ欄（Chromeでは『送信先』）を『PDFに保存』にすると、PDFのファイルになります。Safariでは、左下の『PDF』から『PDFとして保存』を選びます。用紙は A3（{orientationWord(orientation)}）が選ばれます。ブラウザによって、言葉がちがうことがあります。</Hint> : null}
        </div>

        {hasBouts ? <h2 className="mt-6 text-lg font-black">印刷のプレビュー<span className="ml-2 text-[17px] font-bold text-slate-700">（実物の約{Math.round(scale * 100)}%。1ページずつ、このまま印刷されます）</span></h2> : null}
      </div>

      <div ref={boxRef} className="sheet-sheets mt-3 min-w-0">
        {model.pages.map((page) => <section key={page.number} className="sheet-wrap" aria-label={'対戦一覧表 ' + page.number + 'ページ目'} style={{ width: Math.round(pageW * scale), height: Math.round(pageH * scale) }}>
          <div className="sheet-page" data-sheet-page={page.number} style={{ width: m.pageW + 'mm', height: (m.pageH - 0.5) + 'mm', transform: 'scale(' + scale + ')' }}>
            <header className="sheet-head">
              <div className="sheet-head-title">
                {model.logo ? <CkaLogo size={Math.round((HEADER_MM - 6) * MM_PX)} className="bg-white" /> : null}
                <h2 className="sheet-title" style={{ fontSize: title.size + 'mm', WebkitLineClamp: title.lines }}>{model.title}</h2>
              </div>
              <div className="sheet-head-meta">
                <p className="sheet-range">{page.range}</p>
                <p className="sheet-pageno">{page.number} / {page.total} ページ</p>
              </div>
            </header>
            <div className="sheet-grid" style={{ gridTemplateColumns: 'repeat(' + m.columns + ', 1fr)', gridTemplateRows: 'repeat(' + m.rows + ', 1fr)', gridAutoFlow: m.columns > 1 ? 'column' : 'row', gap: ROW_GAP_MM + 'mm ' + COLUMN_GAP_MM + 'mm' }}>
              {page.bouts.map((bout) => <Bout key={bout.number} bout={bout} m={m} show={show} thumbs={thumbs} />)}
            </div>
          </div>
        </section>)}
      </div>
    </div>
  </main>;
}
