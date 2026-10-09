'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LocalTournament } from '../../../core/privateTournament.ts';
import {
  EMPTY_LIST_MESSAGE, LIST_PAGE_SIZE, MUSIC_NEW_TAB, NO_MUSIC_DONE, NO_MUSIC_EVENT, buildPageRows, clampPage, musicLabel, nowModel, pageButtonText, pageCount, pageJumpList, pageLabel, pageOfBout,
  pagerState, parseBoutNumber, summarizeMusic, totalLabel,
  type CornerModel, type RowModel,
} from './listLogic.ts';

/*
 * 赤と青は、色だけでなく「言葉」と「形」でも分ける（白黒の印刷・プロジェクター・色の見分けにくい人のため）:
 *   赤コーナー = ▲ / 青コーナー = ■ 。帯の中に、24px の太字で書く。
 */
const LOOK = {
  red: { band: 'bg-rose-700 text-white', border: 'border-rose-700', mark: '▲' },
  blue: { band: 'bg-blue-700 text-white', border: 'border-blue-700', mark: '■' },
} as const;

const OUTLINE = 'live-list-focus min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-4 text-[17px] font-black text-slate-900 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700';

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
  const tone = corner.music === 'none' ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-orange-700 bg-orange-100 text-orange-950';
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
      {musicEnabled && corner.music !== 'empty' ? <div className="mt-1.5"><MusicChip corner={corner} /></div> : null}
    </div>
  </div>;
}

function Row({ row, musicEnabled, saving, flash, onOpen }: { row: RowModel; musicEnabled: boolean; saving: boolean; flash: boolean; onOpen: (index: number) => void }) {
  const titleId = 'live-list-bout-' + row.index;
  const frame = row.isCurrent ? 'border-4 border-emerald-700 bg-emerald-50' : 'border-2 border-slate-300 bg-white';
  return <li id={'live-list-row-' + row.index} aria-labelledby={titleId} aria-current={row.isCurrent ? 'true' : undefined}
    className={'live-list-row grid gap-2 rounded-2xl p-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,1fr)] lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(0,11rem)_minmax(0,1fr)] ' + frame + (flash ? ' ring-4 ring-amber-500 ring-offset-2' : '')}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:col-span-3 lg:col-span-1 lg:flex-col lg:items-start">
      <h3 id={titleId} className="text-2xl font-black">{row.title}</h3>
      {row.isCurrent ? <span className="rounded-full bg-emerald-800 px-3 py-1 text-[17px] font-black text-white"><span aria-hidden="true">▶ </span>いま進行中</span> : null}
      {flash ? <span className="rounded-full bg-amber-200 px-3 py-1 text-[17px] font-black text-amber-950"><span aria-hidden="true">👈 </span>ここです</span> : null}
      <button type="button" disabled={saving} onClick={() => onOpen(row.index)} aria-label={row.openLabel}
        className={'live-list-open live-list-focus live-list-noprint ml-auto min-h-[48px] whitespace-nowrap rounded-xl border-2 bg-white px-3 text-[17px] font-black disabled:opacity-60 lg:ml-0 ' + (row.isCurrent ? 'border-emerald-800 text-emerald-950' : 'border-slate-700 text-slate-900')}>この試合を開く</button>
    </div>
    <Corner corner={row.red} musicEnabled={musicEnabled} />
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 px-1 text-center md:flex-col md:justify-center md:gap-0">
      <p className="text-[17px] font-black text-slate-600" aria-hidden="true">VS</p>
      <p className="text-[28px] font-black leading-tight [overflow-wrap:anywhere]"><span className="sr-only">契約 </span>{row.contract}</p>
      {row.rule ? <p className="w-full text-[17px] leading-snug text-slate-700 [overflow-wrap:anywhere]">ルール：{row.rule}</p> : null}
    </div>
    <Corner corner={row.blue} musicEnabled={musicEnabled} />
  </li>;
}

/** 対戦カードが 1 つもないとき（一覧も、1試合ずつの画面も、同じ言葉・同じボタン） */
export function EmptyBouts({ eventId }: { eventId: string }) {
  return <section className="mt-3 rounded-2xl bg-white p-6 text-center text-slate-950">
    <p className="text-xl font-black">{EMPTY_LIST_MESSAGE}</p>
    <a href={'/private/?event=' + encodeURIComponent(eventId)} className="live-list-focus mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-indigo-700 px-5 text-lg font-black text-white">準備の画面へ</a>
  </section>;
}

type Pending = { index: number; focus: boolean } | null;

