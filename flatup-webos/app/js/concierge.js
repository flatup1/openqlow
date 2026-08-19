/* FLAT UP WebOS — AIコンシェルジュ接続インターフェース（Phase 1はスタブ）
 * One Brain / Multiple Interfaces（docs/AI_CONCIERGE.md）。
 * Phase 2 で VPS 上の共通AI（LINEと同じ頭脳）へ接続する。
 * コンテキストとして渡すのはカテゴリ情報のみ。PIIは渡さない。
 */
window.FLATUP = window.FLATUP || {};

(function () {
  FLATUP.concierge = {
    // Phase 1 では未接続
    isAvailable: function () { return false; },

    // Webでの回答から、AIへ渡す安全なコンテキストを組み立てる（PIIなし）
    buildContext: function (journey) {
      return {
        source: "webos",
        audience: journey.audience || null,
        goal: journey.goal || [],
        experience: journey.experience || null,
        availability: journey.availability || [],
        kidsAge: journey.kidsAge || null,
        kidsHope: journey.kidsHope || []
      };
    },

    // Phase 2: VPSのWebチャットAPIへ context を渡して開く。
    // Phase 1: LINE（人間スタッフ+既存bot）への優しい橋渡しのみ。
    open: function (journey) {
      FLATUP.track("chat_opened", { available: false });
      return this.buildLineHandoffUrl(journey);
    },

    // LINEへの導線。lin.ee には任意パラメータを渡せないため、
    // コンテキスト引き継ぎは Phase 2（LIFF / WebチャットAPI）で実装する。
    buildLineHandoffUrl: function (_journey) {
      return FLATUP.CTA.lineUrl;
    }
  };
})();
