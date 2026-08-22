/* FLAT UP WebOS — フロー自動検証（依存ゼロ・CIで毎回走る）
 *
 * なぜ作ったか:
 *   smoke.cjs は playwright（本物のブラウザ）が要るため、CIでは動いていなかった。
 *   その結果、WebOSの画面遷移は「人が触って確かめる」しか無かった。
 *   このテストは小さな擬似DOMの上で app/js/*.js をそのまま動かし、
 *   質問→分岐→結果→CTA→LINE引き継ぎまでを毎回自動で確かめる。
 *
 * 確かめること:
 *   1. ようこそ画面に見出し（h1）と開始ボタンがある
 *   2. 成人・キッズ・相談の3ルートが最後まで進む
 *   3. 「← 戻る」とスマホの戻るボタンが同じように前の画面へ戻る
 *   4. 戻って選び直したら、前の回答は結果画面に残らない（不具合の再発防止）
 *   5. 「答えずに進む」「最初からやり直す」が動く
 *   6. LINE引き継ぎが成功するとCTAが引き継ぎリンクに変わる
 *   7. 失敗しても従来のLINEリンクのままで、体験が壊れない
 *   8. 送信データにもURLにも、個人情報や回答の中身が出ない
 *   9. 同じ回答で結果画面を開き直しても、二重に送信しない
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP_DIR = path.join(__dirname, "..", "app");
const SCRIPTS = ["js/questions.js", "js/state.js", "js/analytics.js", "js/concierge.js", "js/app.js"];

let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error("FAILED: " + message);
  passed++;
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/* ---------- 最小限の擬似DOM ---------- */

class FakeNode {
  constructor(tagName) {
    this.tagName = String(tagName).toLowerCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = "";
    this.style = {};
    this.ownText = "";
    this.classList = {
      add: name => { if (!this.classes().includes(name)) this.className = (this.className + " " + name).trim(); },
      remove: name => { this.className = this.classes().filter(c => c !== name).join(" "); },
      contains: name => this.classes().includes(name),
    };
  }

  classes() { return this.className.split(/\s+/).filter(Boolean); }

  get textContent() {
    return this.ownText + this.children.map(c => c.textContent).join("");
  }

  set textContent(value) {
    this.ownText = value == null ? "" : String(value);
    this.children = [];
  }

  set innerHTML(value) {
    // タグは検証に不要なので落として文字だけ残す
    this.ownText = String(value).replace(/<[^>]*>/g, "");
    this.children = [];
  }

  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); }
  focus() { this.focused = true; }

  fire(type) { (this.listeners[type] || []).forEach(h => h.call(this, { type })); }

  descendants() {
    return this.children.flatMap(c => [c, ...c.descendants()]);
  }

  querySelector(tagName) {
    return this.descendants().find(n => n.tagName === tagName) || null;
  }
}

/* ---------- アプリを起動する ---------- */

function launch(options) {
  const opts = options || {};
  const fetchCalls = [];
  const beaconCalls = [];
  const store = new Map();
  const historyEntries = [{ flatup: null }];
  let historyIndex = 0;
  let leftSite = false;

  const root = new FakeNode("main");
  const sandbox = {};
  const ctx = vm.createContext(sandbox);
  vm.runInContext("globalThis.window = globalThis;", ctx);

  const win = sandbox;
  win.document = {
    getElementById: id => (id === "app" ? root : null),
    createElement: tag => new FakeNode(tag),
  };
  win.location = { hostname: opts.hostname || "flatupnarita.jp", protocol: "https:" };
  win.sessionStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  win.navigator = {
    sendBeacon: (url, body) => {
      beaconCalls.push({ url, body: JSON.parse(String(body)) });
      return true;
    },
  };
  win.history = {
    replaceState: state => { historyEntries[historyIndex] = state; },
    pushState: state => {
      historyEntries.length = historyIndex + 1;
      historyEntries.push(state);
      historyIndex++;
    },
    back: () => {
      if (historyIndex === 0) { leftSite = true; return; }
      historyIndex--;
      (win.__popstate || []).forEach(h => h({ state: historyEntries[historyIndex] }));
    },
  };
  win.__popstate = [];
  win.addEventListener = (type, handler) => { if (type === "popstate") win.__popstate.push(handler); };
  win.matchMedia = () => ({ matches: true }); // アニメを待たずに検証する
  win.scrollTo = () => {};
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.Promise = Promise;
  win.console = { debug: () => {} };
  win.AbortController = typeof AbortController === "function" ? AbortController : undefined;
  if (opts.fetch) {
    win.fetch = (url, init) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) });
      return opts.fetch(url, init);
    };
  }

  for (const rel of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(APP_DIR, rel), "utf8"), ctx, { filename: rel });
  }

  const api = {
    root,
    win,
    fetchCalls,
    beaconCalls,
    events: () => win.FLATUP.getEvents(),
    journey: () => win.FLATUP.state.get(),
    nodes: () => root.descendants(),
    text: () => root.textContent,
    heading: () => {
      const h = root.querySelector("h1");
      return h ? h.textContent : null;
    },
    find: (tagName, label) =>
      api.nodes().find(n => n.tagName === tagName && n.textContent.includes(label)) || null,
    cta: () => api.nodes().find(n => n.tagName === "a" && (n.getAttribute("class") || n.className).includes("cta")) || null,
    click: async (tagName, label) => {
      const node = api.find(tagName, label);
      if (!node) throw new Error(`FAILED: 「${label}」が画面に見つからない（現在の画面: ${api.heading()}）`);
      node.fire("click");
      await tick();
      return node;
    },
    deviceBack: async () => { win.history.back(); await tick(); },
    leftSite: () => leftSite,
  };
  return api;
}

