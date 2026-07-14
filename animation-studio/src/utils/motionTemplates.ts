export interface MotionTemplate {
  id: string;
  label: string;
  prompt: string;
}

/** 初心者でも選ぶだけで動画を作れる動作テンプレート。 */
export const MOTION_TEMPLATES: MotionTemplate[] = [
  { id: 'guard', label: '基本ガード', prompt: 'ガードの構えで、呼吸に合わせて自然に上下する。' },
  { id: 'jab-cross', label: '左右パンチ', prompt: 'ガードから左ジャブ、右ストレートを打ってガードへ戻る。' },
  { id: 'one-two', label: 'ジャブ→ストレート', prompt: 'ジャブからストレートへつなげる。動きは滑らかに。' },
  { id: 'one-two-hook', label: 'ジャブ→ストレート→フック', prompt: 'ジャブ、ストレート、左フックの3連コンビネーション。' },
  { id: 'punch-midkick', label: 'パンチ→ミドルキック', prompt: 'パンチから右ミドルキックへつなげる。' },
  { id: 'punch-knee', label: 'パンチ→膝蹴り', prompt: 'パンチから左の膝蹴りへつなげる。' },
  { id: 'combo-rush', label: '左右連打', prompt: '左右のパンチを素早く連打する。可愛く元気に。' },
  { id: 'kick-combo', label: 'キックコンビネーション', prompt: 'ミドルキックからローキックへつなげるキックの連携。' },
  { id: 'victory', label: '勝利ポーズ', prompt: '両手を上げて嬉しそうに勝利のポーズをする。' },
  { id: 'wave', label: '手を振る', prompt: 'グローブをつけた手で元気に手を振る。笑顔で。' },
  { id: 'jump', label: '可愛くジャンプ', prompt: '嬉しそうにその場で軽くジャンプする。' },
  { id: 'beginner', label: '初心者が練習する', prompt: '少し緊張しながらも、はじめてのパンチをやさしく練習する。' },
];

export function findTemplate(id: string | undefined): MotionTemplate | undefined {
  return MOTION_TEMPLATES.find((t) => t.id === id);
}
