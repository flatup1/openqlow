// 使い方: node render.mjs [preview]  → 連番画像を一時フォルダに書き出し、ffmpegでMP4にする
// 環境変数: PW=playwrightのパス / FFMPEG=ffmpegのパス / FRAMES_DIR=連番画像の置き場（既定: OSの一時フォルダ）
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const FPS = 30, preview = process.argv[2] === 'preview';
const out = (process.env.FRAMES_DIR || path.join(os.tmpdir(), 'uizin-rule-short-v1-frames')) + '/';
fs.mkdirSync(out, { recursive: true }); // 同じ名前で上書きするので、消さずに使い回す
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(new URL('./index.html', import.meta.url).href);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
const total = await p.evaluate(() => window.TOTAL);
const times = preview ? [3.2, 7.4, 11, 15.4, 20.4, 24.8, 29.4, 34.2, 38.6, 43.2, 47.8, 51.2, 55.6]
  : Array.from({ length: Math.ceil(total * FPS) }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await p.evaluate(t => window.seek(t), t);
  await p.screenshot({ path: `${out}${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
}
await b.close();
console.log('total', total, 'frames', times.length);
if (!preview) {
  const ff = process.env.FFMPEG || 'ffmpeg';
  execFileSync(ff, ['-y', '-framerate', String(FPS), '-i', `${out}%05d.jpg`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-frames:v', String(times.length), '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-c:a', 'aac', '-movflags', '+faststart',
    new URL('./uizin-2026-rule-short.mp4', import.meta.url).pathname], { stdio: 'inherit' });
}