/* 成人ルートを結果画面まで進める（選択肢は差し替えられる） */
async function runAdultRoute(app, choices) {
  const pick = Object.assign(
    { goal: "ダイエットしたい", gender: "女性", experience: "完全に初めて", availability: "平日の夜" },
    choices || {},
  );
  await app.click("button", "自分に合う始め方を見つける");
  await app.click("button", "自分が通ってみたい");
  await app.click("button", pick.gender);
  await app.click("button", pick.goal);
  await app.click("button", pick.experience);
  await app.click("button", pick.availability);
}

/* ---------- 1. ようこそ画面 ---------- */
async function testWelcome() {
  const app = launch();
  assert(app.heading() === "はじめの一歩を、安心から。", "ようこそ画面に見出し（h1）がある");
  assert(app.find("button", "自分に合う始め方を見つける"), "開始ボタンがある");
  assert(app.text().includes("30秒ほどで終わります"), "所要時間の一言がある");
  assert(app.find("img", "") && app.find("img", "").getAttribute("src") === "hero.jpg?v=13", "写真枠がある（v13キャッシュ更新）");
  assert(app.events().length === 0, "画面を見ただけではイベントを送らない");
  assert(app.beaconCalls.length === 0, "開始前は匿名計測を送らない");
}

/* ---------- 1-b. 匿名計測の送信 ---------- */
async function testFirstPartyAnalytics() {
  const app = launch();
  await app.click("button", "自分に合う始め方を見つける");
  await app.click("button", "自分が通ってみたい");
  assert(app.beaconCalls.length === 2, "開始とQ1回答がAIKA計測口へ送られる");
  assert(app.beaconCalls.every(call => call.url === "https://aika.flatupnarita.jp/webos-event"), "計測先はAIKA正本だけ");
  assert(app.beaconCalls.every(call => /^[a-f0-9]{32}$/.test(call.body.session_id)), "匿名セッションIDの形式が正しい");
  assert(app.beaconCalls[0].body.session_id === app.beaconCalls[1].body.session_id, "同じ操作中は同じ匿名IDでつながる");
  const sent = JSON.stringify(app.beaconCalls);
  assert(!/name|phone|email|保存してはいけない名前/i.test(sent), "計測に個人情報フィールドを含めない");

  const local = launch({ hostname: "example.com" });
  await local.click("button", "自分に合う始め方を見つける");
  assert(local.beaconCalls.length === 0, "本番ドメイン以外からは計測を送らない");
}

/* ---------- 2. 3ルートが最後まで進む ---------- */
async function testThreeRoutes() {
  const adult = launch();
  await runAdultRoute(adult);
  assert(adult.heading() === "あなたなら、こんな一歩から。", "成人ルートが結果画面へ着く");
  assert(adult.cta() && adult.cta().getAttribute("href") === "https://lin.ee/cTSDajPz", "CTAが正本のLINEリンク");
  assert(adult.text().includes("初回500円"), "体験料金の安心材料が出る");

  const kids = launch();
  await kids.click("button", "自分に合う始め方を見つける");
  await kids.click("button", "子どもを通わせたい");
  await kids.click("button", "小学校低学年");
  await kids.click("button", "自信をつけてほしい");
  assert(kids.heading() === "お子さまなら、こんな一歩から。", "キッズルートが結果画面へ着く");
  assert(kids.text().includes("自信につながります"), "キッズの回答に応じた一言が出る");

  const consult = launch();
  await consult.click("button", "自分に合う始め方を見つける");
  await consult.click("button", "まだ決めていない・まず相談したい");
  assert(consult.heading() === "まだ決めなくて、大丈夫です。", "相談ルートが結果画面へ着く");
  assert(
    consult.cta().textContent.includes("予約じゃなくてOK"),
    "相談ルートのCTAは予約を強要しない文言",
  );

  const family = launch();
  await family.click("button", "自分に合う始め方を見つける");
  await family.click("button", "家族と一緒に始めたい");
  assert(family.heading() === "ご家族での一歩を、一緒に考えさせてください。", "家族ルートが結果画面へ着く");
}

