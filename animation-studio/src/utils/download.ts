/** 保存ファイル名を作る: flatup-animation-YYYYMMDD-HHMMSS.mp4 */
export function buildDownloadFilename(createdAt: string | Date = new Date()): string {
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `flatup-animation-${date}-${time}.mp4`;
}

/** Blob をダウンロードさせる(URLは呼び出し側で解放するか、ここで解放)。 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
