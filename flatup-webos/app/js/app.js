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

  /* ブラウザ（スマホ）の戻るボタンで、前の質問へ戻れるようにする。
   * 画面ごとに履歴を1つ積み、popstate で描画する。
   * file:// で開いた時など pushState が使えない環境では、静かに無効化する。 */
  var historyEnabled = false;
  var restoring = false; // popstate 由来の描画中は履歴を積まない
  try {
    if (window.history && typeof history.pushState === "function" && location.protocol !== "file:") {
      history.replaceState({ flatup: "welcome" }, "");
      historyEnabled = true;
    }
  } catch (e) { historyEnabled = false; }

  function syncHistory(screenId, mode) {
    if (!historyEnabled || restoring) return;
    try {
      if (mode === "replace") history.replaceState({ flatup: screenId }, "");
      else history.pushState({ flatup: screenId }, "");
    } catch (e) { /* 履歴が使えなくても画面は動く */ }
  }

  function show(screenNode, screenId, mode) {
    root.textContent = "";
    screenNode.classList.add("screen");
    root.appendChild(screenNode);
    var h = screenNode.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
    syncHistory(screenId, mode);
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

  function renderWelcome(welcomeMode) {
    FLATUP.state.pushScreen("welcome");

    // FLAT UP GYMで撮影した実写が主役。写真の上に短いコピーを重ねる。
    // ファイルが無い場合は写真ブロックごと消え、レイアウトは壊れない。
    var photo = el("img", {
      class: "welcome-photo",
      src: "hero.jpg",
      alt: "FLAT UP GYMで、先生が小さなお子さんのミット練習を優しく見守っている様子",
      width: "800", height: "600", decoding: "async"
    });
    var hero = el("div", { class: "hero" }, [
      photo,
      el("div", { class: "hero-overlay" }),
      el("div", { class: "hero-copy" }, [
        el("span", { class: "hero-eyebrow", text: "世界一、初心者にやさしい格闘技ジム" }),
        el("h1", { class: "hero-title", text: "はじめの一歩を、安心から。" })
      ])
    ]);
    photo.addEventListener("error", function () { hero.style.display = "none"; });

    var lead = el("p", { class: "welcome-lead" });
    lead.innerHTML = "ここは、強い人だけの場所ではありません。<br>あなたに合った道を、一緒に探します。";

    var start = el("button", { class: "cta start opt", type: "button", text: "自分に合う始め方を見つける" });
    start.addEventListener("click", function () {
      FLATUP.track("webos_started", {});
      go(FLATUP.FLOW_START);
    });

    var note = el("p", { class: "note", text: "かんたんな質問に、タップで答えるだけ。30秒ほどで終わります。" });

    show(el("div", {}, [hero, lead, el("div", { class: "options" }, [start]), note]), "welcome", welcomeMode);
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
    var answered = false; // 二重タップ防止
    q.options.forEach(function (opt) {
      var b = el("button", { class: "opt", type: "button", text: opt.label });
      b.addEventListener("click", function () {
        if (answered) return;
        answered = true;
        b.classList.add("chosen"); // 選んだことが伝わる小さな返事
        var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        setTimeout(function () {
          FLATUP.state.answer(q.id, opt.value);
          FLATUP.trackAnswer(q.id, opt.value);
          go(opt.next || q.next || "result");
        }, reduce ? 0 : 160);
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

    show(el("div", {}, children), id);
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

    // CTA直前の「最後の安心」（押し売りではなく、不安をひとつ外す一言）
    wrap.appendChild(el("p", { class: "final-nudge", text: "大丈夫。最初はみんな初心者です。" }));

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

    // LINE引き継ぎ: 回答をVPSへ預け、成功したらCTAを「コード入力済みリンク」へ差し替える。
    // 失敗しても従来リンクのまま（体験は劣化しない）。
    var handoffNote = el("p", { class: "note handoff-note" });
    wrap.appendChild(handoffNote);
    FLATUP.concierge.submitJourney(j).then(function (journeyId) {
      if (!journeyId) return;
      primary.setAttribute("href", FLATUP.concierge.buildLineHandoffUrl(journeyId));
      handoffNote.textContent =
        "ボタンを押すとLINEが開き、引き継ぎコード（" + journeyId + "）が入力済みになります。" +
        "そのまま送信するだけで回答内容が伝わり、同じ質問はされません。";
      FLATUP.track("journey_created", { audience: audience });
    });

    var sub = el("div", { class: "subactions" });
    var backBtn = el("button", { class: "ghost", type: "button", text: "← 戻る" });
    backBtn.addEventListener("click", goBack);
    var restart = el("button", { class: "ghost", type: "button", text: "最初からやり直す" });
    restart.addEventListener("click", function () {
      FLATUP.state.reset();
      renderWelcome("replace");
    });
    sub.appendChild(backBtn);
    sub.appendChild(restart);
    wrap.appendChild(sub);

    show(wrap, "result");
  }

  /* ---------- 遷移 ---------- */

  function go(screenId) {
    if (screenId === "result") return renderResult();
    if (screenId === "welcome") return renderWelcome();
    return renderQuestion(screenId);
  }

  function goBack() {
    // ブラウザ履歴が使えるときは history.back() に任せる（popstate が描画する）。
    // 画面内の「← 戻る」とスマホの戻るボタンで、同じ動きになる。
    if (historyEnabled) { history.back(); return; }
    var prev = FLATUP.state.back(); // 現在の画面を履歴から外し、前の画面IDを得る
    if (!prev) return renderWelcome();
    // pushScreen で再登録されるため、前の画面も履歴から一度外す
    FLATUP.state.back();
    go(prev);
  }

  // スマホの戻るボタン。ブラウザ側はすでに1つ戻っているので、履歴は積み直さない。
  if (historyEnabled) {
    window.addEventListener("popstate", function (e) {
      var target = (e && e.state && e.state.flatup) || "welcome";
      restoring = true;
      try {
        FLATUP.state.back(); // いま表示している画面を内部履歴から外す
        go(target);
      } finally {
        restoring = false;
      }
    });
  }

  /* ---------- 起動 ---------- */
  FLATUP.state.reset(); // Phase 1: リロードで最初から（途中復帰はPhase 2で検討）
  renderWelcome("replace");
})();