/* ---------- 3. 戻る（画面内ボタンとスマホの戻るボタン） ---------- */
async function testBack() {
  const app = launch();
  await app.click("button", "自分に合う始め方を見つける");
  await app.click("button", "自分が通ってみたい");
  assert(app.heading() === "あなたについて教えてください。", "2問目が出ている");

  await app.click("button", "← 戻る");
  assert(app.heading() === "今日は、誰のために来ましたか？", "画面内の「← 戻る」で1問目へ戻る");

  await app.click("button", "自分が通ってみたい");
  await app.deviceBack();
  assert(app.heading() === "今日は、誰のために来ましたか？", "スマホの戻るボタンでも1問目へ戻る");

  await app.deviceBack();
  assert(app.heading() === "はじめの一歩を、安心から。", "さらに戻るとようこそ画面へ戻る");
  assert(app.leftSite() === false, "質問の途中でサイトの外へ出てしまわない");
}

/* ---------- 4. 選び直しの回帰テスト ---------- */
async function testAnswerReplacement() {
  const app = launch();
  await app.click("button", "自分に合う始め方を見つける");
  await app.click("button", "自分が通ってみたい");
  await app.click("button", "女性");
  await app.click("button", "ダイエットしたい");
  await app.click("button", "← 戻る");
  assert(app.heading() === "どんな目的に近いですか？", "目的の質問へ戻れる");
  await app.click("button", "ストレスを発散したい");
  await app.click("button", "完全に初めて");
  await app.click("button", "平日の夜");

  const text = app.text();
  assert(text.includes("ミットを思いきり叩く"), "選び直した後の目的に合う一言が出る");
  assert(!text.includes("楽しく続くから、結果につながります"), "選び直す前の目的の一言は残らない");
  const goalAnswers = app.journey().answers.filter(a => a.questionId === "goal");
  assert(goalAnswers.length === 1 && goalAnswers[0].value === "stress", "回答の記録も最後の1つだけになる");
}

/* ---------- 5. スキップ・やり直し ---------- */
async function testSkipAndRestart() {
  const app = launch();
  await app.click("button", "自分に合う始め方を見つける");
  await app.click("button", "自分が通ってみたい");
  await app.click("button", "答えずに進む →");
  assert(app.heading() === "どんな目的に近いですか？", "「答えずに進む」で次の質問へ進む");
  assert(app.journey().gender === null, "答えなかった項目は空のまま");
  assert(app.events().some(e => e.event === "question_skipped"), "スキップが計測される");

  await app.click("button", "運動不足を解消したい");
  await app.click("button", "完全に初めて");
  await app.click("button", "まだ分からない");
  await app.click("button", "最初からやり直す");
  assert(app.heading() === "はじめの一歩を、安心から。", "「最初からやり直す」でようこそ画面へ戻る");
  assert(app.journey().answers.length === 0, "やり直すと回答が消える");
}

/* ---------- 6〜9. LINE引き継ぎ ---------- */
async function testHandoffSuccess() {
  const app = launch({ fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, journey_id: "J-3f8a12bc9d01" }) }) });
  await runAdultRoute(app);
  await tick();

  const href = app.cta().getAttribute("href");
  assert(href.startsWith("https://line.me/R/oaMessage/"), "引き継ぎに成功するとCTAが引き継ぎリンクへ変わる");
  assert(href.includes("%40jfl0054o"), "引き継ぎ先は正しいAIKA公式LINE（末尾は英字o）");
  assert(href.includes("J-3f8a12bc9d01"), "引き継ぎコードがリンクに入る");
  assert(!/female|diet|first|weekday_night/.test(href), "回答の中身はURLに出さない");
  assert(app.text().includes("同じ質問はされません"), "利用者への説明が出る");
  assert(app.events().some(e => e.event === "journey_created"), "引き継ぎ成功が計測される");

  const sent = app.fetchCalls[0].body.answers;
  assert(sent.gender === "female" && sent.goal[0] === "diet", "選んだカテゴリはVPSへ渡る");
  assert(
    !JSON.stringify(sent).match(/@|\d{3}-\d{4}|様|さん/),
    "送信データに個人情報らしきものが入らない",
  );
  assert(Object.keys(sent).sort().join(",") === "audience,availability,experience,gender,goal,kidsAge,kidsHope,source",
    "送信する項目は決められたカテゴリだけ");
}

