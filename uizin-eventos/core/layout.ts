/**
 * `/live/` を1画面に収めるための、文字の大きさの決め方（純関数）。
 *
 * この画面は3つの約束を同時に守る必要がある:
 *   1. 1画面に収まる（「次の試合へ」がいつでも押せる）
 *   2. 意気込みを省略しない（MCが読む文章なので、全文が要る）
 *   3. 顔が分かる大きさで写真が出る（誰の試合か一目で分かる）
 *
 * 高さは有限なので、意気込みが長い試合では3つが両立しなくなる。
 * これまでは「余った高さを写真が受け取る」作りだったため、
 * 意気込みが長いほど写真が痩せ、実測で切手サイズまで潰れていた。
 *
 * そこで、削るのは「文字の大きさ」にする。
 * 長い意気込みほど少しだけ小さく出すことで、全文を残したまま、
 * 写真の取り分を確保する。文字を小さくしても読めるが、
 * 顔が潰れると誰の試合か分からなくなる——優先順位はこの順。
 */

/** 意気込みの文字の大きさ（Tailwind のクラス）。長いほど小さくする */
export function commentSizeClass(length: number): string {
  if (length <= 40) return 'text-xl sm:text-2xl';
  if (length <= 80) return 'text-lg sm:text-xl';
  if (length <= 140) return 'text-base sm:text-lg';
  if (length <= 220) return 'text-sm sm:text-base';
  return 'text-xs sm:text-sm';
}

/**
 * 赤と青で同じ大きさにするための文字数。
 *
 * 左右で別々に決めると、片方だけ文字が大きい・写真が大きいという
 * 不揃いな画面になる（実測で起きた）。長い方に合わせて揃える。
 */
export function pairCommentLength(red: string, blue: string): number {
  return Math.max(String(red ?? '').length, String(blue ?? '').length);
}

/** 赤と青の意気込みから、両方に使う文字の大きさを決める */
export function pairCommentSizeClass(red: string, blue: string): string {
  return commentSizeClass(pairCommentLength(red, blue));
}

/**
 * 写真の枠の高さ（Tailwind のクラス）。赤青で同じ値を使う。
 *
 * 高さは有限なので、意気込みが長い試合では写真を少し譲る。
 * ただし「余った分をもらう」作りにはしない。それだと意気込みが長い側だけ
 * 写真が小さくなり、赤と青で大きさが揃わなくなる（実測で 160px 対 202px）。
 * 対戦カードは左右が同じ形でないと、一目で見比べられない。
 *
 * 下限は 160px。これ以上小さいと、誰の顔か分からなくなる。
 */
export function photoHeightClass(pairLength: number): string {
  // 値は実測で決めた。これより大きいと意気込みの見える量が減り、
  // 小さいと顔が分からなくなる。下限の 160px は必ず守る。
  //
  // 一度この値を vh（画面の高さに対する割合）にしたが、やめた。
  // 画面の低い端末で入場曲の行が隠れる問題は、写真の大きさではなく
  // 「曲名がスクロールする側に入っていた」ことが原因で、そちらを直したため。
  // vh にすると 900px の画面で 153px まで下がり、この下限を割ってしまう。
  if (pairLength <= 60) return 'h-[192px]';
  if (pairLength <= 140) return 'h-[176px]';
  return 'h-[160px]';
}

/** 赤と青の意気込みから、両方に使う写真の高さを決める */
export function pairPhotoHeightClass(red: string, blue: string): string {
  return photoHeightClass(pairCommentLength(red, blue));
}
