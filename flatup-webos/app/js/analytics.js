/* FLAT UP WebOS — プライバシー優先のファーストパーティ計測
 * AIKAへ送るのは、匿名セッションID・イベント名・選択カテゴリだけ。
 * 氏名・電話・自由文・IPは計測DBへ保存しない。失敗しても画面操作は止めない。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  var PROD_EVENT_ENDPOINT = "https://aika.flatupnarita.jp/webos-event";
  var SESSION_KEY = "flatup_webos_analytics_session_v1";
  window.dataLayer = window.dataLayer || [];
  var events = [];
  var debugEnabled = (function () {
    try {
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
    } catch (e) { return false; }
  })();

  function eventEndpoint() {
    if (typeof window.FLATUP_EVENT_ENDPOINT === "string") return window.FLATUP_EVENT_ENDPOINT;
    try {
      if (/(^|\.)flatupnarita\.jp$/.test(location.hostname)) return PROD_EVENT_ENDPOINT;
    } catch (e) { /* ローカル確認では送らない */ }
    return null;
  }

  function randomSessionId() {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      }
    } catch (e) { /* 下の互換処理へ */ }
    var result = "";
    for (var i = 0; i < 32; i++) result += Math.floor(Math.random() * 16).toString(16);
    return result;
  }

  function sessionId() {
    try {
      var saved = sessionStorage.getItem(SESSION_KEY);
      if (/^[a-f0-9]{32}$/.test(saved || "")) return saved;
      var created = randomSessionId();
      sessionStorage.setItem(SESSION_KEY, created);
      return created;
    } catch (e) {
      if (!sessionId.memory) sessionId.memory = randomSessionId();
      return sessionId.memory;
    }
  }

  function send(record) {
    var endpoint = eventEndpoint();
    if (!endpoint) return;
    var body = JSON.stringify({
      event: record.event,
      session_id: sessionId(),
      payload: record.payload
    });
    try {
      if (window.navigator && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(endpoint, body);
        return;
      }
      if (typeof fetch === "function") {
        fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "text/plain;charset=UTF-8" },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) { /* 計測失敗で画面を壊さない */ }
  }

  FLATUP.track = function (eventName, payload) {
    var record = {
      event: eventName,
      payload: payload || {},
      ts: new Date().toISOString()
    };
    events.push(record);
    window.dataLayer.push(record);
    send(record);
    // ローカル確認中だけログを出す。公開先のコンソールは静かに保つ。
    if (debugEnabled && window.console && console.debug) {
      console.debug("[flatup-webos]", eventName, payload || {});
    }
  };

  FLATUP.getEvents = function () { return events.slice(); };
  FLATUP.getAnalyticsSessionId = sessionId;

  // 質問ID → イベント名（docs/ANALYTICS.md の定義に対応）
  FLATUP.trackAnswer = function (questionId, value) {
    var map = {
      audience: "audience_selected",
      goal: "goal_selected",
      experience: "experience_selected",
      availability: "availability_selected"
    };
    FLATUP.track(map[questionId] || "question_answered", { question: questionId, value: value });
  };
})();