async function testHandoffFailure() {
  const app = launch({ fetch: () => Promise.reject(new Error("network down")) });
  await runAdultRoute(app);
  await tick();
  assert(app.cta().getAttribute("href") === "https://lin.ee/cTSDajPz", "引き継ぎに失敗しても従来のLINEリンクで案内できる");
  assert(!app.text().includes("引き継ぎコード"), "失敗時に中途半端な説明を出さない");
  assert(app.heading() === "あなたなら、こんな一歩から。", "失敗しても結果画面は壊れない");
}

async function testHandoffNotSentOffProduction() {
  const app = launch({ hostname: "example.com", fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, journey_id: "J-x" }) }) });
  await runAdultRoute(app);
  await tick();
  assert(app.fetchCalls.length === 0, "本番ドメイン以外では回答を送信しない");
}

async function testHandoffNotDuplicated() {
  const app = launch({ fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, journey_id: "J-same" }) }) });
  await runAdultRoute(app);
  await tick();
  await app.click("button", "← 戻る");
  await app.click("button", "平日の夜");
  await tick();
  assert(app.fetchCalls.length === 1, "同じ回答で結果画面を開き直しても、二重に送信しない");
}

/* ---------- 10. index.html の作り（キャッシュ・シェア・取りこぼし） ---------- */
async function testIndexHtml() {
  const html = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");

  const versions = [...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
  assert(versions.length >= 6, "JS・CSSにキャッシュ対策のバージョンが付いている");
  assert(new Set(versions).size === 1, "バージョン番号がすべて同じ（上げ忘れがない）");

  for (const tag of ["og:title", "og:description", "og:image", "og:type"]) {
    assert(html.includes(`property="${tag}"`), `シェア用の ${tag} がある`);
  }
  assert(html.includes('name="twitter:card"'), "Twitter/Xカードの指定がある");
  assert(html.includes('lang="ja"'), "日本語ページとして宣言している");
  assert(/<title>[^<]+<\/title>/.test(html), "タイトルがある");

  assert(html.includes("<noscript>"), "JavaScriptが動かない環境向けの案内がある");
  assert(html.includes('class="footer-line"'), "途中でやめた人向けの相談リンクが常にある");
  const lineLinks = [...html.matchAll(/https:\/\/lin\.ee\/[A-Za-z0-9]+/g)].map(m => m[0]);
  assert(lineLinks.length > 0 && new Set(lineLinks).size === 1, "LINEリンクは1種類だけ（正本と同じ）");
}

/* ---------- 11. CTAの読みやすさ（WCAG AA） ---------- */
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function testCtaContrast() {
  const css = fs.readFileSync(path.join(APP_DIR, "styles.css"), "utf8");
  const line = css.match(/--line:\s*(#[0-9a-f]{6})/i);
  assert(line && contrastRatio(line[1], "#ffffff") >= 4.5,
    "LINEボタンの白文字はコントラスト比4.5:1以上");

  const start = css.match(/button\.cta\.start\s*\{[\s\S]*?linear-gradient\([^#]*(#[0-9a-f]{6})[^#]*(#[0-9a-f]{6})/i);
  assert(start && contrastRatio(start[1], "#ffffff") >= 4.5,
    "開始ボタンのグラデーション左端も4.5:1以上");
  assert(start && contrastRatio(start[2], "#ffffff") >= 4.5,
    "開始ボタンのグラデーション右端も4.5:1以上");
}

/* ---------- 実行 ---------- */

const TESTS = [
  ["ようこそ画面", testWelcome],
  ["匿名の計測送信", testFirstPartyAnalytics],
  ["3ルート（成人・キッズ・相談・家族）", testThreeRoutes],
  ["戻る（画面内・スマホ）", testBack],
  ["選び直しても前の回答が残らない", testAnswerReplacement],
  ["スキップ・やり直し", testSkipAndRestart],
  ["LINE引き継ぎ（成功）", testHandoffSuccess],
  ["LINE引き継ぎ（失敗しても壊れない）", testHandoffFailure],
  ["本番ドメイン以外では送信しない", testHandoffNotSentOffProduction],
  ["同じ回答を二重送信しない", testHandoffNotDuplicated],
  ["index.html の作り", testIndexHtml],
  ["CTAの色コントラスト", testCtaContrast],
];

(async () => {
  for (const [name, fn] of TESTS) {
    try {
      await fn();
    } catch (e) {
      console.error(`\n✗ ${name}\n  ${e.message}\n`);
      process.exit(1);
    }
    console.log(`  OK  ${name}`);
  }
  console.log(`webos flow tests passed (${passed} checks, ブラウザ不要・依存ゼロ)`);
})();
