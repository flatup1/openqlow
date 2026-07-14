export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_BYTES = 10 * 1024 * 1024;

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

/** アップロード前にブラウザ側でも画像を検証する(サーバーでも再検証する)。 */
export function validateImageFile(file: File): ValidationResult {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, message: 'PNG・JPG・WEBP形式の画像を選んでください。' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: '画像のサイズが大きすぎます。10MB以下の画像を選んでください。' };
  }
  if (file.size === 0) {
    return { ok: false, message: '空のファイルです。別の画像を選んでください。' };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
