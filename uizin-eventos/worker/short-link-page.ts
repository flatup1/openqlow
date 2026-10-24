/**
 * 短い申込URLを作る画面（運営用）。Worker が自分で配る、1枚のページ。
 *
 * なぜ準備画面（Pages）に作らないか：準備画面は「Googleとだけ、読むだけ」と決めてあり、鍵も送信も置かない。
 * 短いURLを作る鍵（SHORT_LINK_KEY）を扱うのは、この画面だけ（Worker と同じ場所）。準備画面の決まりは、そのまま守る。
 * 申込ページ・準備画面の外へ出る通信は、このページからの「自分（Worker）への呼び出し」だけ。
 * この鍵は、当日の進行の操作キー（OPERATOR_KEY）とは別。進行の端末に残る操作キーでは、短いURLの行き先を変えられない。
 *
 * 大会IDの入力欄は無い：どの大会の・本番かテストかは、貼ったURLの中身から Worker が決める（別の大会の短いURLを上書きしないため）。
 * 鍵は、この端末の localStorage には残さない（共用の端末で、だれでも使えてしまうため）。このタブの sessionStorage に、
 * Worker が「通した」と答えたあとだけ入れる（タブを閉じると消える）。前の版が localStorage に残した操作キーは、開いたときに消す。
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
  .testwarn { color: #b91c1c; font-weight: 700; border: 3px solid #b91c1c; border-radius: 10px; padding: 10px; margin: 8px 0 0; background: #fef2f2; }
  .box { word-break: break-all; background: #fff; border: 2px solid #cbd5e1; border-radius: 10px; padding: 10px; margin-top: 8px; }
  [hidden] { display: none; }
</style>
</head>
<body>
<main>
  <h1>短い申込URLを作る（運営用）</h1>
  <p>① 「選手の受付をつくる」の画面で、「完成：選手へ渡すURLをコピー」を押して、長いURLをコピーします。<br>
  ② 下の「長い申込URL」の欄に貼ります。<br>
  ③ 「短いURLを作る」を押します。できた短いURLを、LINEに送ります。</p>
  <p>同じ大会・同じ「本番／テスト」なら、何度作っても、短いURLは同じままです。大会は、貼ったURLの中身で決まります。</p>

  <label for="key">短いURLを作る鍵（SHORT_LINK_KEY。当日の進行の「操作キー」とは、別の鍵です。このタブを閉じるまでだけ、覚えます）</label>
  <input id="key" type="password" autocomplete="off">

  <label for="target">長い申込URL（「選手の受付をつくる」の画面でコピーしたもの）</label>
  <textarea id="target" rows="4" spellcheck="false"></textarea>

  <button id="make" class="primary" type="button">短いURLを作る</button>
  <p id="msg" role="status"></p>

  <div id="result" hidden>
    <p id="testwarn" class="testwarn" hidden>これはテスト用です。選手には送らないでください。</p>
    <p id="kind"></p>
    <label>短いURL（LINEに送るのは、これ）</label>
    <div id="short" class="box"></div>
    <button id="copy" type="button">短いURLをコピー</button>
  </div>
</main>
<script>
(function () {
  var KEY_NAME = 'uizin.shortLink.key';
  // 前の版が使っていた名前（操作キーと大会ID）。読まずに、消すだけ
  var OLD_KEY_NAME = 'uizin.shortLink.operatorKey';
  var OLD_EVENT_NAME = 'uizin.shortLink.eventId';
  function el(id) { return document.getElementById(id); }
  // 鍵は、このタブの間だけ（sessionStorage）。Worker が「通した」と答えたあとにだけ入れる。localStorage には、置かない
  function keep(name, value) { try { sessionStorage.setItem(name, value); } catch (e) { /* 残せなくても、使えます */ } }
  function recall(name) { try { return sessionStorage.getItem(name) || ''; } catch (e) { return ''; } }
  // 前の版が localStorage に残した操作キーと大会IDは、開いたときに消す
  try { localStorage.removeItem(OLD_KEY_NAME); localStorage.removeItem(OLD_EVENT_NAME); } catch (e) { /* 消せなくても、使えます */ }
  function say(text, ok) { el('msg').className = ok ? 'ok' : 'bad'; el('msg').textContent = text; }

  el('key').value = recall(KEY_NAME);

  el('make').addEventListener('click', function () {
    var key = el('key').value.trim();
    var target = el('target').value.trim();
    if (!key) { say('短いURLを作る鍵を入れてください。', false); return; }
    if (target.indexOf('https://') !== 0 || target.indexOf('/apply/#') < 0) {
      say('申込ページの長いURLを貼ってください（「/apply/#」が入っているURLです）。', false);
      return;
    }
    say('作っています…', true);
    fetch('/api/short-links', {
      method: 'POST',
      // 鍵は、このヘッダーだけで送る（URLには付けない）
      headers: { 'content-type': 'application/json', 'x-short-link-key': key },
      body: JSON.stringify({ target: target })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (r) {
      if (r.ok && r.body && r.body.ok === true && typeof r.body.url === 'string') {
        keep(KEY_NAME, key);
        var test = r.body.mode === 'test';
        el('kind').textContent = (test ? 'テスト用' : '本番用') + (typeof r.body.title === 'string' && r.body.title ? '：' + r.body.title : '');
        el('testwarn').hidden = !test;
        el('short').textContent = r.body.url;
        el('result').hidden = false;
        say(test ? 'テスト用の短いURLができました。選手には送らないでください。' : '短いURLができました。下の「コピー」を押して、LINEに貼ってください。', !test);
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
