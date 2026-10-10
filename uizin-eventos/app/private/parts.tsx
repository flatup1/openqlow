'use client';

import { type ReactNode } from 'react';
import { DangerConfirm } from './marks.tsx';

/* 準備の画面（/private/）の共通部品。色の意味は全画面で同じ（色だけにせず、いつも記号と言葉を付ける）:
   黄の濃い塗り=👉次はここ（marks.tsx） / 薄い黄=⚠気をつけて / 赤=✕まちがい・取り消せない / 緑=✓できた・保存 / 灰の点線=🔒今は押せない / indigoの塗り=ふつうの主ボタン（1つだけ）/ 赤コーナー(rose)・青コーナー(blue)は今まで通り */

export const btn = {
  base: 'inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 text-center font-bold [overflow-wrap:anywhere] touch-manipulation focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-slate-600 aria-disabled:bg-slate-100 aria-disabled:text-slate-700 ',
  primary: 'min-h-14 border-indigo-700 bg-indigo-700 text-xl text-white hover:bg-indigo-800 ',
  success: 'min-h-14 border-emerald-700 bg-emerald-700 text-xl text-white hover:bg-emerald-800 ',
  outline: 'min-h-12 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  outlineBig: 'min-h-14 border-slate-500 bg-white text-lg text-slate-900 hover:bg-slate-100 ',
  indigoOutline: 'min-h-14 border-indigo-700 bg-white text-lg text-indigo-800 hover:bg-indigo-50 ',
};
export const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const inputClass = 'mt-1 block min-h-14 w-full min-w-0 rounded-xl border-2 border-slate-500 bg-white px-3 py-2 text-lg font-medium text-slate-950 placeholder:text-slate-500 focus:border-indigo-700 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';

