/* FLAT UP WebOS — AIコンシェルジュ / LINE引き継ぎ
 * One Brain / Multiple Interfaces（docs/AI_CONCIERGE.md）。
 * 回答（カテゴリのみ・PIIなし）をVPSへ預けて journey_id を受け取り、
 * LINEには journey_id だけを「入力済みメッセージ」で渡す。
 * 回答値そのものはURLに一切出さない。
 * VPSに届かない時は従来の友だち追加リンクへ静かに戻る（体験を壊さない）。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  var LINE_OA_ID = "@jfl0054o"; // FLAT UP GYM 公式LINE（末尾は英字o）
  var PROD_JOURNEY_ENDPOINT = "https://aika.flatupnarita.jp/journey";
  var pending = null; // 直前に送った回答と、その通信（同じ回答の二重送信を防ぐ）

  // 本番ドメインでのみVPSへ送る。ローカル確認・テストでは window.FLATUP_JOURNEY_ENDPOINT で差し替え可。
  function journeyEndpoint() {
    if (typeof window.FLATUP_JOURNEY_ENDPOINT === "string") return window.FLATUP_JOURNEY_ENDPOINT;
    if (/(^|\.)flatupnarita\.jp$/.test(location.hostname)) return PROD_JOURNEY_ENDPOINT;
    return null;
  }

  FLATUP.concierge = {
    // Phase 1 では対話AI本体は未接続
    isAvailable: function () { return false; },

    // Webでの回答から、AIへ渡す安全なコンテキストを組み立てる（PIIなし）
    buildContext: function (journey) {
      return {
        source: "webos",
        audience: journey.audience || null,
        gender: journey.gender || null,
        goal: journey.goal || [],
        experience: journey.experience || null,
        availability: journey.availability || [],
        kidsAge: journey.kidsAge || null,
        kidsHope: journey.kidsHope || []
      };
    },

    // 回答をVPSへ預けて journey_id を受け取る。失敗時は null（フォールバック）。
    // 3秒で諦めて、ユーザーを待たせない。
    submitJourney: function (journey) {
      var endpoint = journeyEndpoint();
      if (!endpoint || typeof fetch !== "function") return Promise.resolve(null);
      var ctx = this.buildContext(journey);
      // 「← 戻る」で結果画面を開き直しても、同じ回答なら二重にコードを作らない。
      var fingerprint = JSON.stringify(ctx);
      if (pending && pending.fingerprint === fingerprint) return pending.promise;
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 3000) : null;
      var request = fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: ctx }),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (timer) clearTimeout(timer);
          return data && data.ok && typeof data.journey_id === "string" ? data.journey_id : null;
        })
        .catch(function () {
          if (timer) clearTimeout(timer);
          return null;
        });
      pending = { fingerprint: fingerprint, promise: request };
      return request;
    },

    // journey_id があれば「コード入力済みでトークが開く」公式リンク。無ければ従来の友だち追加。
    buildLineHandoffUrl: function (journeyId) {
      if (journeyId) {
        return "https://line.me/R/oaMessage/" + encodeURIComponent(LINE_OA_ID) + "/?" + encodeURIComponent(journeyId);
      }
      return FLATUP.CTA.lineUrl;
    },

    open: function (journey) {
      FLATUP.track("chat_opened", { available: false });
      return this.buildLineHandoffUrl(null);
    }
  };
})();
