// ============================================================
// story.flatup.js — FLATUP GYM 物語版シナリオ(「優しさの継承」入り)
// ============================================================
// 使い方: このファイルの中身を story.js にコピーすると、
// 「夜のジム → つまずき → はじめの一歩 → 朝 → 優しさの継承 → 体験予約」の
// 約16秒サイトヒーロー動画になります。
//
// Bible の感情アーク(①興味→②共感→③安心→④小さな挑戦→⑤喜び→
// ⑥優しさの継承→⑦行動)にそのまま対応。
// 静かなシーン(night / fall / smallpunch / sunrise / help / cta)では
// BGMが自動でドラム無しのやさしい曲に切りかわります。
window.STORY = [
  { type: 'night',      sec: 2.5,  text: 'よるの FLATUP GYM…' },
  { type: 'fall',       sec: 2.5,  text: 'おっとっと!' },
  { type: 'smallpunch', sec: 3.0,  text: 'できた!' },
  { type: 'sunrise',    sec: 2.0,  text: '' },
  { type: 'help',       sec: 3.0,  text: 'ぼくも、最初は怖かったよ。' },
  { type: 'cta',        sec: 3.0,
    title: '怖くても、大丈夫。',
    subtitle: 'はじめの一歩を、笑わない。FLATUP GYM',
    button: '500円体験を予約する',
    href: 'https://lin.ee/cTSDajPz' },  // 公式LINE予約(ループ再生時に本物のリンクを重ねる)
];
