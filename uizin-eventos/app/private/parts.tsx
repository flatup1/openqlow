'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* 準備の画面（/private/）の共通部品。色の意味は全画面で同じ:
   indigo=次にやる1つ / emerald=できた・保存 / amber=足りない・注意 / 灰=ほか・消す / rose=赤コーナーと本当のエラー / blue=青コーナー */

export const btn = {
  base: 'inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 text-center font-bold [overflow-wrap:anywhere] touch-manipulation focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-slate-600 aria-disabled:bg-slate-100 aria-disabled:text-slate-700 ',
  primary: 'min-h-14 border-indigo-700 bg-indigo-700 text-xl text-white hover:bg-indigo-800 ',
  success: 'min-h-14 border-emerald-700 bg-emerald-700 text-xl text-white hover:bg-emerald-800 ',
  outline: 'min-h-12 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  outlineBig: 'min-h-14 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  indigoOutline: 'min-h-14 border-indigo-700 bg-white text-lg text-indigo-800 hover:bg-indigo-50 ',
};
export const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const inputClass = 'mt-1 block min-h-14 w-full min-w-0 rounded-xl border-2 border-slate-500 bg-white px-3 py-2 text-lg font-medium text-slate-950 placeholder:text-slate-500 focus:border-indigo-700 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 aria-[invalid=true]:border-amber-600 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-amber-200';

type Tone = 'green' | 'amber' | 'slate' | 'rose' | 'blue' | 'indigo';
const toneClass: Record<Tone, string> = {
  green: 'border-emerald-700 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-500 bg-amber-50 text-amber-950',
  slate: 'border-slate-400 bg-slate-100 text-slate-900',
  rose: 'border-rose-600 bg-rose-50 text-rose-900',
  blue: 'border-blue-600 bg-blue-50 text-blue-900',
  indigo: 'border-indigo-700 bg-indigo-50 text-indigo-900',
};

export function Chip({ tone = 'slate', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cls('inline-flex min-h-8 items-center rounded-full border-2 px-3 text-[17px] font-bold leading-tight', toneClass[tone], className)}>{children}</span>;
}

/** できた ✓ / まだ の小さな札（各セクションの見出しの横に出す） */
export function DoneChip({ done, doneText = 'できた', todoText = 'まだ' }: { done: boolean; doneText?: string; todoText?: string }) {
  return done ? <Chip tone="green">{doneText} ✓</Chip> : <Chip tone="slate">{todoText}</Chip>;
}

/** 必須 / なくてもOK の札。ラベルの文字には混ぜない（ラベルの名前を変えないため） */
export function Badge({ required, text }: { required?: boolean; text?: string }) {
  return required
    ? <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 text-[17px] font-bold text-amber-950">必須</span>
    : <span className="ml-2 inline-flex items-center rounded-md bg-slate-200 px-2 text-[17px] font-bold text-slate-800">{text ?? 'なくてもOK'}</span>;
}

/**
 * 知らせ。いつも role="status"（テストと読み上げの両方のため）。error だけ aria-live を強くする。
 * live="off": 同じ内容を別の場所が読み上げるとき（読み上げが2回にならないように）
 * ボタンは文の下の行に出す。ok は少したつと消え、error は残る
 */
export function Notice({ kind, children, onClose, action, className = '', compact = false, inlineClose = false, live }: { kind: 'ok' | 'error' | 'info' | 'warn'; children: ReactNode; onClose?: () => void; action?: { label: string; onClick: () => void; id?: string }; className?: string; compact?: boolean; inlineClose?: boolean; live?: 'off' | 'polite' | 'assertive' }) {
  const tone = kind === 'ok' ? toneClass.green : kind === 'error' ? toneClass.rose : kind === 'warn' ? toneClass.amber : toneClass.slate;
  const icon = kind === 'ok' ? '✓' : kind === 'error' ? '!' : kind === 'warn' ? '⚠' : 'i';
  const iconTone = kind === 'ok' ? 'bg-emerald-700' : kind === 'error' ? 'bg-rose-600' : kind === 'warn' ? 'bg-amber-600' : 'bg-slate-600';
  // compact: 下の帯の中で使う。画面の高さを取りすぎないよう、余白と行の高さを小さくし、ボタンは文の下にそのまま並べる（内側のスクロールは使わない）
  return <div role="status" aria-live={live ?? (kind === 'error' ? 'assertive' : 'polite')} className={cls('min-w-0 rounded-xl border-2 text-[17px] font-bold shadow-sm', compact ? 'p-2 leading-snug' : 'p-3 leading-relaxed', tone, className)}>
    <div className={cls('flex min-w-0 items-start', compact ? 'gap-2' : 'gap-3')}>
      {inlineClose ? null : <span aria-hidden="true" className={cls('mt-0.5 grid shrink-0 place-items-center rounded-full text-[17px] text-white', compact ? 'h-6 w-6' : 'h-7 w-7', iconTone)}>{icon}</span>}
      <div className="min-w-0 flex-1 break-words">
        {/* inlineClose: 「✕ とじる」を文の右はしに小さく置く（下の帯の高さをおさえるため）。字は2行で、ことばも見える */}
        {inlineClose && onClose ? <button type="button" aria-label="✕ とじる" onClick={onClose} className={cls(btn.base, btn.outline, 'float-right ml-2 w-[4.5rem] flex-col gap-0 whitespace-nowrap px-1 leading-tight')}><span aria-hidden="true">✕</span><span aria-hidden="true" className="text-[17px]">とじる</span></button> : null}
        {inlineClose ? <span aria-hidden="true" className="mr-1">{icon}</span> : null}{children}
      </div>
    </div>
    {action || (onClose && !inlineClose) ? <div className={cls('mt-2 flex w-full flex-wrap gap-2', compact ? 'pl-0' : 'pl-10')}>
      {action ? <button type="button" id={action.id} onClick={action.onClick} className={cls(btn.base, btn.outline, compact ? 'px-2' : 'px-3')}>{action.label}</button> : null}
      {onClose && !inlineClose ? <button type="button" onClick={onClose} className={cls(btn.base, btn.outline, compact ? 'px-2' : 'px-3')}>✕ とじる</button> : null}
    </div> : null}
  </div>;
}

