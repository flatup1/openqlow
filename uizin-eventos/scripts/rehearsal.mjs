#!/usr/bin/env node
/**
 * 3端末同時同期の実機確認（模擬大会スモークテスト）。
 *
 * 使い方:
 *   1) 別のターミナルで: npm run worker:dev
 *   2) このターミナルで : node scripts/rehearsal.mjs
 *
 * 環境変数:
 *   EVENTOS_API   既定 http://127.0.0.1:8787
 *   OPERATOR_KEY  既定 local-dev-key（wrangler dev 用の .dev.vars と合わせる）
 *
 * 確認すること:
 *   - 3端末が同じ状態を1秒未満で受け取る
 *   - 停止 → 再開 → 元に戻す が全端末に届く
 *   - 操作キーなしでは1つも書き換えられない
 *   - 再読み込み（新規接続）で状態が完全に復元される
 */

const API = (process.env.EVENTOS_API ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const KEY = process.env.OPERATOR_KEY ?? 'local-dev-key';
const WS = API.replace(/^http/, 'ws') + '/ws';

let failures = 0;
function check(ok, label, detail = '') {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + label + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
}

async function post(path, body, key = KEY) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function buildCsv(matchCount = 3) {
  const header =
    'no,class,rule,rounds,round_seconds,break_seconds,red_name,red_team,red_record,red_comment,blue_name,blue_team,blue_record,blue_comment,note';
  const rows = [];
  const music = ['no,kind,title,apple_music_url,youtube_url,seconds'];
  for (let i = 1; i <= matchCount; i++) {
    rows.push([i, 'ライト級', 'アマチュアMMA', 2, '2:00', 60, '赤' + i, 'Aジム', '1勝', '勝ちます', '青' + i, 'Bジム', '2勝', '全力で', ''].join(','));
    music.push([i, 'walkout_red', '入場曲' + i, 'https://music.apple.com/jp/album/a/' + i, '', 60].join(','));
  }
  return {
    event: ['key,value', 'title,UIZIN 模擬大会', 'venue,テスト会場', 'hold_message,しばらくお待ちください'].join('\n'),
    matches: [header, ...rows].join('\n'),
    music: music.join('\n'),
  };
}

/** 端末1台ぶんの接続 */
function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS);
    const received = [];
    const waiters = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const at = Date.now();
      received.push({ message, at });
      for (const w of waiters.slice()) {
        if (w.match(message)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve({ message, at });
        }
      }
    });
    socket.addEventListener('open', () =>
      resolve({
        name,
        socket,
        received,
        waitFor: (match, timeoutMs = 3_000) =>
          new Promise((res, rej) => {
            const hit = received.find((r) => match(r.message));
            if (hit) return res(hit);
            const waiter = { match, resolve: res };
            waiters.push(waiter);
            setTimeout(() => {
              const i = waiters.indexOf(waiter);
              if (i >= 0) {
                waiters.splice(i, 1);
                rej(new Error(name + ': ' + timeoutMs + 'ms 以内に届きませんでした'));
              }
            }, timeoutMs);
          }),
        close: () => socket.close(),
      }),
    );
    socket.addEventListener('error', () => reject(new Error(name + ': WebSocket に接続できません（' + WS + '）')));
  });
}

