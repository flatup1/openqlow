import type { GenerationParams } from '../types/animation';

/** キャラクター一貫性の固定文(常に付与)。 */
export const CONSISTENCY_NOTE =
  '顔・髪型・ポニーテール・髪色・肌色・体格・グローブ・衣装・色をリファレンス画像と同じに保つ。';

/** ユーザー入力から最終的な指示文を組み立てる(表示・確認用)。 */
export function buildPrompt(params: Pick<GenerationParams, 'prompt'>): string {
  const base = params.prompt.trim();
  if (!base) return '';
  return `${base} ${CONSISTENCY_NOTE}`;
}

export function countChars(text: string): number {
  return [...text].length;
}
