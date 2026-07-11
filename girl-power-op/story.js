// ============================================================
// story.js — 物語の設計図(シナリオ)
// ============================================================
// このファイルに「どのシーンを・何秒・どんな文字で」並べるかを書くと、
// index.html がその通りにアニメを組み立てます。
// プログラムを触らずに、物語だけを編集できるファイルです。
//
// ▼ 使えるシーンの種類(type)
//   entrance … 登場(ズームインでキャラが現れる)   文字: text
//   punch    … パンチ連打(ハートが飛び散る)        文字: text(かけ声)
//   closeup  … 顔のクローズアップ + 集中線          文字: text
//   jump     … ぴょんぴょんジャンプ                  文字: text
//   sky      … 空をふわふわ飛ぶ                      文字: text
//   finale   … 紙吹雪 + ロゴ                          文字: title, subtitle
//
// ▼ どのシーンにも書けるオプション
//   sec    … シーンの長さ(秒)。0.375 の倍数だと音楽の拍とピッタリ合う
//   text   … 画面に出る文字。'' にすると文字なし
//   c1, c2 … 背景の2色(entrance / punch / jump / finale で有効)
//
// ▼ 例: サイトのトップ用に15秒版が欲しいとき(コピーして置きかえてOK)
//   window.STORY = [
//     { type: 'entrance', sec: 3.75, text: 'ようこそ!' },
//     { type: 'punch',    sec: 3.75, text: 'えい!' },
//     { type: 'jump',     sec: 3.0,  text: 'ジャンプ!' },
//     { type: 'finale',   sec: 4.5,  title: 'はじめの一歩を、笑わない。', subtitle: 'FLATUP GYM' },
//   ];
window.STORY = [
  { type: 'entrance', sec: 4.5, text: 'HERE SHE COMES!' },
  { type: 'punch',    sec: 4.5, text: 'POW!' },
  { type: 'closeup',  sec: 4.5, text: 'FIGHT!' },
  { type: 'jump',     sec: 4.5, text: 'JUMP!' },
  { type: 'sky',      sec: 4.5, text: 'SO STRONG!' },
  { type: 'finale',   sec: 7.5, title: 'GIRL POWER!', subtitle: 'KICKBOXING GIRL' },
];
