// UIZIN Event OS の画面。状態はサーバーが持ち、この画面は表示と「押した」の送信だけを行う。
// 名前などのデータは textContent で入れる（HTMLとして解釈しない）。
"use strict";

const $ = id => document.getElementById(id);
const PRESS_LOCK_MS = 1000;
const HOLD_MS = 2000;
const VIEW_TIMEOUT_MS = 5000;
const VIEW_STALE_MS = 6000;

const store = {
  get(key, fallback, session) {
    try {
      const value = (session ? sessionStorage : localStorage).getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  },
  set(key, value, session) {
    try {
      (session ? sessionStorage : localStorage).setItem(key, value);
    } catch {
      /* 保存できなくても動く */
    }
  },
  remove(key, session) {
    try {
      (session ? sessionStorage : localStorage).removeItem(key);
    } catch {
      /* 無視 */
    }
  },
};

const params = new URLSearchParams(location.search);
if (params.get("t")) {
  store.set("eos-token", params.get("t"));
  history.replaceState(null, "", location.pathname);
}
const token = store.get("eos-token", "");
let device = store.get("eos-device", "");
if (!device) {
  device = `screen-${Math.random().toString(36).slice(2, 8)}`;
  store.set("eos-device", device);
}
let pin = store.get("eos-pin", "", true);

let view = null;
let viewAt = 0;
let locked = false;
let fetching = false;
let fetchAgain = false;

// 中身が変わったときだけ作り直す（2秒ごとに作り直すと、押している途中のボタンが消えて押せないため）。
const lastSig = {};
function changed(key, data) {
  const sig = JSON.stringify(data);
  if (lastSig[key] === sig) return false;
  lastSig[key] = sig;
  return true;
}

function headers(json) {
  const result = { "x-eos-device": device };
  if (token) result["x-eos-token"] = token;
  if (pin) result["x-eos-pin"] = pin;
  if (json) result["content-type"] = "application/json";
  return result;
}

function toast(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("error", Boolean(isError));
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, isError ? 6000 : 2500);
}

