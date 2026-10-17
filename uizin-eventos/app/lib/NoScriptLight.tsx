/**
 * JavaScript が切ってあるブラウザでも、会長の画面（/private/…）と申し込みページ（/apply/）が、
 * 黒い背景のままにならないようにする（明るい背景に、黒い文字）。
 * 動かない理由は、いちばん上の黄色の ⚠ の文（app/layout.tsx の noscript）が説明する。
 * 外へは何も送らない。HTML に書き込まれるだけの、ごく小さな CSS。
 */
const LIGHT = 'html,body{background-color:#eef2f8!important;color:#0f172a!important;color-scheme:light}';

export function NoScriptLight() {
  return (
    <noscript>
      <style dangerouslySetInnerHTML={{ __html: LIGHT }} />
    </noscript>
  );
}
