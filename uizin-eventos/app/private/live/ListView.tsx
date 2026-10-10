'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LocalTournament } from '../../../core/privateTournament.ts';
import {
  EMPTY_LIST_MESSAGE, LIST_PAGE_SIZE, MUSIC_NEW_TAB, NO_MUSIC_DONE, NO_MUSIC_EVENT, boutNumberProblem, buildPageRows, clampPage, filterNote, jumpDoneText, musicLabel, nowModel, openWarning, pageButtonText, pageCount, pageJumpList, pageLabel, pageOfBout,
  pagerState, parseBoutNumber, summarizeMusic, totalLabel,
  type CornerModel, type RowModel,
} from './listLogic.ts';
import { Caution, ErrorLine, Hint, NextSlot, cx } from './liveMarks.tsx';

/*
 * 赤と青は、色だけでなく「言葉」と「形」でも分ける（白黒の印刷・プロジェクター・色の見分けにくい人のため）:
 *   赤コーナー = ▲ / 青コーナー = ■ 。帯の中に、24px の太字で書く。
 */
const LOOK = {
  red: { band: 'bg-rose-700 text-white', border: 'border-rose-700', mark: '▲' },
  blue: { band: 'bg-blue-700 text-white', border: 'border-blue-700', mark: '■' },
} as const;

/* 押せないボタン(disabled)は、灰の点線(tos-locked)になる。文字は読める濃さのまま。理由は、すぐ近くの「🔒」の行に書く */
const OUTLINE = 'live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-4 text-[17px] font-black text-slate-900 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700';

