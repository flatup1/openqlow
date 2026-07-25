// render.mjs — index.html を撮影して MP4 にする(このフォルダ専用・外部依存なし)
// 使い方: node render.mjs --cut=main|60|30|15 [--vertical] [--out=file.mp4]
import playwrightPkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = playwrightPkg;
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

const arg = (k, d) => {
  const a = process.argv.find(x => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
const CUT = arg('cut', 'main');
const VERTICAL = process.argv.includes('--vertical');
const W = VERTICAL ? 1080 : 1280;
const H = VERTICAL ? 1920 : 720;
const OUT = arg('out', `chikara_${CUT}_${VERTICAL ? 'v' : 'h'}.mp4`);

(async () => {
  const framesDir = path.join(DIR, `frames_${CUT}_${VERTICAL ? 'v' : 'h'}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  console.log(`[${OUT}] 1/3 ブラウザを起動します...`);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e)); console.log('ページ内エラー:', e.message); });
  await page.goto('file://' + path.join(DIR, 'index.html') + `?w=${W}&h=${H}&cut=${CUT}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 15000 });
  const DUR = await page.evaluate('DUR');
  console.log(`[${OUT}] 動画の長さ: ${DUR}秒`);

  console.log(`[${OUT}] 2/3 フレームを撮影中...`);
  const total = Math.round(FPS * DUR);
  for (let f = 0; f < total; f++) {
    await page.evaluate(`seek(${f / FPS})`);
    await page.screenshot({ path: path.join(framesDir, `f${String(f).padStart(4, '0')}.png`) });
  }
  await browser.close();

  console.log(`[${OUT}] 3/3 ffmpeg で動画にまとめています...`);
  const outPath = path.join(DIR, OUT);
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outPath,
  ], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg 失敗'); process.exit(1); }

  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`[${OUT}] 完成: ${outPath}`);
  console.log(`[${OUT}] pageerrors: ${errors.length}`);
  if (errors.length) process.exitCode = 2;
})();