/**
 * 試合の一覧。見るだけの画面で、ページを切りかえても「今の試合」は変えない。
 * 「この試合を開く」を押したときだけ onOpen（1試合ずつの画面と同じ保存）を呼ぶ。行のほかの所を触れても何も起きない。
 */
export default function ListView({ data, eventId, saving, onOpen }: { data: LocalTournament; eventId: string; saving: boolean; onOpen: (index: number) => void }) {
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
  const [flash, setFlash] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jumpText, setJumpText] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [jumpDone, setJumpDone] = useState('');
  useEffect(() => { if (moved.current) { moved.current = false; heading.current?.focus(); } }, [page]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  // くっつく帯の高さを測って、移動先・フォーカス中の所が帯の下に隠れないようにする（CSS の --live-sticky-h）
  useEffect(() => {
    const root = document.documentElement;
    const pick = () => {
      const wrap = document.querySelector<HTMLElement>('.live-sticky');
      const nav = wrap?.querySelector<HTMLElement>('nav');
      if (!wrap || !nav) return null;
      return getComputedStyle(wrap).position === 'sticky' ? wrap : getComputedStyle(nav).position === 'sticky' ? nav : null;
    };
    const set = () => { const el = pick(); root.style.setProperty('--live-sticky-h', (el ? Math.ceil(el.getBoundingClientRect().height) : 0) + 'px'); };
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
    row.scrollIntoView({ block: 'start' });
    if (target.focus) row.querySelector<HTMLElement>('button.live-list-open')?.focus({ preventScroll: true });
  }, [tick]);

  const go = (next: number) => { moved.current = true; setChosen(clampPage(next, count)); setJumpDone(''); };
  const goNow = () => {
    setOnlyMissing(false); setChosen(null); setJumpDone(''); setJumpError('');
    pending.current = { index: data.currentBout, focus: true }; setTick((t) => t + 1);
  };
  const toggleMissing = () => { setOnlyMissing((v) => !v); setChosen(filtered ? null : 0); setJumpDone(''); setJumpError(''); };
  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    const index = parseBoutNumber(jumpText, total);
    if (index === null) { setJumpError('1から' + total + 'までの数字を入れてください。'); setJumpDone(''); return; }
    const where = pageOfBout(index, total);
    setJumpError(''); setOnlyMissing(false); setChosen(where);
    setJumpDone('第' + (index + 1) + '試合のところへ来ました（' + (where + 1) + 'ページ目）。');
    setFlash(index);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 6000);
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
  return <section aria-labelledby="live-list-title" className="mt-3">
    <h2 id="live-list-title" ref={heading} tabIndex={-1} className="live-list-focus rounded-lg px-1 text-xl font-black">試合の一覧 <span className="text-[17px] font-bold text-slate-700">（{totalLabel(total)}）</span></h2>
    {!musicEnabled ? <p className="mt-2 rounded-xl bg-amber-50 p-3 text-[17px] font-bold text-slate-900"><span aria-hidden="true">♪ </span>{NO_MUSIC_EVENT}</p> : null}
    <div className="live-sticky">
      {now ? <div className={'live-now live-list-noprint rounded-2xl border-4 px-3 py-2 ' + (nowOnPage ? 'border-emerald-700 bg-emerald-50' : 'border-amber-500 bg-amber-100')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-2xl font-black leading-snug text-slate-950 [overflow-wrap:anywhere]">いま：{now.text}</p>
          <button type="button" onClick={goNow} className="live-list-focus min-h-[52px] w-full rounded-xl bg-slate-900 px-6 text-xl font-black text-white sm:w-auto">{nowOnPage ? 'いまの試合を見る' : 'いまの試合のページへ'}</button>
        </div>
        {!nowOnPage ? <p className="mt-1 text-[17px] font-bold text-amber-950"><span aria-hidden="true">⚠ </span>いまの試合は {now.title}（{now.page + 1}ページ目）です</p> : null}
      </div> : null}
      <nav aria-label="ページの切りかえ" className="live-pager live-list-noprint rounded-2xl border-2 border-slate-400 bg-white p-2 shadow-md">
        <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="order-first col-span-2 text-center md:order-none md:col-span-1">
            <p className="text-lg font-black leading-snug">{pageLabel(page, count, LIST_PAGE_SIZE, unit)}</p>
            {reason ? <p className="text-[17px] font-bold leading-snug text-slate-700">{reason}</p> : null}
          </div>
          <button type="button" disabled={state.prevDisabled} onClick={() => go(page - 1)} className={OUTLINE + ' md:order-first'}>← 前のページ</button>
          <button type="button" disabled={state.nextDisabled} onClick={() => go(page + 1)} className={OUTLINE}>次のページ →</button>
        </div>
      </nav>
    </div>
    <div className="live-list-noprint mt-2 grid gap-3 rounded-2xl bg-white p-3">
      {musicEnabled ? <div className={'flex flex-wrap items-center gap-3 rounded-xl border-4 p-3 ' + (summary.fighters > 0 ? 'border-amber-500 bg-amber-100' : 'border-emerald-700 bg-emerald-50')}>
        <p id="live-list-music-summary" className="min-w-0 flex-1 text-xl font-black leading-snug text-slate-950">
          <span aria-hidden="true">{summary.fighters > 0 ? '⚠ ' : '✓ '}</span>入場曲がまだの選手：{summary.fighters}人
          <span className="block text-[17px] font-bold text-slate-800">
            {summary.fighters === 0 ? NO_MUSIC_DONE : '曲なし ' + summary.none + '人・リンク要確認 ' + summary.broken + '人' + (filtered ? ' ／ 入場曲がまだの ' + filtered.length + '試合だけを表示中' : '')}
          </span>
        </p>
        {summary.fighters > 0 ? <button type="button" aria-describedby="live-list-music-summary" onClick={toggleMissing}
          className="live-list-focus min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-4 text-[17px] font-black text-slate-900">{filtered ? 'ぜんぶの試合を見る' : 'その試合だけ見る'}</button> : null}
      </div> : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {jumps.length ? <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ページを選ぶ">
          <span className="text-[17px] font-bold">ページを選ぶ：</span>
          {jumps.map((n, i) => n === 'gap' ? <span key={'gap' + i} aria-hidden="true" className="px-1 text-lg font-black">…</span> :
            <button key={n} type="button" aria-label={(n + 1) + 'ページ目を開く ' + pageButtonText(n, count) + (n === currentPage ? '（いまの試合があるページ）' : '')} aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}
              className={'live-list-focus min-h-[48px] min-w-[48px] rounded-xl border-2 px-3 text-[17px] font-black leading-tight ' + (n === page ? 'border-4 border-slate-900 bg-slate-100 text-slate-950' : 'border-slate-700 bg-white text-slate-900')}>
              <span className="block">{n === page ? <span aria-hidden="true">✓ </span> : null}{pageButtonText(n, count)}</span>
              {n === currentPage ? <span aria-hidden="true" className="block text-[17px] font-bold text-emerald-900">▶ いま</span> : null}
            </button>)}
        </div> : null}
        <form onSubmit={submitJump} noValidate className="flex flex-wrap items-center gap-2" aria-label="試合の番号でさがす">
          <span aria-hidden="true" className="text-xl font-black">第</span>
          <input id="live-list-jump" type="text" inputMode="numeric" autoComplete="off" value={jumpText} onChange={(e) => { setJumpText(e.target.value); setJumpError(''); }}
            aria-label="行きたい試合の番号（半角の数字）" aria-invalid={jumpError ? true : undefined} aria-describedby={jumpError ? 'live-list-jump-error' : undefined} placeholder={'1〜' + total}
            className="live-list-focus min-h-[48px] w-28 rounded-xl border-2 border-slate-700 bg-white px-3 text-xl font-black text-slate-950" />
          <span aria-hidden="true" className="text-xl font-black">試合へ</span>
          <button type="submit" className="live-list-focus min-h-[48px] rounded-xl border-2 border-slate-700 bg-white px-5 text-[17px] font-black text-slate-900">行く</button>
        </form>
      </div>
      {jumpError ? <p id="live-list-jump-error" role="alert" className="rounded-xl border-2 border-rose-700 bg-rose-50 p-2 text-[17px] font-bold text-rose-950"><span aria-hidden="true">⚠ </span>{jumpError}</p> : null}
      <p role="status" className={jumpDone ? 'rounded-xl border-2 border-emerald-700 bg-emerald-50 p-2 text-[17px] font-bold text-emerald-950' : 'sr-only'}>{jumpDone ? <><span aria-hidden="true">✓ </span>{jumpDone}</> : ''}</p>
    </div>
    <ol className="mt-3 grid gap-3">
      {rows.map((row) => <Row key={row.index} row={row} musicEnabled={musicEnabled} saving={saving} flash={flash === row.index} onOpen={onOpen} />)}
    </ol>
  </section>;
}