type Tone = 'green' | 'amber' | 'slate' | 'rose' | 'blue' | 'indigo';
const toneClass: Record<Tone, string> = {
  green: 'border-[#166534] bg-[#f0fdf4] text-[#166534]',
  amber: 'border-[#a16207] bg-[#fefce8] text-[#1c1917]',
  slate: 'border-slate-400 bg-slate-100 text-slate-900',
  rose: 'border-[#b91c1c] bg-[#fef2f2] text-[#991b1b]',
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

/** 必須（赤い札）/ なくてもOK（灰の札）。ラベルの文字には混ぜない（ラベルの名前を変えないため） */
export function Badge({ required, text }: { required?: boolean; text?: string }) {
  return required
    ? <span className="ml-2 inline-flex items-center rounded-md border-2 border-indigo-700 bg-indigo-50 px-2 text-[17px] font-bold text-indigo-900">必須</span>
    : <span className="ml-2 inline-flex items-center rounded-md bg-slate-200 px-2 text-[17px] font-bold text-slate-800">{text ?? 'なくてもOK'}</span>;
}

/**
 * 知らせ。いつも role="status"（テストと読み上げの両方のため）。error だけ aria-live を強くする。
 * 色と言葉: ok=緑「✓」/ error=赤「✕」/ warn=薄い黄「⚠ 気をつけて：」/ info=白に灰の枠。
 * live="off": 同じ内容を別の場所が読み上げるとき（読み上げが2回にならないように）
 * ボタンは文の下の行に出す。ok は少したつと消え（保存の結果は次の保存まで残る）、error は残る
 * extra: 結果の2行目（例: 保存した＋まだ直す所）。別の箱で、すぐ下に出す
 */
export type NoticeExtra = { kind: 'ok' | 'warn' | 'error' | 'info'; text: ReactNode; action?: { label: string; ariaLabel?: string; onClick: () => void } };
export function Notice({ kind, children, onClose, action, className = '', compact = false, inlineClose = false, live, extra, lead: leadNode }: { kind: 'ok' | 'error' | 'info' | 'warn'; children: ReactNode; onClose?: () => void; action?: { label: string; onClick: () => void; id?: string }; className?: string; compact?: boolean; inlineClose?: boolean; live?: 'off' | 'polite' | 'assertive'; extra?: NoticeExtra[]; lead?: ReactNode }) {
  const tone = kind === 'ok' ? 'tos-ok' : kind === 'error' ? 'tos-error' : kind === 'warn' ? 'tos-caution' : 'rounded-xl border-2 border-slate-400 bg-white text-slate-900';
  const lead = kind === 'ok' ? '✓ ' : kind === 'error' ? '✕ ' : kind === 'warn' ? '⚠ 気をつけて：' : 'i ';
  // compact: 下の帯の中で使う。画面の高さを取りすぎないよう、余白と行の高さを小さくする（内側のスクロールは使わない）
  const squeeze = compact ? { padding: '6px 10px', lineHeight: 1.35 } : undefined;
  const flow = { ...squeeze, display: 'flow-root' } as const;
  const main = <div role="status" aria-live={live ?? (kind === 'error' ? 'assertive' : 'polite')} style={flow} className={cls('min-w-0 text-[17px] font-bold shadow-sm', kind === 'info' ? (compact ? 'p-2' : 'p-3') : '', tone, className)}>
    <div className="min-w-0 break-words">
      {/* inlineClose: 「✕ とじる」を文の右はしに小さく置く（下の帯の高さをおさえるため）。字は2行で、ことばも見える */}
      {inlineClose && onClose ? <button type="button" aria-label="✕ とじる" onClick={onClose} className={cls(btn.base, btn.outline, 'float-right ml-2 w-[4.5rem] flex-col gap-0 whitespace-nowrap px-1 leading-tight')}><span aria-hidden="true">✕</span><span aria-hidden="true" className="text-[17px]">とじる</span></button> : null}
      <span aria-hidden="true" className={kind === 'warn' ? 'font-extrabold' : ''}>{lead}</span>{leadNode}{children}
    </div>
    {action || (onClose && !inlineClose) ? <div className="mt-2 flex w-full flex-wrap gap-2">
      {action ? <button type="button" id={action.id} onClick={action.onClick} className={cls(btn.base, btn.outline, compact ? 'px-2' : 'px-3')}>{action.label}</button> : null}
      {onClose && !inlineClose ? <button type="button" onClick={onClose} className={cls(btn.base, btn.outline, compact ? 'px-2' : 'px-3')}>✕ とじる</button> : null}
    </div> : null}
  </div>;
  if (!extra?.length) return main;
  return <div className="min-w-0 space-y-1">
    {main}
    {extra.map((line, i) => <p key={i} role="note" style={squeeze} className={cls('min-w-0 break-words text-[17px] font-bold', line.kind === 'ok' ? 'tos-ok' : line.kind === 'warn' ? 'tos-caution' : line.kind === 'error' ? 'tos-error' : 'rounded-xl border-2 border-slate-400 bg-white p-2')}>
      <span aria-hidden="true">{line.kind === 'ok' ? '✓ ' : line.kind === 'error' ? '✕ ' : line.kind === 'warn' ? '⚠ 気をつけて：' : 'i '}</span>{line.text}
      {line.action ? <button type="button" aria-label={line.action.ariaLabel} onClick={line.action.onClick} className={cls(btn.base, btn.outline, 'ml-2 mt-1 px-3')}>{line.action.label}</button> : null}
    </p>)}
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
 * 1行目＝「✕ 取り消せない：」＋結論（何がどう変わるか）。ボタンは2つだけ。さいしょにフォーカスが乗るのは「安全なほう」（やめる）。
 * Escape で「やめる」。まわりの画面はふつうに使えるが、あぶないほうは「yesLabel」のボタンを押したときだけ。
 */
export function ConfirmBox({ id, label, verdict, lines, yesLabel, noLabel, onYes, onNo }: { id: string; label: string; verdict: string; lines: string[]; yesLabel: string; noLabel: string; onYes: () => void; onNo: () => void }) {
  return <DangerConfirm id={id} label={label} verdict={verdict} lines={lines} safeLabel={noLabel} dangerLabel={yesLabel} onYes={onYes} onNo={onNo} />;
}
