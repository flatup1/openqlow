// 会員（承認者以外）へ自動返信してよいかを決める、たった1つの関門。
//
// なぜ1か所に集めるか:
//   会員へ返信できる経路が増えるたびに各所で判定を書くと、必ずどこかが素通りになる。
//   実際、退会OSはロックしていたのに Brand Growth ルーティングは素通りしていた。
//   「会員へ届くかどうか」の判断はこのファイルだけが持つ。
//
// 既定は「送らない」。`AGENTS.md` の「送信は人間承認後」に合わせ、
// オーナーが2つのスイッチを明示的に入れたときだけ会員へ届く。

/** 会員へ自動返信してよいか。既定は false（送らない）。 */
export function isMemberAutoReplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // ① この機能を使う意思表示
  if (env.OPENQLOW_WITHDRAWAL_AUTO_REPLY !== "true") return false;
  // ② 本番反映の総合スイッチ。DRY_RUN の間はどの経路からも会員へ届かない。
  return env.OPENQLOW_DRY_RUN === "false";
}

/**
 * 会員向けの処理結果に、返信可否の最終判断を上書きする。
 *
 * 各ハンドラが `replyToSender: true` を返してきても、関門が閉じていれば閉じたまま。
 * ハンドラ側の実装ミスや新規追加が、そのまま会員への誤送信にならないようにする。
 */
export function sealMemberReply<T extends Record<string, unknown>>(
  result: T,
  enabled: boolean = isMemberAutoReplyEnabled(),
): T & { replyToSender: boolean } {
  return { ...result, replyToSender: enabled === true && result.replyToSender === true };
}
