'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/*
  準備の画面（/private/）の「色と言葉の約束」の部品。通信はしません。
  黄=「👉 次はここ」（1画面に1つだけ。data-tos-next つき）/ 薄い黄=「⚠ 気をつけて」 / 赤=「✕ まちがい・取り消せない」/
  緑=「✓ できた」 / 灰の点線=「🔒 今は押せない＋理由」。色だけで伝えず、いつも記号と言葉を付ける。
  色の見た目は app/globals.css の .tos-* クラス（@layer の外）が決める。
*/

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

/** 文字を17px以上に保つ（globals の .tos-example などは 1rem なので、ここで上書きする） */
const BIG: { fontSize: string } = { fontSize: '1.0625rem' };

/** 黄色い「👉 次はここ：〇〇」の札。ボタンの『中』には入れず、ボタンの外・直前に置く */
export function NextBadge({ children, tight = false }: { children?: ReactNode; tight?: boolean }) {
  return <span className="tos-next-badge" style={tight ? { ...BIG, padding: '0 8px' } : BIG}><span aria-hidden="true">👉</span> 次はここ{children ? '：' : ''}{children}</span>;
}

/**
 * 黄色の枠。active のときだけ黄色の枠と札が付き、ほかのときは枠なしでそのまま中身を出す。
 * （中身の入力欄・ボタンは、枠が付いたり外れたりしても作り直されない＝入力中のカーソルが消えない）
 */
export function NextSlot({ active, label, className = '', children, id, style, tight = false, row = false }: { active: boolean; label: ReactNode; className?: string; children: ReactNode; id?: string; style?: CSSProperties; tight?: boolean; row?: boolean }) {
  // row: 札とボタンを同じ行に並べる（入りきらないときだけ、折り返す）。帯の中で高さをおさえるときに使う
  // .tos-next は display:block（@layer の外）なので、横に並べるときは style で flex にする
  const rowStyle: CSSProperties | undefined = row ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4px', rowGap: '4px' } : undefined;
  return <div id={id} className={active ? cx('tos-next', className) : 'contents'} style={active ? { ...rowStyle, ...style } : undefined} data-tos-next={active ? '1' : undefined}>
    {active ? <p className={row ? '' : tight ? 'mb-1' : 'mb-2'}><NextBadge tight={tight}>{label}</NextBadge></p> : null}
    {children}
  </div>;
}

/** 薄い黄の「⚠ 気をつけて：」。消えない注意（取り消せないことには使わない） */
export function Caution({ children, title = '気をつけて', className = '', id, role = 'note' }: { children: ReactNode; title?: string; className?: string; id?: string; role?: 'note' | 'status' }) {
  return <div id={id} role={role} className={cx('tos-caution', className)}>
    <span className="tos-caution-title"><span aria-hidden="true">⚠ </span>{title}：</span>{children}
  </div>;
}

/** 赤い「✕ まちがい／失敗」。まちがいの『すぐ下』に置く。文は『何がまちがいか』と『どうするか』 */
export function ErrorLine({ id, children, role = 'alert', className = '' }: { id?: string; children: ReactNode; role?: 'alert' | 'status' | null; className?: string }) {
  return <p id={id} role={role ?? undefined} tabIndex={-1} className={cx('tos-error  focus:outline-none', className)}><span aria-hidden="true">✕ </span>{children}</p>;
}

/** 緑の「✓ できた／保存した」 */
export function OkLine({ children, className = '', id, quiet = false }: { children: ReactNode; className?: string; id?: string; quiet?: boolean }) {
  return <p id={id} role={quiet ? undefined : 'status'} className={cx('tos-ok', className)}><span aria-hidden="true">✓ </span>{children}</p>;
}

/** 灰の「🔒 理由」。押せないボタンの『すぐ下』に、いつも出す */
export function LockReason({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return <p id={id} className={cx('tos-locked-reason', className)} style={BIG}><span aria-hidden="true">🔒 </span>{children}</p>;
}

/** 入力欄の横の『例：』の行 */
export function Example({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return <p id={id} className={cx('tos-example', className)} style={BIG}>例：{children}</p>;
}

/** 灰色の小さな説明（色は付けない） */
export function Soft({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <p id={id} className={cx('text-slate-700', className)} style={BIG}>{children}</p>;
}

/** 手順の番号札（灰の丸。黄色は使わない） */
export function StepNo({ n }: { n: number }) {
  return <span aria-hidden="true" className="mr-2 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-slate-500 bg-slate-100 text-[17px] font-bold text-slate-900">{n}</span>;
}

/**
 * 画面の中の確認の箱（window.confirm の代わり）。role="alertdialog"。
 * 1行目＝「✕ 取り消せない：」＋何がどう変わるか。消えるものは赤い太字で1行ずつ。
 * ボタンは2つだけ: 左（大きい・黒い枠）が安全な「やめる」＝最初にフォーカス・Escも同じ。右が赤い枠の危ないほう。
 */
export function DangerConfirm({ id, label, verdict, lines = [], safeLabel, dangerLabel, onYes, onNo, head = '取り消せない', note, children, tone = 'danger' }: {
  id: string; label: string; verdict: string; lines?: string[]; safeLabel: string; dangerLabel: string; onYes: () => void; onNo: () => void;
  head?: string; note?: string; children?: ReactNode; tone?: 'danger' | 'plain';
}) {
  const safeRef = useRef<HTMLButtonElement | null>(null);
  const noRef = useRef(onNo);
  noRef.current = onNo;
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 開いたら「やめる」にフォーカス。箱ぜんたいが、上のナビと下の帯に隠れずに見えるようにする（低い画面では質問の文から見せる）
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
  return <div ref={boxRef} id={id} role="alertdialog" aria-label={label} aria-describedby={id + '-verdict'} style={tone === 'plain' ? { borderColor: '#a16207' } : undefined} className="tos-confirm mt-3 w-full min-w-0 scroll-mt-28 text-[1.0625rem] text-slate-950">
    <p id={id + '-verdict'} className="font-bold leading-snug">
      {tone === 'danger' ? <span className="tos-danger"><span aria-hidden="true">✕ </span>{head}：{verdict}</span> : <><span className="font-extrabold"><span aria-hidden="true">⚠ </span>{head}：</span>{verdict}</>}
    </p>
    {lines.length ? <ul className="mt-2 list-none space-y-1 pl-0 font-medium">{lines.map((line, i) => <li key={i} className={cx('break-words', tone === 'danger' && 'tos-danger')}>{line}</li>)}</ul> : null}
    {children}
    <p className="mb-0 mt-2 font-bold">{note ?? '下のボタンを押すまで、何も変わりません。'}</p>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
      <button ref={safeRef} type="button" onClick={onNo} className="tos-safe-btn inline-flex w-full items-center justify-center text-center text-lg touch-manipulation sm:w-auto sm:min-w-[14rem]">{safeLabel}</button>
      <button type="button" onClick={onYes} className="tos-danger-btn inline-flex w-full items-center justify-center text-center text-lg touch-manipulation [overflow-wrap:anywhere] sm:w-auto">{dangerLabel}</button>
    </div>
  </div>;
}
