// カメラが「映っているか」を、OBS の小さなスクリーンショット（BMP）で判定する。純ロジック。
//  - 取れない / 真っ黒（全面ゼロ）が続く → 映っていない
//  - 前回とまったく同じ絵が一定時間続く → 止まっている（固まった）
// 生きているカメラは、静かな場面でもセンサーの揺らぎで少しずつ絵が変わる（REFERENCES.md カメラ）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §6.2

export const DEFAULTS = { deadSamples: 2, frozenMs: 10_000, diffThreshold: 0.01, darkMean: 3, darkMax: 10 };

// "data:image/bmp;base64,..." または base64 文字列から、明るさ（0〜255）の配列を取り出す。
export function decodeBmpLuma(data) {
  const base64 = String(data ?? "").replace(/^data:[^,]*,/, "");
  const buf = Buffer.from(base64, "base64");
  if (buf.length < 54 || buf.toString("ascii", 0, 2) !== "BM") throw new Error("BMPではありません");
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (width <= 0 || rawHeight === 0 || (bpp !== 24 && bpp !== 32)) throw new Error("対応していないBMPです");
  const height = Math.abs(rawHeight);
  const bytes = bpp / 8;
  const stride = Math.ceil((bpp * width) / 32) * 4;
  if (offset + stride * height > buf.length) throw new Error("BMPが途中で切れています");
  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = offset + stride * y;
    for (let x = 0; x < width; x += 1) {
      const p = row + x * bytes;
      const b = buf[p];
      const g = buf[p + 1];
      const r = buf[p + 2];
      luma[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return { width, height, luma };
}

export function isDark(frame, options = DEFAULTS) {
  let sum = 0;
  let max = 0;
  for (const value of frame.luma) {
    sum += value;
    if (value > max) max = value;
  }
  return sum / frame.luma.length < options.darkMean && max < options.darkMax;
}

export function meanDiff(a, b) {
  if (!a || !b || a.luma.length !== b.luma.length) return Infinity;
  let total = 0;
  for (let index = 0; index < a.luma.length; index += 1) total += Math.abs(a.luma[index] - b.luma[index]);
  return total / a.luma.length;
}

export function initialTrack() {
  return { status: "unknown", checkedAt: null, message: "未確認", frame: null, failCount: 0, darkCount: 0, unchangedSince: null };
}

// sample: { ok: true, data } | { ok: false, error }
export function nextTrack(track, sample, nowMs, options = DEFAULTS) {
  // 映像を確かめたら「部品が無い（missing）」の印は外す（あとで部品が見つかった場合）。
  const t = { ...track, kind: null, checkedAt: nowMs };
  if (!sample.ok) {
    t.failCount += 1;
    t.darkCount = 0;
    t.frame = null;
    t.unchangedSince = null;
    if (t.failCount >= options.deadSamples) return { ...t, status: "error", message: "映像が取れません" };
    // 1回目の失敗では「確かめた時刻」を進めない（古くなれば自然に「未確認」になる）。
    return { ...t, checkedAt: track.checkedAt, status: track.status === "ok" ? "ok" : "unknown", message: "確認中" };
  }
  let frame;
  try {
    frame = decodeBmpLuma(sample.data);
  } catch (error) {
    return nextTrack(track, { ok: false, error: error.message }, nowMs, options);
  }
  t.failCount = 0;
  if (isDark(frame, options)) {
    t.darkCount += 1;
    t.frame = frame;
    t.unchangedSince = null;
    if (t.darkCount >= options.deadSamples) return { ...t, status: "error", message: "真っ黒です（映像が来ていません）" };
    return { ...t, status: track.status === "ok" ? "ok" : "unknown", message: "確認中" };
  }
  t.darkCount = 0;
  const diff = meanDiff(track.frame, frame);
  t.frame = frame;
  if (diff < options.diffThreshold) {
    t.unchangedSince = track.unchangedSince ?? nowMs;
    if (nowMs - t.unchangedSince >= options.frozenMs) return { ...t, status: "error", message: "映像が止まっています" };
    return { ...t, status: "ok", message: "" };
  }
  t.unchangedSince = null;
  return { ...t, status: "ok", message: "" };
}

// テストと練習用：指定の大きさの BMP（24bit）を作る。fill(x, y) は [r, g, b] を返す。
export function makeBmp(width, height, fill) {
  const stride = Math.ceil((24 * width) / 32) * 4;
  const size = 54 + stride * height;
  const buf = Buffer.alloc(size);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(size, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fill(x, y);
      const p = 54 + stride * y + x * 3;
      buf[p] = b;
      buf[p + 1] = g;
      buf[p + 2] = r;
    }
  }
  return `data:image/bmp;base64,${buf.toString("base64")}`;
}
