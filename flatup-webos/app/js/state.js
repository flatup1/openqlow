/* FLAT UP WebOS — 状態管理（UserJourney）
 * 回答はブラウザの sessionStorage のみに保持。サーバーへ送信しない。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  var KEY = "flatup_webos_journey_v1";

  function emptyJourney() {
    return {
      audience: null,
      gender: null,
      goal: [],
      experience: null,
      availability: [],
      answers: [],      // { questionId, value } の履歴
      history: [],      // 表示した画面の履歴（戻る用）
      currentStep: 0
    };
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* プライベートモード等では保存なしで動く */ }
    return emptyJourney();
  }

  function save(journey) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(journey));
    } catch (e) { /* 保存できなくても体験は続行 */ }
  }

  var journey = load();

  FLATUP.state = {
    get: function () { return journey; },

    // 回答を記録する。questions.js の id に応じてプロフィールへも反映。
    answer: function (questionId, value) {
      journey.answers.push({ questionId: questionId, value: value });
      if (questionId === "audience")     journey.audience = value;
      if (questionId === "gender")       journey.gender = value;
      if (questionId === "goal")         journey.goal = [value];
      if (questionId === "experience")   journey.experience = value;
      if (questionId === "availability") journey.availability = [value];
      if (questionId === "kids_age")     journey.kidsAge = value;
      if (questionId === "kids_hope")    journey.kidsHope = [value];
      journey.currentStep += 1;
      save(journey);
    },

    pushScreen: function (screenId) {
      journey.history.push(screenId);
      save(journey);
    },

    // ひとつ前の画面IDを返す（現在の画面を捨てて戻る）
    back: function () {
      journey.history.pop();
      var prev = journey.history[journey.history.length - 1] || null;
      save(journey);
      return prev;
    },

    reset: function () {
      journey = emptyJourney();
      save(journey);
      return journey;
    }
  };
})();
