/**
 * 短い申込URLを作る画面（運営用）。Worker が自分で配る、1枚のページ。
 *
 * なぜ準備画面（Pages）に作らないか：準備画面は「Googleとだけ、読むだけ」と決めてあり、鍵も送信も置かない。
 * 操作キーを扱うのは、この画面だけ（Worker と同じ場所）。準備画面の決まりは、そのまま守る。
 * 申込ページ・準備画面の外へ出る通信は、このページからの「自分（Worker）への呼び出し」だけ。
 */

export const SHORT_LINK_PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export const SHORT_LINK_PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>短い申込URLを作る（運営用）</title>
<style>
  body { margin: 0; padding: 16px; background: #f8fafc; color: #0f172a; font-family: system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif; font-size: 18px; line-height: 1.75; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 8px 0 12px; }
  label { display: block; font-weight: 700; margin-top: 16px; }
  input, textarea { width: 100%; box-sizing: border-box; font-size: 18px; padding: 10px; border: 2px solid #94a3b8; border-radius: 10px; background: #fff; }
  button { width: 100%; font-size: 18px; padding: 12px 16px; margin-top: 14px; border-radius: 10px; border: 2px solid #0f172a; background: #fff; color: #0f172a; }
  button.primary { background: #0f172a; color: #fff; }
  .ok { color: #047857; font-weight: 700; }
  .bad { color: #b91c1c; font-weight: 700; }
  .box { word-break: break-all; background: #fff; border: 2px solid #cbd5e1; border-radius: 10px; padding: 10px; margin-top: 8px; }
  [hidden] { display: none; }
</style>
</head>
<body>
<main>
  <h1>短い申込URLを作る（運営用）</h1>
  <p>① 準備画面の「完成：選手へ渡すURLをコピー」を押して、長いURLをコピーします。<br>
  ② 下の「長い申込URL」の欄に貼ります。<br>
  ③ 「短いURLを作る」を押します。できた短いURLを、LINEに送ります。</p>
  <p>同じ大会なら、何度作っても、短いURLは同じままです。</p>

  <label for="event">大会ID（準備画面の大会IDと同じもの）</label>
  <input id="event" autocomplete="off" spellcheck="false">

  <label for="key">操作キー（操作の画面で使うもの。この端末にだけ残ります）</label>
  <input id="key" type="password" autocomplete="off">

  <label for="target">長い申込URL（準備画面でコピーしたもの）</label>
  <textarea id="target" rows="4" spellcheck="false"></textarea>

  <button id="make" class="primary" type="button">短いURLを作る</button>
  <p id="msg" role="status"></p>

  <div id="result" hidden>
    <label>短いURL（LINEに送るのは、これ）</label>
    <div id="short" class="box"></div>
    <button id="copy" type="button">短いURLをコピー</button>
  </div>
</main>
<script>
(function () {
  var KEY_NAME = 'uizin.shortLink.operatorKey';
  var EVENT_NAME = 'uizin.shortLink.eventId';
  function el(id) { return document.getElementById(id); }
  function remember(name, value) { try { localStorage.setItem(name, value); } catch (e) { /* 残せなくても、使えます */ } }
  function recall(name) { try { return localStorage.getItem(name) || ''; } catch (e) { return ''; } }
  function say(text, ok) { el('msg').className = ok ? 'ok' : 'bad'; el('msg').textContent = text; }

  el('event').value = recall(EVENT_NAME);
  el('key').value = recall(KEY_NAME);

  el('make').addEventListener('click', function () {
    var key = el('key').value.trim();
    var target = el('target').value.trim();
    var eventId = el('event').value.trim();
    if (!key) { say('操作キーを入れてください。', false); return; }
    if (target.indexOf('https://') !== 0 || target.indexOf('/apply/#') < 0) {
      say('申込ページの長いURLを貼ってください（「/apply/#」が入っているURLです）。', false);
      return;
    }
    remember(KEY_NAME, key);
    remember(EVENT_NAME, eventId);
    say('作っています…', true);
    var path = '/api/short-links' + (eventId ? '?event=' + encodeURIComponent(eventId) : '');
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': key },
      body: JSON.stringify({ mode: 'live', target: target })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (r) {
      if (r.ok && r.body && r.body.ok === true && typeof r.body.url === 'string') {
        el('short').textContent = r.body.url;
        el('result').hidden = false;
        say('短いURLができました。下の「コピー」を押して、LINEに貼ってください。', true);
      } else {
        say((r.body && r.body.reason) || '短いURLを作れませんでした。', false);
      }
    }).catch(function () {
      say('通信できませんでした。電波を確かめて、もう一度押してください。', false);
    });
  });

  el('copy').addEventListener('click', function () {
    var text = el('short').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        say('コピーしました。LINEに貼ってください。', true);
      }, function () {
        say('コピーできませんでした。短いURLを長押しして、コピーしてください。', false);
      });
    } else {
      say('短いURLを長押しして、コピーしてください。', false);
    }
  });
})();
</script>
</body>
</html>
`;
