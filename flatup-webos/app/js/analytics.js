/* FLAT UP WebOS — イベント計測（Phase 1はローカル記録のみ）
 * 個人情報を analytics へ送らない。送るのはイベント名と選択カテゴリまで。
 * Phase 2 で GA4 等へ接続する時は、この track() の中身だけを差し替える。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  window.dataLayer = window.dataLayer || [];
  var events = [];

  FLATUP.track = function (eventName, payload) {
    var record = {
      event: eventName,
      payload: payload || {},
      ts: new Date().toISOString()
    };
    events.push(record);
    window.dataLayer.push(record);
    if (window.console && console.debug) console.debug("[flatup-webos]", eventName, payload || {});
  };

  FLATUP.getEvents = function () { return events.slice(); };

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