/** 折りたたみ。見出し行は48px以上、開閉の文字つき。中身は消さずにしまう */
export function Fold({ title, children, open, onToggle, className = '', summaryClass = '', id }: { title: ReactNode; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; className?: string; summaryClass?: string; id?: string }) {
  return <details id={id} open={open} onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined} className={cls('group rounded-xl border-2 border-slate-300 bg-white', className)}>
    <summary className={cls('flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-bold [&::-webkit-details-marker]:hidden', summaryClass)}>
      <span className="min-w-0 flex-1 text-balance [overflow-wrap:anywhere]">{title}</span>
      <span aria-hidden="true" className="shrink-0 text-[17px] font-bold text-indigo-800"><span className="group-open:hidden">▶ ひらく</span><span className="hidden group-open:inline">▼ とじる</span></span>
    </summary>
    <div className="border-t-2 border-slate-200 p-4">{children}</div>
  </details>;
}

export function Section({ id, title, done, doneText, todoText, children }: { id: string; title: string; done: boolean; doneText?: string; todoText?: string; children: ReactNode }) {
  return <section id={id} tabIndex={-1} className="scroll-mt-28 focus:outline-none rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center gap-3"><h2 className="min-w-0 text-balance text-2xl font-bold [overflow-wrap:anywhere]">{title}</h2><DoneChip done={done} doneText={doneText} todoText={todoText} /></div>
    <div className="mt-4 space-y-5">{children}</div>
  </section>;
}

/**
 * 画面の中の確認の箱（window.confirm の代わり）。押したボタンのすぐ近くに出す。
 * 1行目＝結論（何がどう変わるか）。ボタンは2つだけ。さいしょにフォーカスが乗るのは「安全なほう」（やめる）。
 * Escape で「やめる」。まわりの画面はふつうに使えるが、あぶないほうは「yesLabel」のボタンを押したときだけ。
 */
export function ConfirmBox({ id, label, verdict, lines, yesLabel, noLabel, onYes, onNo }: { id: string; label: string; verdict: string; lines: string[]; yesLabel: string; noLabel: string; onYes: () => void; onNo: () => void }) {
  const safeRef = useRef<HTMLButtonElement | null>(null);
  const noRef = useRef(onNo);
  noRef.current = onNo;
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 開いたら「やめる」にフォーカス。箱ぜんたい（質問・2つのボタン）が、上のナビと下の帯に隠れずに見えるようにする。
  // 低い画面（スマホを横にした・拡大した）で入りきらないときは、質問の文から見せる
  useEffect(() => {
    safeRef.current?.focus({ preventScroll: true });
    const box = boxRef.current;
    if (!box) return;
    const root = getComputedStyle(document.documentElement);
    const room = window.innerHeight - (parseFloat(root.scrollPaddingTop) || 0) - (parseFloat(root.scrollPaddingBottom) || 0);
    try { box.scrollIntoView({ block: box.getBoundingClientRect().height <= room ? 'nearest' : 'start' }); } catch { /* 古いブラウザでは、そのまま */ }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); noRef.current(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <div ref={boxRef} id={id} role="alertdialog" aria-label={label} aria-describedby={id + '-verdict'} className="mt-3 w-full min-w-0 scroll-mt-28 rounded-xl border-4 border-amber-500 bg-amber-50 p-3 text-slate-950">
    <p id={id + '-verdict'} className="text-lg font-bold leading-snug text-amber-950"><span aria-hidden="true">⚠ </span>{verdict}</p>
    {lines.length ? <ul className="mt-2 list-none space-y-1 pl-0 text-[17px] font-medium">{lines.map((line, i) => <li key={i} className="break-words">{line}</li>)}</ul> : null}
    <p className="mt-2 text-[17px] font-bold">下のボタンを押すまで、何も変わりません。</p>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button ref={safeRef} type="button" onClick={onNo} className={cls(btn.base, btn.indigoOutline, 'w-full sm:w-auto')}>{noLabel}</button>
      <button type="button" onClick={onYes} className={cls(btn.base, 'min-h-14 w-full border-rose-700 bg-white text-lg text-rose-900 hover:bg-rose-50 sm:w-auto')}>{yesLabel}</button>
    </div>
  </div>;
}