async function fetchView() {
  if (fetching) {
    fetchAgain = true;
    return;
  }
  fetching = true;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), VIEW_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/view${token ? `?t=${encodeURIComponent(token)}` : ""}`, { headers: headers(false), signal: abort.signal });
    const body = await res.json();
    if (res.status === 403 && pin) {
      pin = "";
      store.remove("eos-pin", true);
      toast(body.message || "PINが違います", true);
    } else if (!res.ok) {
      staleLamps();
      toast(body.message || "画面を読み込めませんでした", true);
    } else {
      view = body.view;
      viewAt = Date.now();
      render();
    }
  } catch {
    markOffline();
  } finally {
    clearTimeout(timer);
    fetching = false;
    if (fetchAgain) {
      fetchAgain = false;
      fetchView();
    }
  }
}

// 新しい様子を受け取れない間は、録画・配信のランプを「未確認」にする（古い「● 録画中」を出し続けない）。
function staleLamps() {
  for (const [id, label] of [["lamp-record", "録画"], ["lamp-stream", "配信"]]) {
    const el = $(id);
    el.textContent = `⚠️ ${label} 未確認`;
    el.className = "lamp warn";
  }
}

function markOffline() {
  $("offline").hidden = false;
  staleLamps();
}

function lockButtons() {
  locked = true;
  document.body.classList.add("locked");
  setTimeout(() => {
    locked = false;
    document.body.classList.remove("locked");
  }, PRESS_LOCK_MS);
}

// opts.force：確認ダイアログの後など、続けて送るとき。opts.askConfirm：「確認が必要」の返事を赤い知らせにしない。
async function send(type, args, extra, opts) {
  const options = opts || {};
  // 🛟 は何度押しても同じ結果なので、連打よけの待ち時間でも必ず送る。
  if (locked && type !== "safe_on" && !options.force) {
    toast("⏳ 前に押したボタンを受け付けています。画面が変わってから押してください", false);
    return null;
  }
  lockButtons();
  const body = { type, args: args || {}, expectedRev: view ? view.rev : 0, ...(extra || {}) };
  let result = null;
  try {
    const res = await fetch("/api/command", { method: "POST", headers: headers(true), body: JSON.stringify(body) });
    result = await res.json();
    if (!result.ok) {
      if (!(options.askConfirm && result.code === "confirm")) toast(result.message || "受け付けられませんでした", true);
      if (Array.isArray(result.errors)) showCardErrors(result.errors);
    } else if (result.message && !/^受け付けました$/.test(result.message)) {
      toast(result.message, false);
    }
    if (Array.isArray(result.warnings) && result.warnings.length) showCardErrors(result.warnings.map(w => `注意：${w}`));
  } catch {
    toast("送れませんでした。本体のMacとのつながりを確かめてください", true);
  }
  fetchView();
  return result;
}

// ---- 長押し＋確認（危険な操作） ----

function confirmDialog(text) {
  return new Promise(resolve => {
    const dialog = $("confirm");
    $("confirm-text").textContent = text;
    const done = answer => {
      $("confirm-yes").onclick = null;
      $("confirm-no").onclick = null;
      dialog.close();
      resolve(answer);
    };
    $("confirm-yes").onclick = () => done(true);
    $("confirm-no").onclick = () => done(false);
    dialog.showModal();
  });
}

function attachHold(button, onConfirmed) {
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove("holding");
  };
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (button.disabled) return;
    button.classList.add("holding");
    timer = setTimeout(async () => {
      cancel();
      if (await confirmDialog(button.dataset.hold)) onConfirmed();
    }, HOLD_MS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, cancel);
  button.addEventListener("click", event => {
    event.preventDefault();
    toast("このボタンは2秒長押しです", false);
  });
}

// 「↩ 戻す」。何が戻るかはボタンに出ている。試合中の「試合開始」などは、確かめてから戻す。
async function undo() {
  const target = view && view.fixed.undo;
  if (!target || !target.confirm) {
    send("undo");
    return;
  }
  const rev = view.rev;
  if (await confirmDialog(target.confirm)) send("undo", {}, { expectedRev: rev }, { force: true });
}

function wirePanelButtons() {
  for (const button of document.querySelectorAll("[data-cmd]")) {
    const type = button.dataset.cmd;
    const args = button.dataset.args ? JSON.parse(button.dataset.args) : {};
    if (button.dataset.hold) {
      attachHold(button, () => send(type, args, { confirm: true }));
    } else {
      button.addEventListener("click", () => send(type, args));
    }
  }
}

// ---- 表示 ----

function setText(id, text) {
  $(id).textContent = text == null ? "" : String(text);
}

function lampClass(status) {
  return { ok: "ok", off: "off", warn: "warn", unknown: "warn", error: "error" }[status] || "warn";
}

function renderAlerts() {
  if (!changed("alerts", view.alerts)) return;
  const box = $("alerts");
  box.replaceChildren();
  for (const alert of view.alerts) {
    const div = document.createElement("div");
    div.className = `alert ${alert.level}`;
    const p = document.createElement("p");
    p.textContent = alert.text;
    div.append(p);
    if (alert.button) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "alert-button";
      button.textContent = alert.button.label;
      button.addEventListener("click", () => send(alert.button.cmd, alert.button.args));
      div.append(button);
    }
    box.append(div);
  }
}

function renderButtons() {
  if (!changed("buttons", [view.buttons, view.preflightReady, view.phase, view.role])) return;
  const box = $("buttons");
  box.replaceChildren();
  box.dataset.count = String(view.buttons.length);
  if (view.buttons.length === 0 && view.phase === "setup" && view.role === "easy") {
    const p = document.createElement("p");
    p.className = "wait-note";
    p.textContent = "準備ができたら、運営の人が「大会を始める」を押します";
    box.append(p);
  }
  for (const item of view.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `big ${item.args && item.args.winner ? `win-${item.args.winner}` : ""} ${item.args && item.args.corner ? `corner-${item.args.corner}` : ""}`;
    button.textContent = item.label;
    if (item.cmd === "start_event" && !view.preflightReady) button.disabled = true;
    button.addEventListener("click", () => send(item.cmd, item.args));
    box.append(button);
  }
}

function renderOperator() {
  const op = view.operator;
  $("operator").hidden = !op;
  if (!op) return;
  if (changed("op-lamps", op.lamps)) {
    const lamps = $("op-lamps");
    lamps.replaceChildren();
    for (const [label, lamp] of [["OBS", op.lamps.obs], ["メインカメラ", op.lamps.main], ["サブカメラ", op.lamps.sub]]) {
      const span = document.createElement("span");
      span.className = `lamp ${lampClass(lamp.status)}`;
      span.textContent = `${{ ok: "✅", unknown: "⚠️", error: "❌" }[lamp.status] || "⚠️"} ${label}${lamp.message ? `：${lamp.message}` : ""}`;
      lamps.append(span);
    }
  }
  // 練習中は「始める」「やり直す」を出さない。「終える」はいつでも出す（配信が残っていたら止められるように）。
  $("stream-start").hidden = !op.canStream;
  $("stream-restart").hidden = !op.canStream;

  $("force-start").hidden = view.role !== "admin" || view.phase !== "setup";
  renderPreflight(op.preflight);
  renderResults(op.results);
}

// 開始前チェックは、行を作り直さず中身だけ書き換える（空き容量などが変わるたびに 👤 ボタンが消えないように）。
const preflightRows = new Map();
function preflightRow(id) {
  let row = preflightRows.get(id);
  if (!row) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    li.append(text);
    row = { li, text, button: null };
    preflightRows.set(id, row);
  }
  return row;
}

function renderPreflight(preflight) {
  if (!changed("preflight", preflight)) return;
  const list = $("preflight");
  const summary = preflightRow("summary:ready");
  summary.li.className = `check summary ${preflight.ready ? "ok" : "error"}`;
  summary.text.textContent = preflight.ready ? "✅ 大会を始められます" : `❌ まだ始められません（${preflight.blocking.length}件）`;
  const wanted = [summary.li];
  for (const entry of preflight.items) {
    const row = preflightRow(`item:${entry.id}`);
    row.li.className = `check ${entry.status === "ok" ? "ok" : entry.required ? "error" : "warn"}`;
    const icon = entry.status === "ok" ? (entry.kind === "human" ? "👤" : "✅") : entry.required ? "❌" : "⚠️";
    row.text.textContent = `${icon} ${entry.label}${entry.detail ? `（${entry.detail}）` : ""}${entry.required ? "" : " ［推奨］"}`;
    const needsButton = entry.kind === "human" && entry.id !== "consent";
    if (needsButton && !row.button) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "small";
      button.addEventListener("click", () => send("human_check", { item: entry.id, checked: button.dataset.checked === "true" }));
      row.li.append(button);
      row.button = button;
    } else if (!needsButton && row.button) {
      row.button.remove();
      row.button = null;
    }
    if (row.button) {
      row.button.textContent = entry.status === "ok" ? "取り消す" : "👤 確認した";
      row.button.dataset.checked = String(entry.status !== "ok");
    }
    wanted.push(row.li);
  }
  wanted.forEach((li, index) => {
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] || null);
  });
  while (list.children.length > wanted.length) list.lastElementChild.remove();
}

// 結果の表は、選んでいる途中で作り直さない（選択が消えないように）。
function renderResults(results) {
  if (!changed("results", results)) return;
  const tbody = $("results");
  tbody.replaceChildren();
  for (const row of results) {
    const tr = document.createElement("tr");
    for (const value of [`第${row.no}試合`, row.red, row.blue, row.result || "—"]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    const td = document.createElement("td");
    const select = document.createElement("select");
    for (const [value, label] of [["", "—"], ["red", "赤の勝ち"], ["blue", "青の勝ち"], ["draw", "引き分け"], ["nocontest", "無効試合"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.addEventListener("change", async () => {
      if (!select.value) return;
      if (await confirmDialog(`第${row.no}試合の結果を「${select.selectedOptions[0].textContent}」に直します。よいですか？`)) {
        send("fix_result", { bout: row.no, winner: select.value });
      }
      select.value = "";
    });
    td.append(select);
    tr.append(td);
    tbody.append(tr);
  }
}

function renderAdmin() {
  const admin = view.admin;
  $("admin").hidden = !admin;
  if (!admin) return;
  if (changed("urls", admin.lanUrls)) {
    const urls = $("urls");
    urls.replaceChildren();
    for (const url of admin.lanUrls || []) {
      const li = document.createElement("li");
      li.textContent = url;
      urls.append(li);
    }
    if (!admin.lanUrls || admin.lanUrls.length === 0) {
      const li = document.createElement("li");
      li.textContent = "ネットワークが見つかりません（このMacの画面で操作してください）";
      urls.append(li);
    }
  }
  const info = [`モード：${admin.mode === "rehearsal" ? "練習" : "本番"}`];
  if (admin.program) info.push(`OBSの今の場面：${admin.program}`);
  if (admin.sceneMissing) info.push(`OBSに無い場面：${admin.sceneMissing}`);
  if (admin.obsError) info.push(`最後のエラー：${admin.obsError}`);
  setText("admin-info", info.join(" ／ "));
  $("chaos").hidden = admin.mode !== "rehearsal";
  $("chaos-demo").hidden = !admin.demo;
}

function render() {
  if (!view) return;
  $("offline").hidden = true;
  setText("event-name", view.eventName);
  document.title = `${view.now} - UIZIN Event OS`;

  const record = $("lamp-record");
  record.textContent = view.lamps.record.text;
  record.className = `lamp ${lampClass(view.lamps.record.status)}`;
  const stream = $("lamp-stream");
  stream.textContent = view.lamps.stream.text;
  stream.className = `lamp ${lampClass(view.lamps.stream.status)}`;

  $("rehearsal").hidden = !view.rehearsal;
  renderAlerts();

  if (view.bout) {
    setText("bout-no", `第${view.bout.no}試合${view.bout.category ? `（${view.bout.category}）` : ""}`);
    setText("red-name", view.bout.red.name);
    setText("blue-name", view.bout.blue.name);
    $("hidden-note").hidden = !view.bout.hidden;
  } else {
    setText("bout-no", view.phase === "ended" ? "大会終了" : "");
    setText("red-name", "");
    setText("blue-name", "");
    $("hidden-note").hidden = true;
  }
  setText("done", view.done);
  setText("now", view.now);
  setText("next", view.next);
  renderButtons();

  // 今映っているカメラは、色だけでなく文字でも示す（安全運転中はメイン、配信しない試合ではどちらも映さない）。
  const cam = view.fixed.camera;
  for (const [id, key, label] of [["cam-main", "main", "📹 メイン"], ["cam-sub", "sub", "📹 サブ"]]) {
    const button = $(id);
    const onAir = cam.current === key;
    button.disabled = !cam.enabled;
    button.textContent = onAir ? `${label} ✓映っています` : label;
    button.classList.toggle("active", onAir);
    button.setAttribute("aria-pressed", String(onAir));
  }
  for (const id of ["undo", "op-undo"]) {
    $(id).disabled = !view.fixed.undo.enabled;
    $(id).textContent = view.fixed.undo.label;
  }
  const safe = $("safe");
  safe.textContent = view.fixed.safe.on ? "✅ 通常に戻す" : "🛟 安全運転";
  safe.classList.toggle("on", view.fixed.safe.on);

  if (changed("notices", view.notices)) {
    const notices = $("notices");
    notices.replaceChildren();
    for (const text of view.notices) {
      const li = document.createElement("li");
      li.textContent = text;
      notices.append(li);
    }
  }

  setText("role-label", { easy: "", operator: "運営モード中", admin: "管理モード中" }[view.role]);
  $("role-btn").textContent = view.role === "easy" ? "🔑 運営モード" : "🔒 かんたんモードに戻る";
  renderOperator();
  renderAdmin();
}

function showCardErrors(lines) {
  const list = $("card-errors");
  list.replaceChildren();
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }
}

// ---- 起動 ----

function wire() {
  $("cam-main").addEventListener("click", () => send("camera", { to: "main" }));
  $("cam-sub").addEventListener("click", () => send("camera", { to: "sub" }));
  $("undo").addEventListener("click", undo);
  $("op-undo").addEventListener("click", undo);
  $("safe").addEventListener("click", () => send(view && view.fixed.safe.on ? "safe_off" : "safe_on"));
  wirePanelButtons();

  $("role-btn").addEventListener("click", () => {
    if (view && view.role !== "easy") {
      pin = "";
      store.remove("eos-pin", true);
      fetchView();
      return;
    }
    $("pin-input").value = "";
    setText("pin-error", "");
    $("pin-dialog").showModal();
  });
  $("pin-cancel").addEventListener("click", () => $("pin-dialog").close());
  $("pin-input").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("pin-ok").click();
    }
  });
  $("pin-ok").addEventListener("click", async () => {
    const candidate = $("pin-input").value.trim();
    setText("pin-error", "");
    let res;
    let body = {};
    try {
      res = await fetch("/api/login", {
        method: "POST",
        headers: { ...headers(true), "x-eos-pin": candidate },
        body: "{}",
      });
      body = await res.json().catch(() => ({}));
    } catch {
      setText("pin-error", "つながっていません。少し待ってから、もう一度入れてください");
      return;
    }
    if (!res.ok || !body.ok) {
      setText("pin-error", body.message || "PINが違います");
      return;
    }
    pin = candidate;
    store.set("eos-pin", pin, true);
    $("pin-dialog").close();
    fetchView();
  });

  $("card-load").addEventListener("click", async () => {
    const file = $("card-file").files[0];
    if (!file) {
      toast("CSVファイルを選んでください", true);
      return;
    }
    const csv = await file.text();
    showCardErrors([]);
    // 先にファイルの中身を確かめてもらう。大会中なら、中身が正しいと分かってから確認を出す。
    const result = await send("load_card", { csv }, null, { askConfirm: true });
    if (!result || result.code !== "confirm") return;
    if (!(await confirmDialog("大会中に試合データを読み直します。当日に直した表示名は消えます。今の試合が新しいデータに無いときは、その試合の最初に戻ります。よいですか？"))) return;
    send("load_card", { csv }, { confirm: true }, { force: true });
  });

  // 画面で見ていた試合データの印を一緒に送る（読み直された後のデータを、見ずに「確認した」にしない）。
  $("consent-ack").addEventListener("click", () => {
    const card = view && view.operator && view.operator.card;
    if (!card) {
      toast("試合データを読み込んでください", true);
      return;
    }
    send("consent_ack", { hash: card.hash });
  });

  $("edit-save").addEventListener("click", () => {
    const bout = Number($("edit-bout").value);
    const name = $("edit-name").value.trim();
    if (!bout || !name) {
      toast("試合番号と表示名を入れてください", true);
      return;
    }
    send("edit_name", { bout, corner: $("edit-corner").value, name });
  });

  const source = new EventSource(`/api/events${token ? `?t=${encodeURIComponent(token)}` : ""}`);
  source.addEventListener("change", () => fetchView());
  source.addEventListener("error", () => markOffline());
  source.addEventListener("open", () => {
    $("offline").hidden = true;
    fetchView();
  });
  // 知らせが途切れても、しばらく新しい画面が来なければ自分から読みに行く（つながっていなければ「未確認」にする）。
  setInterval(() => {
    if (Date.now() - viewAt > VIEW_STALE_MS) fetchView();
  }, 2000);
  fetchView();
}

wire();
