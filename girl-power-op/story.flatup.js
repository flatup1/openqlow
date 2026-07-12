// ============================================================
// story.flatup.js — FLATUP GYM 15秒版シナリオのサンプル
// ============================================================
// 使い方: このファイルの中身を story.js にコピーすると、
// 「夜のジム → 転ぶ → 小さな一発 → 朝 → 体験予約」の
// 15秒サイトヒーロー動画になります。
//
// 静かなシーン(night / fall / smallpunch / sunrise / cta)では
// BGMが自動でドラム無しのやさしい曲に切りかわります。
window.STORY = [
  { type: 'night',      sec: 3.0,  text: 'よるの FLATUP GYM…' },
  { type: 'fall',       sec: 3.0,  text: 'おっとっと!' },
  { type: 'smallpunch', sec: 3.75, text: 'できた!' },
  { type: 'sunrise',    sec: 2.25, text: '' },
  { type: 'cta',        sec: 3.0,
    title: '怖くても、大丈夫。',
    subtitle: 'はじめの一歩を、笑わない。FLATUP GYM',
    button: '500円体験を予約する' },
];
