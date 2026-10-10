// 使い方:
//   node render.mjs preview   … 各シーンの静止画だけ書き出す（確認用）
//   node render.mjs preview 1.2,4.5 … 指定した秒の静止画だけ書き出す
//   node render.mjs           … 全フレームを書き出して MP4 にする
// 環境変数: PW=playwrightのパス / FFMPEG=ffmpegのパス / FRAMES_DIR=連番画像の置き場（既定: OSの一時フォルダ）
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');

const FPS = 30;
const preview = process.argv[2] === 'preview';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.env.FRAMES_DIR || path.join(os.tmpdir(), 'uizin-rule-short-v2-frames');
fs.mkdirSync(out, { recursive: true }); // 同じ名前で上書きするので、消さずに使い回す

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + path.join(here, 'index.html'));
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
const { total, spans } = await p.evaluate(() => ({ total: window.TOTAL, spans: window.SPANS }));
const times = preview
  ? (process.argv[3] ? process.argv[3].split(',').map(Number) : spans.map(([, e]) => e - 0.35))
  : Array.from({ length: Math.round(total * FPS) }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await p.evaluate(t => window.seek(t), t);
  await p.screenshot({ path: path.join(out, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
}
await b.close();
console.log('total', total, 'frames', times.length, 'dir', out);

if (!preview) {
  const ff = process.env.FFMPEG || 'ffmpeg';
  execFileSync(ff, ['-y', '-framerate', String(FPS), '-i', path.join(out, '%05d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-frames:v', String(times.length), '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-c:a', 'aac', '-movflags', '+faststart',
    path.join(here, '..', 'uizin-2026-rule-short-v2.mp4')], { stdio: 'inherit' });
}