function Photo({ corner }: { corner: CornerModel }) {
  return <div className="live-list-photo flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
    {corner.photoDataUrl
      ? <img src={corner.photoDataUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
      : <span aria-hidden="true" className="text-2xl text-slate-500">👤</span>}
  </div>;
}

/** 入場曲の札。ないときがいちばん目立つ（琥珀の太い枠）。あるときは静か。リンクがおかしいときは、別の言葉・別の濃い色。 */
function MusicChip({ corner }: { corner: CornerModel }) {
  const text = musicLabel(corner.music);
  if (corner.music === 'link') {
    return <a href={corner.musicUrl} target="_blank" rel="noreferrer" aria-label={'曲を開く 入場曲あり ' + corner.name + '（新しいタブで開く）'}
      className="live-list-focus inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-slate-600 bg-white px-4 text-[17px] font-bold text-slate-900">
      <span>{text}</span><span className="font-medium text-slate-700">{MUSIC_NEW_TAB}</span>
    </a>;
  }
  // 曲がない=「⚠ 気をつけて」の薄い黄＋太い枠 / リンクがおかしい=「✕ まちがい」の赤＋太い枠（言葉も別）
  const tone = corner.music === 'none' ? 'border-[#a16207] bg-[#fefce8] text-[#1c1917]' : 'border-[#b91c1c] bg-[#fef2f2] text-[#991b1b]';
  return <p className={'inline-flex min-h-[40px] items-center rounded-xl border-4 px-3 text-[18px] font-black leading-snug ' + tone}>{text}</p>;
}

function Corner({ corner, musicEnabled }: { corner: CornerModel; musicEnabled: boolean }) {
  const look = LOOK[corner.side];
  const label = corner.label + ' ' + corner.name + (corner.gym ? ' ' + corner.gym : '');
  return <div role="group" aria-label={label} className={'min-w-0 overflow-hidden rounded-xl border-[3px] bg-white ' + look.border}>
    <p className={'px-3 py-0.5 text-2xl font-black leading-snug ' + look.band}><span aria-hidden="true">{look.mark} </span>{corner.label}</p>
    <div className="p-2">
      <div className="flex items-start gap-3">
        <Photo corner={corner} />
        <div className="min-w-0 flex-1">
          <p className={'text-[28px] font-black leading-tight [overflow-wrap:anywhere] ' + (corner.present ? 'text-slate-950' : 'text-slate-600')}>{corner.name}</p>
          {corner.gym ? <p className="text-[17px] font-bold leading-snug text-slate-700 [overflow-wrap:anywhere]">{corner.gym}</p> : null}
        </div>
      </div>
      {!corner.present ? <ErrorLine className="mt-1.5">選手が選ばれていません。準備画面で選ぶ</ErrorLine> : null}
      {musicEnabled && corner.music !== 'empty' ? <div className="mt-1.5"><MusicChip corner={corner} /></div> : null}
      {musicEnabled && corner.music === 'broken' ? <ErrorLine className="mt-1.5">曲のリンクが使えません。Apple Music か YouTube の https:// だけ使えます。準備画面で直す</ErrorLine> : null}
    </div>
  </div>;
}

function Row({ row, musicEnabled, saving, pressed, failed, retry, flash, onOpen }: { row: RowModel; musicEnabled: boolean; saving: boolean; pressed: boolean; failed: boolean; retry: boolean; flash: boolean; onOpen: (index: number) => void }) {
  const titleId = 'live-list-bout-' + row.index;
  const frame = row.isCurrent ? 'border-4 border-emerald-700 bg-emerald-50' : 'border-2 border-slate-300 bg-white';
  // 保存しているあいだ: 押した行は「⏳ 保存しています…」、ほかの行は「🔒 保存中」（押しても何も起きない）
  const word = saving ? (pressed ? '⏳ 保存しています…' : '🔒 保存中') : 'この試合を開く';
  return <li id={'live-list-row-' + row.index} aria-labelledby={titleId} aria-current={row.isCurrent ? 'true' : undefined}
    className={'live-list-row grid gap-1.5 rounded-2xl p-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,1fr)] lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,11rem)_minmax(0,1fr)] ' + frame + (flash ? ' ring-4 ring-emerald-600 ring-offset-2' : '')}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:col-span-3 lg:col-span-1 lg:flex-col lg:items-start lg:gap-y-2">
      <h3 id={titleId} className="text-2xl font-black">{row.title}</h3>
      {row.isCurrent ? <span className="rounded-full bg-emerald-800 px-3 py-1 text-[17px] font-black text-white"><span aria-hidden="true">▶ </span>いま進行中</span> : null}
      {flash ? <span className="rounded-full border-2 border-emerald-700 bg-emerald-100 px-3 py-1 text-[17px] font-black text-emerald-950"><span aria-hidden="true">👈 </span>ここです</span> : null}
      <NextSlot active={retry && !saving} label="もう一度押す" className="ml-auto max-w-full lg:ml-0">
        <button type="button" disabled={saving} onClick={() => onOpen(row.index)} aria-label={row.openLabel}
          className={'live-list-open live-list-focus live-list-noprint touch-manipulation min-h-[48px] rounded-xl border-2 bg-white px-3 text-[17px] font-black ' + (saving ? 'tos-locked whitespace-normal' : 'whitespace-nowrap') + (row.isCurrent ? ' border-emerald-800 text-emerald-950' : ' border-slate-700 text-slate-900')}>{word}</button>
      </NextSlot>
      {failed ? <ErrorLine className="live-list-noprint basis-full lg:basis-auto">この行は開けませんでした。もう一度押す</ErrorLine> : null}
      {!row.isCurrent && !saving ? <p className="live-list-noprint m-0 basis-full text-[17px] font-bold leading-snug text-slate-900 lg:basis-auto"><span aria-hidden="true">⚠ </span>{openWarning(row.index)}</p> : null}
    </div>
    <Corner corner={row.red} musicEnabled={musicEnabled} />
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 px-1 text-center md:flex-col md:justify-center md:gap-0">
      <p className="text-[17px] font-black text-slate-600" aria-hidden="true">VS</p>
      <p className="text-[28px] font-black leading-tight [overflow-wrap:anywhere]"><span className="sr-only">契約 </span>{row.contract}</p>
      {row.noContract ? <ErrorLine className="w-full">体重が入っていません（準備画面で入れる）</ErrorLine> : null}
      {row.sameFighter ? <ErrorLine className="w-full">まちがい：赤と青が同じ選手です。準備画面で直す</ErrorLine> : null}
      {row.rule ? <p className="w-full text-[17px] leading-snug text-slate-700 [overflow-wrap:anywhere]">ルール：{row.rule}</p> : null}
    </div>
    <Corner corner={row.blue} musicEnabled={musicEnabled} />
  </li>;
}

/** 一覧の中で決まった「黄色は『1試合ずつ』ボタンへ」を、上の見かたのボタン（page.tsx）に伝える。見えない部品（hooks を条件の外に置くため、別の部品にしてある） */
function WantSingle({ want, onChange }: { want: boolean; onChange?: (want: boolean) => void }) {
  useEffect(() => { onChange?.(want); }, [want, onChange]);
  useEffect(() => () => onChange?.(false), [onChange]);
  return null;
}

/** 対戦カードが 1 つもないとき（一覧も、1試合ずつの画面も、同じ言葉・同じボタン） */
export function EmptyBouts({ eventId }: { eventId: string }) {
  return <section className="mt-3 rounded-2xl bg-white p-6 text-center text-slate-950">
    <p className="text-xl font-black">{EMPTY_LIST_MESSAGE}</p>
    <NextSlot active label="準備画面で対戦カードを作る" className="mx-auto mt-4 max-w-md text-left">
      <a href={'/private/?event=' + encodeURIComponent(eventId)} className="live-list-focus inline-flex min-h-[48px] items-center rounded-xl bg-indigo-700 px-5 text-lg font-black text-white">準備画面へ戻る</a>
    </NextSlot>
  </section>;
}

type Pending = { index: number; focus: boolean } | null;

/** くっつく帯の今の高さを --live-sticky-h に入れる。帯の中身が変わった直後（今の試合のページへ → 帯が背が高くなる）でも、行を帯の下に隠さないよう、行へ進む直前にも呼ぶ */
function measureSticky(): void {
  const root = document.documentElement;
  const wrap = document.querySelector<HTMLElement>('.live-sticky');
  const nav = wrap?.querySelector<HTMLElement>('nav');
  const el = !wrap || !nav ? null : getComputedStyle(wrap).position === 'sticky' ? wrap : getComputedStyle(nav).position === 'sticky' ? nav : null;
  root.style.setProperty('--live-sticky-h', (el ? Math.ceil(el.getBoundingClientRect().height) : 0) + 'px');
}

/**
 * 試合の一覧。見るだけの画面で、ページを切りかえても「今の試合」は変えない。
 * 「この試合を開く」を押したときだけ onOpen（1試合ずつの画面と同じ保存）を呼ぶ。行のほかの所を触れても何も起きない。
 * pressedIndex = いま保存している行 / retryIndex = 保存に失敗して「もう一度押す」を黄色にする行 / failedIndex = 「開けませんでした」を出す行
 */
export default function ListView({ data, eventId, saving, onOpen, onWantSingle, pressedIndex = null, retryIndex = null }: { data: LocalTournament; eventId: string; saving: boolean; onOpen: (index: number) => void; onWantSingle?: (want: boolean) => void; pressedIndex?: number | null; retryIndex?: number | null }) {
  const total = data.bouts.length;
  const musicEnabled = data.entryConfig?.music ?? true;
  const summary = summarizeMusic(data, musicEnabled);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const filtered = musicEnabled && onlyMissing && summary.bouts.length > 0 ? summary.bouts : null;
  const count = filtered ? filtered.length : total;
  // null = 今の試合があるページ（今の試合が動いたら一緒に動く）。自分でページを選んだら、その番号に固定する。
  const [chosen, setChosen] = useState<number | null>(null);
  const posInList = filtered ? filtered.indexOf(data.currentBout) : data.currentBout;
  const page = clampPage(chosen ?? (posInList >= 0 ? pageOfBout(posInList, count) : 0), count);
  const pages = pageCount(count);
  const unit = filtered ? '件目' : '試合目';
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const pending = useRef<Pending>(null);
  const [tick, setTick] = useState(0);
  // 「行く」で来た行の印（緑の枠＋「ここです」）。次の操作（ページを動かす・ほかへ行く・曲の絞りこみ）まで残す
  const [flash, setFlash] = useState<number | null>(null);
  const [jumpText, setJumpText] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [jumpDone, setJumpDone] = useState('');
  useEffect(() => { if (moved.current) { moved.current = false; heading.current?.focus(); } }, [page]);
  // くっつく帯の高さを測って、移動先・フォーカス中の所が帯の下に隠れないようにする（CSS の --live-sticky-h）
  useEffect(() => {
    const root = document.documentElement;
    const set = () => measureSticky();
    set();
    window.addEventListener('resize', set);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    document.querySelectorAll('.live-sticky, .live-sticky > *').forEach((el) => observer?.observe(el));
    return () => { window.removeEventListener('resize', set); observer?.disconnect(); root.style.removeProperty('--live-sticky-h'); };
  }, [total]);
  // 一覧を開いた直後: 今の試合が最初の画面の外にあるときだけ、その行まで進める（「いま、どの試合？」が すぐ分かる）。
  // ページの先頭の行のときは進めない（上の「今の試合」の帯・ページ切りかえ・キーボードの Tab の始まりを、そのまま見せる）
  useEffect(() => {
    const row = document.getElementById('live-list-row-' + data.currentBout);
    if (!row || !row.previousElementSibling) return;
    const r = row.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    row.scrollIntoView({ block: 'start' });
  }, []);
  // 「いまの試合を見る」「第N試合へ」を押したあと、描き直しが終わってから、その行へ進める
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const row = document.getElementById('live-list-row-' + target.index);
    if (!row) return;
    measureSticky();
    row.scrollIntoView({ block: 'start' });
    if (target.focus) row.querySelector<HTMLElement>('button.live-list-open')?.focus({ preventScroll: true });
  }, [tick]);

  const go = (next: number) => { moved.current = true; setChosen(clampPage(next, count)); setJumpDone(''); setFlash(null); };
  const goNow = () => {
    setOnlyMissing(false); setChosen(null); setJumpDone(''); setJumpError(''); setFlash(null);
    pending.current = { index: data.currentBout, focus: true }; setTick((t) => t + 1);
  };
  const toggleMissing = () => { setOnlyMissing((v) => !v); setChosen(filtered ? null : 0); setJumpDone(''); setJumpError(''); setFlash(null); };
  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    const index = parseBoutNumber(jumpText, total);
    if (index === null) { setJumpError(boutNumberProblem(jumpText, total)?.message ?? '1から' + total + 'までの数字を入れてください。'); setJumpDone(''); return; }
    const where = pageOfBout(index, total);
    setJumpError(''); setOnlyMissing(false); setChosen(where);
    setJumpDone(jumpDoneText(index, where, data.currentBout));
    setFlash(index);
    pending.current = { index, focus: true }; setTick((t) => t + 1);
  };

  if (total === 0) return <EmptyBouts eventId={eventId} />;

  const rows = buildPageRows(data, page, musicEnabled, LIST_PAGE_SIZE, filtered ?? undefined);
  const state = pagerState(page, count);
  const jumps = pageJumpList(pages, page, filtered ? undefined : pageOfBout(data.currentBout, total));
  const now = nowModel(data);
  const nowOnPage = rows.some((r) => r.isCurrent);
  const currentPage = filtered ? -1 : pageOfBout(data.currentBout, total);
  const reason = state.prevDisabled ? state.prevReason : state.nextReason;
  // 黄色の「次はここ」は、一覧では いつも1つ以内: 失敗した行の「もう一度押す」 > 絞りこみを やめる > 今の試合のページへ > いまの試合を見る
  const retryHere = retryIndex !== null && rows.some((r) => r.index === retryIndex);
  const yellowFilter = !retryHere && !!filtered;
  const yellowNow = !retryHere && !filtered && !nowOnPage;
  // ふだんの一覧（いまの試合が見えている）：ここには『次に押すもの』はない。試合を進めるのは「1試合ずつ」の画面なので、黄色は上の「1試合ずつ」ボタンに付く（page.tsx）
  const wantSingle = !retryHere && !filtered && nowOnPage;
  return <section aria-labelledby="live-list-title" className="mt-3">
    <WantSingle want={wantSingle} onChange={onWantSingle} />
    <Caution className="live-list-noprint mb-2">ここは見るだけです。<b>「この試合を開く」</b>を押すと、いまの試合が変わります（そのあと「もどす」で戻せます）。</Caution>
    <h2 id="live-list-title" ref={heading} tabIndex={-1} className="live-list-focus rounded-lg px-1 text-xl font-black">試合の一覧 <span className="text-[17px] font-bold text-slate-700">（{totalLabel(total)}）</span></h2>
    {!musicEnabled ? <p className="mt-2 rounded-xl border border-slate-300 bg-white p-3 text-[17px] font-bold text-slate-900"><span aria-hidden="true">♪ </span>{NO_MUSIC_EVENT}</p> : null}
    <div className="live-sticky">
      {now ? <div className={cx('live-now live-list-noprint rounded-2xl border-4 px-3 py-2', nowOnPage ? 'border-emerald-700 bg-emerald-50' : 'tos-caution border-amber-500')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-2xl font-black leading-snug text-slate-950 [overflow-wrap:anywhere]">いま：{now.text}</p>
          {nowOnPage
            ? <button type="button" onClick={goNow} className="live-list-focus touch-manipulation min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-6 text-xl font-black text-slate-950 sm:w-auto">いまの試合を見る</button>
            : <NextSlot active={yellowNow} label="いまの試合の場所へ行く（見るだけ）" className="w-full sm:w-auto">
                <button type="button" onClick={goNow} className="live-list-focus touch-manipulation min-h-[52px] w-full rounded-xl bg-slate-900 px-6 text-xl font-black text-white sm:w-auto">いまの試合のページへ</button>
              </NextSlot>}
        </div>
        {nowOnPage
          ? <p className="mt-1 text-[17px] font-bold text-emerald-900"><span aria-hidden="true">✓ </span>いまの試合は このページです（見るだけ。試合は変わりません）。試合を進めるときは、上の「1試合ずつ」を押します。</p>
          : <p className="mt-1 text-[17px] font-bold text-slate-950"><span aria-hidden="true">⚠ </span>いまの試合は {now.title}（{now.page + 1}ページ目）です</p>}
      </div> : null}
      <nav aria-label="ページの切りかえ" className="live-pager live-list-noprint rounded-2xl border-2 border-slate-400 bg-white p-2 shadow-md">
        <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="order-first col-span-2 text-center md:order-none md:col-span-1">
            <p className="text-lg font-black leading-snug">{pageLabel(page, count, LIST_PAGE_SIZE, unit)}</p>
            {reason ? <p className="text-[17px] font-bold leading-snug text-slate-700"><span aria-hidden="true">🔒 </span>{reason}</p> : <p className="text-[17px] font-bold leading-snug text-slate-700">見るだけ（試合は変わりません）</p>}
          </div>
          <button type="button" disabled={state.prevDisabled} onClick={() => go(page - 1)} className={OUTLINE + ' md:order-first' + (state.prevDisabled ? ' tos-locked' : '')}>← 前のページ</button>
          <button type="button" disabled={state.nextDisabled} onClick={() => go(page + 1)} className={OUTLINE + (state.nextDisabled ? ' tos-locked' : '')}>次のページ →</button>
        </div>
      </nav>
    </div>
    <div className="live-list-noprint mt-2 grid gap-3 rounded-2xl bg-white p-3">
      {musicEnabled ? (summary.fighters > 0
        ? <Caution>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p id="live-list-music-summary" className="m-0 min-w-0 flex-1 text-xl font-black leading-snug text-slate-950">
                入場曲がまだの選手：{summary.fighters}人
                <span className="block text-[17px] font-bold text-slate-800">
                  {'曲なし ' + summary.none + '人・リンク要確認 ' + summary.broken + '人'}
                </span>
              </p>
              {filtered
                ? <NextSlot active={yellowFilter} label="ぜんぶの試合に もどす" className="w-full sm:w-auto">
                    <button type="button" aria-describedby="live-list-music-summary" onClick={toggleMissing} className="live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-4 text-[17px] font-black text-slate-900">ぜんぶの試合を見る</button>
                  </NextSlot>
                : <button type="button" aria-describedby="live-list-music-summary" onClick={toggleMissing} className="live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-4 text-[17px] font-black text-slate-900">曲がない試合だけ見る</button>}
            </div>
            {filtered ? <p className="m-0 mt-1 text-[17px] font-bold text-slate-950">{filterNote(filtered.length, total)}曲が まだの人が出る試合だけです。</p> : null}
          </Caution>
        : <div className="tos-ok">
            <p id="live-list-music-summary" className="m-0 text-xl font-black leading-snug">
              <span aria-hidden="true">✓ </span>入場曲がまだの選手：{summary.fighters}人
              <span className="block text-[17px] font-bold">{NO_MUSIC_DONE}</span>
            </p>
          </div>) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {jumps.length ? <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ページを選ぶ">
          <span className="text-[17px] font-bold">見る場所をえらぶ（見るだけ）：</span>
          {jumps.map((n, i) => n === 'gap' ? <span key={'gap' + i} aria-hidden="true" className="px-1 text-lg font-black">…</span> :
            <button key={n} type="button" aria-label={(n + 1) + 'ページ目を開く ' + pageButtonText(n, count) + (n === currentPage ? '（いまの試合があるページ）' : '')} aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}
              className={'live-list-focus touch-manipulation min-h-[48px] min-w-[48px] rounded-xl border-2 px-3 text-[17px] font-black leading-tight ' + (n === page ? 'border-4 border-slate-900 bg-slate-100 text-slate-950' : 'border-slate-700 bg-white text-slate-900')}>
              <span className="block">{n === page ? <span aria-hidden="true">✓ </span> : null}{pageButtonText(n, count)}</span>
              {n === currentPage ? <span aria-hidden="true" className="block text-[17px] font-bold text-emerald-900">▶ いま</span> : null}
            </button>)}
        </div> : null}
        <form onSubmit={submitJump} noValidate className="flex flex-wrap items-center gap-2" aria-label="試合の番号でさがす">
          <span aria-hidden="true" className="text-xl font-black">第</span>
          <input id="live-list-jump" type="text" inputMode="numeric" autoComplete="off" value={jumpText} onChange={(e) => { setJumpText(e.target.value); setJumpError(''); }}
            aria-label="行きたい試合の番号（半角の数字）" aria-invalid={jumpError ? true : undefined} aria-describedby={cx(jumpError && 'live-list-jump-error', 'live-list-jump-example')} placeholder={'1〜' + total}
            className={cx('live-list-focus min-h-[48px] w-28 rounded-xl border-2 border-slate-700 bg-white px-3 text-xl font-black text-slate-950', jumpError && 'tos-input-error')} />
          <span aria-hidden="true" className="text-xl font-black">試合へ</span>
          <button type="submit" className="live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-5 text-[17px] font-black text-slate-900">行く</button>
        </form>
      </div>
      <p id="live-list-jump-example" className="tos-example m-0" style={{ fontSize: '1.0625rem' }}>例：<code>12</code>　（「12番」でも「１２」でも大丈夫。見るだけです。いまの試合は変わりません）</p>
      {jumpError ? <ErrorLine id="live-list-jump-error" role="alert">{jumpError}</ErrorLine> : null}
      <p role="status" className={jumpDone ? 'tos-ok m-0 text-[17px]' : 'sr-only'}>{jumpDone ? <><span aria-hidden="true">✓ </span>{jumpDone}</> : ''}</p>
    </div>
    <ol className="mt-3 grid gap-3">
      {rows.map((row) => <Row key={row.index} row={row} musicEnabled={musicEnabled} saving={saving} pressed={pressedIndex === row.index} failed={!saving && retryIndex === row.index} retry={retryIndex === row.index && retryHere} flash={flash === row.index} onOpen={onOpen} />)}
    </ol>
    <div className="live-list-noprint mt-8 grid gap-1 border-t-2 border-slate-300 pt-4">
      <Hint>直しても、いまの試合は変わりません</Hint>
      <a href={'/private/?event=' + encodeURIComponent(eventId)} className="live-list-focus inline-flex min-h-[48px] items-center justify-self-start rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800">準備画面へ戻る（選手や試合をなおす）</a>
    </div>
  </section>;
}
