/**
 * 選手写真のURLを、画面にそのまま出せる形に直す（純関数）。
 *
 * 現場で実際に貼られるのは、ほぼ Google ドライブの「共有リンク」です。
 * ところがあの形式は <img> で表示できません。開くとHTMLのページが返るからです。
 * そのまま入れると「写真だけ出ない」という、当日いちばん分かりにくい壊れ方になります。
 *
 * だから取り込みのときに、表示できる形へ機械的に直します。
 * 直せなかったものは空にして、写真なしで進みます（大会は止めない）。
 */

/** ドライブのファイルIDらしき文字列 */
const DRIVE_ID = /[-\w]{25,}/;

/** 画像として直接読める拡張子 */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i;

/** EventOS の Worker が配る写真（拡張子が無い）。例: https://…workers.dev/api/photos/UZ23-XXXX */
const WORKER_PHOTO = /^https:\/\/[^/]+\/api\/photos\/[^/?#]+$/;

/** セルの中から最初のURLを取り出す（曲URLと同じ考え方。文章が混ざっていても拾う） */
export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s"'<>（）「」『』【】]+/);
  if (!m) return '';
  return m[0].replace(/[.,;:)\]}>。、）］｝]+$/, '');
}

/**
 * Google ドライブの共有リンクからファイルIDを取り出す。
 * 対応する形:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?id=<ID>&export=download
 *   https://docs.google.com/document/d/<ID>/...
 */
export function driveFileId(url: string): string {
  if (!/(?:drive|docs)\.google\.com/i.test(url)) return '';
  const byPath = url.match(/\/d\/([-\w]{25,})/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([-\w]{25,})/);
  if (byQuery) return byQuery[1];
  const loose = url.match(DRIVE_ID);
  return loose ? loose[0] : '';
}

/**
 * 画面に出せるURLに直す。出せないと判断したら空文字を返す。
 *
 * @param raw シートのセルの中身（URL以外の文字が混ざっていてもよい）
 * @param width 取り出す画像の横幅の目安。大型モニター用に既定を大きめにする
 */
export function normalizePhotoUrl(raw: string, width = 1200): string {
  const url = extractUrl(String(raw ?? ''));
  if (url === '') return '';

  const id = driveFileId(url);
  if (id !== '') {
    // ドライブは thumbnail 形式だけが <img> で直接読める。
    // 共有設定が「リンクを知っている全員」でないと出ないので、出なければ写真なしで進む。
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + width;
  }

  // EventOS の Worker 自身が配る写真は、拡張子を持たない（/api/photos/<受付番号>）。
  // ここで弾くと、せっかく自前で配っている写真が1枚も出なくなる。
  // 2026-09-21 に実測: content-type は image/jpeg で、<img> にそのまま入れて表示できる。
  if (WORKER_PHOTO.test(url)) return url;

  // 拡張子が画像ならそのまま使う
  if (IMAGE_EXT.test(url)) return url;

  // それ以外（SNSの投稿ページなど）は、画像として読めないので使わない
  return '';
}

/** 「写真なし」と書いてある（入場曲の「なし」と同じ扱いにする） */
const NO_PHOTO = /^(なし|無し|無|指定なし|特になし|不要|写真なし|none|-|ー|—|–)$/i;

/** 写真として使える見込みがあるか（音源チェックと同じ考え方で、前日に気づけるようにする） */
export function photoStatus(raw: string): 'none' | 'ok' | 'unusable' {
  const text = String(raw ?? '').trim();
  if (text === '') return 'none';
  if (NO_PHOTO.test(text)) return 'none';
  return normalizePhotoUrl(text) === '' ? 'unusable' : 'ok';
}
