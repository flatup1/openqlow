/* FLAT UP WebOS — 画面遷移と描画
 * 一問一画面。選択は1タップ。戻れる。答えたくない質問はスキップできる。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  var root = document.getElementById("app");

  /* ---------- ユーティリティ ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function show(screenNode) {
    root.textContent = "";
    screenNode.classList.add("screen");
    root.appendChild(screenNode);
    var h = screenNode.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  // ルート内の現在位置（小さな点）。長さを意識させすぎない。
  function dots(questionId) {
    var routes = {
      gender: 1, goal: 2, experience: 3, availability: 4,
      kids_age: 1, kids_hope: 2
    };
    var totals = { gender: 4, goal: 4, experience: 4, availability: 4, kids_age: 2, kids_hope: 2 };
    var pos = routes[questionId];
    if (!pos) return null;
    var wrap = el("div", { class: "dots", "aria-hidden": "true" });
    for (var i = 1; i <= totals[questionId]; i++) {
      var d = el("span");
      if (i <= pos) d.className = "on";
      wrap.appendChild(d);
    }
    return wrap;
  }

  /* ---------- 画面: ようこそ ---------- */

  function renderWelcome() {
    FLATUP.state.pushScreen("welcome");
    var lead = el("p", { class: "welcome-lead" });
    lead.innerHTML =
      "ようこそ。<br><br>ここは、<br>強い人だけの場所ではありません。<br><br>" +
      "あなたに合った道を、<br>一緒に探します。";

    var start = el("button", { class: "cta opt", type: "button", text: "冒険を始める" });
    start.addEventListener("click", function () {
      FLATUP.track("webos_started", {});
      go(FLATUP.FLOW_START);
    });

    show(el("div", {}, [lead, el("div", { class: "options" }, [start])]));
  }

  /* ---------- 画面: 質問 ---------- */

  function renderQuestion(id) {
    var q = FLATUP.QUESTIONS[id];
    if (!q) return renderResult();
    FLATUP.state.pushScreen(id);

    var children = [];
    var d = dots(id);
    if (d) children.push(d);
    children.push(el("h1", { class: "q", text: q.question }));
    if (q.note) children.push(el("p", { class: "note", text: q.note }));

    var opts = el("div", { class: "options" });
    q.options.forEach(function (opt) {
      var b = el("button", { class: "opt", type: "button", text: opt.label });
      b.addEventListener("click", function () {
        FLATUP.state.answer(q.id, opt.value);
        FLATUP.trackAnswer(q.id, opt.value);
        go(opt.next || q.next || "result");
      });
      opts.appendChild(b);
    });
    children.push(opts);

    var sub = el("div", { class: "subactions" });
    var backBtn = el("button", { class: "ghost", type: "button", text: "← 戻る" });
    backBtn.addEventListener("click", goBack);
    sub.appendChild(backBtn);
    if (q.skippable) {
      var skip = el("button", { class: "ghost", type: "button", text: "答えずに進む →" });
      skip.addEventListener("click", function () {
        FLATUP.track("question_skipped", { question: q.id });
        go(q.next || "result");
      });
      sub.appendChild(skip);
    }
    children.push(sub);

    show(el("div", {}, children));
  }

  /* ---------- 画面: 専用の結果 ---------- */

  function renderResult() {
    FLATUP.state.pushScreen("result");
    var j = FLATUP.state.get();
    var c = FLATUP.RESULT_CONTENT;
    var audience = j.audience || "consult";

    FLATUP.track("personalized_view", { audience: audience });

    var wrap = el("div", { class: "result" });
    wrap.appendChild(el("h1", { class: "q", text: c.headlines[audience] || c.headlines.consult }));
    wrap.appendChild(el("p", { class: "welcome-lead", text: c.base[audience] || c.base.consult }));

    // 回答に該当する一言だけを添える（選択していない情報は出さない）
    var hints = el("ul", { class: "hints" });
    var shown = 0;
    j.answers.forEach(function (a) {
      var key = a.questionId + ":" + a.value;
      if (c.snippets[key] && shown < 4) {
        hints.appendChild(el("li", { text: c.snippets[key] }));
        shown++;
      }
    });
    if (shown > 0) wrap.appendChild(hints);

    wrap.appendChild(el("div", { class: "reassurance", text: c.reassurance }));

    // CTAは1つだけ（迷わせない）。遷移先は同じLINEのため統合済み。
    var ctas = el("div", { class: "options" });
    var isConsult = audience === "consult";
    var primary = el("a", {
      class: "cta primary",
      href: FLATUP.CTA.lineUrl,
      target: "_blank",
      rel: "noopener",
      text: isConsult ? FLATUP.CTA.consultLabel : FLATUP.CTA.bookingLabel
    });
    primary.addEventListener("click", function () {
      FLATUP.track(isConsult ? "line_clicked" : "booking_clicked", { audience: audience });
    });
    ctas.appendChild(primary);
    wrap.appendChild(ctas);

    var sub = el("div", { class: "subactions" });
    var backBtn = el("button", { class: "ghost", type: "button", text: "← 戻る" });
    backBtn.addEventListener("click", goBack);
    var restart = el("button", { class: "ghost", type: "button", text: "最初からやり直す" });
    restart.addEventListener("click", function () {
      FLATUP.state.reset();
      renderWelcome();
    });
    sub.appendChild(backBtn);
    sub.appendChild(restart);
    wrap.appendChild(sub);

    show(wrap);
  }

  /* ---------- 遷移 ---------- */

  function go(screenId) {
    if (screenId === "result") return renderResult();
    if (screenId === "welcome") return renderWelcome();
    return renderQuestion(screenId);
  }

  function goBack() {
    var prev = FLATUP.state.back(); // 現在の画面を履歴から外し、前の画面IDを得る
    if (!prev) return renderWelcome();
    // pushScreen で再登録されるため、前の画面も履歴から一度外す
    FLATUP.state.back();
    go(prev);
  }

  /* ---------- 起動 ---------- */
  FLATUP.state.reset(); // Phase 1: リロードで最初から（途中復帰はPhase 2で検討）
  renderWelcome();
})();
