import type { CSSProperties, ReactNode } from 'react';

/*
  試合当日の画面（/private/live/）の「色と言葉の約束」の部品。通信はしません。
  黄=「👉 次はここ」（1つの状態に1つだけ。data-tos-next つき） / 薄い黄=「⚠ 気をつけて」 /
  赤=「✕ まちがい・失敗」 / 緑=「✓ できた」 / 灰の点線=「🔒 今は押せない＋理由」。
  色だけで伝えず、いつも記号と言葉を付ける。色の見た目は app/globals.css の .tos-* （@layer の外）が決める。
  globals の .tos-example などは 1rem（16px）なので、この画面の決まり「17px以上」に合わせて、ここで 1.0625rem に上げる。
*/

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

const BIG: CSSProperties = { fontSize: '1.0625rem' };
/** 札の言葉が2〜3行になっても、まるい楕円にならず、絵文字の横で文字が細くならないように、角の丸みを小さくし、横並び(inline-flex)をやめる */
const BADGE: CSSProperties = { fontSize: '1.0625rem', borderRadius: '14px', display: 'inline-block' };

/** 黄色い「👉 次はここ：〇〇」の札。ボタンの『中』には入れず、ボタンの外・直前に置く */
export function NextBadge({ children }: { children?: ReactNode }) {
  return <span className="tos-next-badge" style={BADGE}><span aria-hidden="true" className="tos-icon">👉</span>次はここ{children ? '：' : ''}{children}</span>;
}

/**
 * 黄色の枠。active のときだけ黄色の枠と札が付き、ほかのときは枠なしでそのまま中身を出す。
 * （中身のボタンは、枠が付いたり外れたりしても作り直されない＝押している途中のフォーカスが消えない）
 */
export function NextSlot({ active, label, className = '', style, row = false, children }: { active: boolean; label: ReactNode; className?: string; style?: CSSProperties; row?: boolean; children: ReactNode }) {
  // row = 広い画面（1024px〜）では、札をボタンの「左」に並べて、背を低くする（.live-next-row は page.tsx の PAGE_CSS。.tos-next の display:block は @layer の外なので、Tailwind の lg:flex では負ける）
  return <div className={active ? cx('tos-next', row && 'live-next-row', className) : cx('live-slot', className)} style={active ? style : undefined} data-tos-next={active ? '1' : undefined}>
    {active ? <p className={cx('m-0 mb-1', row && 'lg:mb-0 lg:max-w-[45%] lg:shrink-0')}><NextBadge>{label}</NextBadge></p> : null}
    {row ? <div className="min-w-0 lg:flex-1">{children}</div> : children}
  </div>;
}

/** 薄い黄の「⚠ 気をつけて：」。消えない注意（取り消せないことには使わない） */
export function Caution({ children, title = '気をつけて', className = '', id, role = 'note' }: { children: ReactNode; title?: string; className?: string; id?: string; role?: 'note' | 'status' }) {
  return <div id={id} role={role} className={cx('tos-caution text-[17px]', className)}>
    <span className="tos-caution-title"><span aria-hidden="true">⚠ </span>{title}：</span>{children}
  </div>;
}

/** 赤い「✕ まちがい／失敗」。まちがいの『すぐ下』に置く。文は『何がまちがいか』と『どうするか』 */
export function ErrorLine({ id, children, role, className = '' }: { id?: string; children: ReactNode; role?: 'alert' | 'status'; className?: string }) {
  return <p id={id} role={role} className={cx('tos-error m-0 text-[17px]', className)}><span aria-hidden="true">✕ </span>{children}</p>;
}

/** 緑の「✓ できた」。画面に role="status" は1つだけにしたいので、role は付けない（読み上げが要るものだけ自分で付ける） */
export function OkLine({ children, className = '', id, role }: { children: ReactNode; className?: string; id?: string; role?: 'status' }) {
  return <p id={id} role={role} className={cx('tos-ok m-0 text-[17px]', className)}><span aria-hidden="true">✓ </span>{children}</p>;
}

/** 灰の「🔒 理由」。押せないボタンの『すぐ下』に、いつも出す */
export function LockReason({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cx('tos-locked-reason m-0', className)} style={BIG}><span aria-hidden="true">🔒 </span>{children}</p>;
}

/** 灰色の小さな説明（色は付けない。17px） */
export function Hint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 text-[17px] font-bold leading-snug text-slate-700', className)}>{children}</p>;
}

/** 入力欄の横の『例：』の行 */
export function Example({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return <p id={id} className={cx('tos-example m-0', className)} style={BIG}>例：{children}</p>;
}
