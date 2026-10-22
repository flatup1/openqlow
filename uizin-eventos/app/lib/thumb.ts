'use client';

/**
 * 顔写真を、一覧表に載せる小さい大きさにする（印刷のPDFが重くならないように）。
 * 外へは何も送らない（ブラウザの中の canvas だけ）。作れなかったときは、元の写真をそのまま返す（止まらない）。
 */
export function makeThumb(dataUrl: string, max = 360): Promise<string> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: string) => { if (!done) { done = true; resolve(value); } };
    // 読み込みが終わらない写真でも、画面が止まらないように（4秒で元の写真にする）
    const timer = window.setTimeout(() => finish(dataUrl), 4000);
    try {
      const image = new Image();
      image.onload = () => {
        window.clearTimeout(timer);
        try {
          const w0 = image.naturalWidth, h0 = image.naturalHeight;
          if (!w0 || !h0) { finish(dataUrl); return; }
          const scale = Math.min(1, max / Math.max(w0, h0));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w0 * scale)); canvas.height = Math.max(1, Math.round(h0 * scale));
          const context = canvas.getContext('2d');
          if (!context) { finish(dataUrl); return; }
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const small = canvas.toDataURL('image/jpeg', 0.82);
          finish(/^data:image\/jpeg;base64,/.test(small) && small.length < dataUrl.length ? small : dataUrl);
        } catch { finish(dataUrl); }
      };
      image.onerror = () => { window.clearTimeout(timer); finish(dataUrl); };
      image.src = dataUrl;
    } catch { window.clearTimeout(timer); finish(dataUrl); }
  });
}