async function main() {
  console.log('接続先: ' + API);

  // --- 0. 生存確認 ---------------------------------------------------------
  const health = await fetch(API + '/api/health').then((r) => r.json());
  check(health.ok === true, 'Worker が応答する', 'eventId=' + health.eventId);

  // --- 1. 番組表を入れる ---------------------------------------------------
  const upload = await post('/api/program/upload', buildCsv(3));
  check(upload.status === 200 && upload.data.ok === true, '番組表を取り込める', upload.data.reason ?? '');
  check(upload.data.program?.matches?.length === 3, '3試合が入っている');

  // --- 2. 操作キーが無ければ何も書き換えられない ------------------------------
  const denied = await post('/api/command', { command: { type: 'next' } }, 'wrong-key');
  check(denied.status === 401, '操作キーが違うと拒否される（MC・表示画面からは操作できない）');

  // --- 3. 3端末を接続 ------------------------------------------------------
  const terminals = await Promise.all([connect('操作者'), connect('MC'), connect('表示画面')]);
  await Promise.all(terminals.map((t) => t.waitFor((m) => m.t === 'sync')));
  check(true, '3端末が接続して初期同期を受け取った');

  // --- 4. 「次へ」が3端末に1秒未満で届く --------------------------------------
  const before = terminals[0].received.length;
  const sentAt = Date.now();
  const next = await post('/api/command', { command: { type: 'next' } });
  check(next.data.ok === true, '「次へ」が通る', next.data.label ?? next.data.reason ?? '');
  const version = next.data.state.version;

  const arrivals = await Promise.all(
    terminals.map((t) => t.waitFor((m) => m.t === 'state' && m.state.version === version)),
  );
  const delays = arrivals.map((a) => a.at - sentAt);
  check(
    delays.every((d) => d < 1_000),
    '3端末すべてに1秒未満で届く',
    delays.map((d) => d + 'ms').join(' / '),
  );
  check(
    arrivals.every((a) => JSON.stringify(a.message.state) === JSON.stringify(arrivals[0].message.state)),
    '3端末が受け取った状態が完全に一致する',
  );
  check(terminals[0].received.length > before, '配信が届いている');

  // --- 5. 進める -----------------------------------------------------------
  await post('/api/command', { command: { type: 'next' } }); // 1R開始
  const fight = await post('/api/command', { command: { type: 'next' } }); // インターバル
  check(fight.data.state.phase === 'interval', '「次へ」だけで インターバル まで進む');

  // --- 6. 緊急停止 ---------------------------------------------------------
  const hold = await post('/api/command', { command: { type: 'hold', message: 'しばらくお待ちください' } });
  check(hold.data.ok === true && hold.data.state.hold.active === true, '緊急停止できる');
  await Promise.all(terminals.map((t) => t.waitFor((m) => m.t === 'state' && m.state.hold.active === true)));
  check(true, '停止が3端末すべてに届く');

  const blocked = await post('/api/command', { command: { type: 'next' } });
  check(blocked.status === 409, '停止中は「次へ」を受け付けない（誤操作防止）');

  const resume = await post('/api/command', { command: { type: 'resume' } });
  check(resume.data.state.hold.active === false, '再開できる');

  // --- 7. 直前の一手だけ元に戻せる --------------------------------------------
  const beforeUndo = resume.data.state.phase;
  const stepped = await post('/api/command', { command: { type: 'next' } });
  check(stepped.data.state.phase !== beforeUndo, '押し間違いを再現');
  const undone = await post('/api/undo');
  check(undone.data.ok === true && undone.data.state.phase === beforeUndo, '元に戻せる');
  const twice = await post('/api/undo');
  check(twice.status === 409, '2手目は戻せない（v1の決まりごと）');

  // --- 8. 再読み込みで完全復元 ------------------------------------------------
  const snapshot = await fetch(API + '/api/state').then((r) => r.json());
  const reloaded = await connect('再読み込みした端末');
  const sync = await reloaded.waitFor((m) => m.t === 'sync');
  check(
    sync.message.state.version === snapshot.state.version &&
      sync.message.state.matchIndex === snapshot.state.matchIndex &&
      JSON.stringify(sync.message.state.roundTimer) === JSON.stringify(snapshot.state.roundTimer),
    '再読み込みしても試合・タイマー・状態が完全に戻る',
  );
  reloaded.close();

  // --- 9. 音源チェック ------------------------------------------------------
  const music = await post('/api/music/check');
  if (music.data.ok) {
    const summary = music.data.musicReport.summary;
    check(summary.total === 3, '音源チェックが全曲を見る', '緑' + summary.green + '/黄' + summary.yellow + '/赤' + summary.red);
  } else {
    check(false, '音源チェックが動く', music.data.reason ?? '');
  }

  for (const t of terminals) t.close();

  console.log('');
  console.log(failures === 0 ? '結果: すべて PASS' : '結果: ' + failures + ' 件 FAIL');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('FAIL: ' + (error instanceof Error ? error.message : String(error)));
  console.error('（先に `npm run worker:dev` を起動してください）');
  process.exit(1);
});
