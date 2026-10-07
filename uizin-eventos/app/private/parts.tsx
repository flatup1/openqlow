'use client';

import type { ReactNode } from 'react';

/* 準備の画面（/private/）の共通部品。色の意味は全画面で同じ:
   indigo=次にやる1つ / emerald=できた・保存 / amber=足りない・注意 / 灰=ほか・消す / rose=赤コーナーと本当のエラー / blue=青コーナー */

export const btn = {
  base: 'inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 text-center font-bold [overflow-wrap:anywhere] touch-manipulation focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 aria-disabled:cursor-not-allowed aria-disabled:border-slate-400 aria-disabled:bg-slate-200 aria-disabled:text-slate-700 ',
  primary: 'min-h-14 border-indigo-700 bg-indigo-700 text-xl text-white hover:bg-indigo-800 ',
  success: 'min-h-14 border-emerald-700 bg-emerald-700 text-xl text-white hover:bg-emerald-800 ',
  outline: 'min-h-12 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  outlineBig: 'min-h-14 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  indigoOutline: 'min-h-14 border-indigo-700 bg-white text-lg text-indigo-800 hover:bg-indigo-50 ',
};
export const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const inputClass = 'mt-1 block min-h-14 w-full min-w-0 rounded-xl border-2 border-slate-500 bg-white px-3 py-2 text-lg font-medium text-slate-950 placeholder:text-slate-500 focus:border-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 aria-[invalid=true]:border-amber-600 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-amber-200';

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
  return <span className={cls('inline-flex min-h-8 items-center rounded-full border-2 px-3 text-base font-bold leading-tight', toneClass[tone], className)}>{children}</span>;
}

/** できた ✓ / まだ の小さな札（各セクションの見出しの横に出す） */
export function DoneChip({ done }: { done: boolean }) {
  return done ? <Chip tone="green">できた ✓</Chip> : <Chip tone="slate">まだ</Chip>;
}

/** 必須 / なくてもOK の札。ラベルの文字には混ぜない（ラベルの名前を変えないため） */
export function Badge({ required }: { required?: boolean }) {
  return required
    ? <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 text-base font-bold text-amber-950">必須</span>
    : <span className="ml-2 inline-flex items-center rounded-md bg-slate-200 px-2 text-base font-bold text-slate-800">なくてもOK</span>;
}

/** 知らせ。いつも role="status"。ok は少したつと消え、error は残る */
export function Notice({ kind, children, onClose, action, className = '' }: { kind: 'ok' | 'error' | 'info' | 'warn'; children: ReactNode; onClose?: () => void; action?: { label: string; onClick: () => void }; className?: string }) {
  const tone = kind === 'ok' ? toneClass.green : kind === 'error' ? toneClass.rose : kind === 'warn' ? toneClass.amber : toneClass.slate;
  const icon = kind === 'ok' ? '✓' : kind === 'error' ? '!' : kind === 'warn' ? '⚠' : 'i';
  const iconTone = kind === 'ok' ? 'bg-emerald-700' : kind === 'error' ? 'bg-rose-600' : kind === 'warn' ? 'bg-amber-600' : 'bg-slate-600';
  return <div role="status" className={cls('flex min-w-0 items-start gap-3 rounded-xl border-2 p-3 text-base font-bold leading-relaxed shadow-sm sm:text-lg', tone, className)}>
    <span aria-hidden="true" className={cls('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-base text-white', iconTone)}>{icon}</span>
    <div className="min-w-0 flex-1 break-words">{children}</div>
    {action ? <button type="button" onClick={action.onClick} className={cls(btn.base, btn.outline, 'shrink-0 px-3')}>{action.label}</button> : null}
    {onClose ? <button type="button" onClick={onClose} className={cls(btn.base, btn.outline, 'shrink-0 px-3')}>✕ とじる</button> : null}
  </div>;
}

/** 折りたたみ。見出し行は48px以上、開閉の文字つき。中身は消さずにしまう */
export function Fold({ title, children, open, onToggle, className = '', summaryClass = '', id }: { title: ReactNode; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; className?: string; summaryClass?: string; id?: string }) {
  return <details id={id} open={open} onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined} className={cls('group rounded-xl border-2 border-slate-300 bg-white', className)}>
    <summary className={cls('flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-bold [&::-webkit-details-marker]:hidden', summaryClass)}>
      <span className="min-w-0 flex-1 text-balance [overflow-wrap:anywhere]">{title}</span>
      <span aria-hidden="true" className="shrink-0 text-base font-bold text-indigo-800"><span className="group-open:hidden">▶ ひらく</span><span className="hidden group-open:inline">▼ とじる</span></span>
    </summary>
    <div className="border-t-2 border-slate-200 p-4">{children}</div>
  </details>;
}

export function Section({ id, title, done, children }: { id: string; title: string; done: boolean; children: ReactNode }) {
  return <section id={id} tabIndex={-1} className="scroll-mt-28 focus:outline-none rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center gap-3"><h2 className="min-w-0 text-balance text-2xl font-bold [overflow-wrap:anywhere]">{title}</h2><DoneChip done={done} /></div>
    <div className="mt-4 space-y-5">{children}</div>
  </section>;
}
