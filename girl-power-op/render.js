// ============================================================
// render.js — 撮影係ロボット
// ============================================================
// やること:
//   1. ブラウザ(Chromium)で index.html をひらく
//   2. BGM をページに作らせて bgm.wav に保存する
//   3. 時刻を 1/30 秒ずつ進めながらスクリーンショットを 900 枚撮る
//   4. ffmpeg で 900 枚 + BGM を 1 本の動画(mp4)にまとめる
// 実行方法: npm run video  (くわしくは README.md)
// ============================================================
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const FPS = 30;            // 1秒あたりのコマ数
const DUR = 30;            // 動画の長さ(秒)。index.html の DUR と合わせる
const OUT = 'girl_power_op.mp4';

(async () => {
  fs.mkdirSync(path.join(DIR, 'frames'), { recursive: true });

  console.log('1/4 ブラウザを起動します...');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ページ内エラー:', e.message));
  await page.goto('file://' + path.join(DIR, 'index.html'));
  await page.waitForFunction('window.ready === true', null, { timeout: 15000 });

  console.log('2/4 BGM を作曲中...');
  const wavB64 = await page.evaluate('renderAudio()');
  fs.writeFileSync(path.join(DIR, 'bgm.wav'), Buffer.from(wavB64, 'base64'));

  console.log('3/4 フレームを撮影中(数分かかります)...');
  const total = FPS * DUR;
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    await page.evaluate(`seek(${f / FPS})`);
    await page.screenshot({
      path: path.join(DIR, 'frames', `f${String(f).padStart(4, '0')}.png`),
      clip: { x: 0, y: 0, width: 1280, height: 720 },
    });
    if (f % 90 === 0) console.log(`  ${f}/${total} 枚 (${((Date.now() - t0) / 1000).toFixed(0)}秒経過)`);
  }
  console.log(`  ぜんぶで ${total} 枚を ${((Date.now() - t0) / 1000).toFixed(0)} 秒で撮影しました`);
  await browser.close();

  console.log('4/4 ffmpeg で動画にまとめます...');
  // ffmpeg の場所: ふつうは PATH にある「ffmpeg」。
  // 別の場所にあるときは環境変数 FFMPEG=/そのパス で教えられます。
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(DIR, 'frames', 'f%04d.png'),
    '-i', path.join(DIR, 'bgm.wav'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-shortest',
    path.join(DIR, OUT),
  ];
  const r = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.log('\nffmpeg が見つからないか、失敗しました。');
    console.log('ffmpeg をインストールしてから(README.md 参照)、下のコマンドを自分で実行してもOK:');
    console.log(`\n  ${ffmpeg} ${args.join(' ')}\n`);
    process.exit(1);
  }
  console.log(`\nできあがり! → ${path.join(DIR, OUT)}`);
})().catch(e => { console.error(e); process.exit(1); });
