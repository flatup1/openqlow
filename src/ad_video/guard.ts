// 広告動画: 出してはいけない表現を、生成の前に止める。
//
// 参照:
//   - 指示書 §7「表現ルール」（怖くない・怒鳴らない・比べない・置いていかない）
//   - `docs/AD_MASTER_COPY_2026-07.md` §1「審査を通すNGワード→OKワード表」（既存の正本）
//   - `src/safety/forbidden_actions.ts`（送信・公開まわりの禁止は引き続きそちらが正本）
//
// ここは「文字列を見て止めるだけ」の純関数。外へは何も送らない。

export interface GuardHit {
  /** 見つかった語（日本語 or 英語）。 */
  readonly term: string;
  /** なぜ止めるのか。 */
  readonly reason_ja: string;
  /** 代わりに使う言い方。 */
  readonly instead_ja: string;
}

export interface GuardResult {
  readonly ok: boolean;
  readonly hits: readonly GuardHit[];
}

interface Rule {
  readonly patterns: readonly string[];
  readonly reason_ja: string;
  readonly instead_ja: string;
}

// 日本語はそのまま部分一致。英単語は単語の切れ目で見る（"ko" が "kodomo" に当たらないように）。
const RULES: readonly Rule[] = Object.freeze([
  Object.freeze({
    patterns: Object.freeze(["ko", "knockout", "knocked out", "血", "blood", "bloody", "流血"]),
    reason_ja: "KO・流血は「怖い格闘技ジム」に見える。初心者が引く。",
    instead_ja: "学ぶ・始める・体験する場面にする",
  }),
  Object.freeze({
    patterns: Object.freeze(["闘う", "戦う", "バトル", "fight", "fighting", "combat", "spar", "sparring"]),
    reason_ja: "対戦の言葉は初心者に「痛そう」と伝わる。広告審査でも弾かれやすい。",
    instead_ja: "学ぶ・始める・体験する",
  }),
  Object.freeze({
    patterns: Object.freeze(["最強", "絶対", "必ず", "革命", "strongest", "guaranteed"]),
    reason_ja: "断定・誇張は広告審査で落ちる。FLATUPらしさからも外れる。",
    instead_ja: "安心・丁寧・楽しい",
  }),
  Object.freeze({
    patterns: Object.freeze(["痩せ", "激変", "-5kg", "lose weight", "weight loss"]),
    reason_ja: "体型・減量の断定は健康効果の断定になり、広告審査でも落ちる。",
    instead_ja: "健康的に・続けやすい",
  }),
  Object.freeze({
    patterns: Object.freeze(["護身", "身を守る", "self-defense", "self defense"]),
    reason_ja: "護身の訴求は不安を煽る方向になる。",
    instead_ja: "自信を育てる",
  }),
  Object.freeze({
    patterns: Object.freeze(["無料体験", "free trial"]),
    reason_ja: "料金の言い方は正本と合わせる。無料ではない。",
    instead_ja: "正本（FLATUP_CANON.trialFirst）の言い方をそのまま使う",
  }),
  Object.freeze({
    patterns: Object.freeze([
      "怒鳴",
      "怒号",
      "威圧",
      "shout",
      "shouting",
      "yell",
      "yelling",
      "aggressive",
      "intimidating",
      "intimidation",
    ]),
    reason_ja: "怒鳴らない・威圧しないがFLATUPの芯。",
    instead_ja: "横に立って、静かに丁寧に教える",
  }),
  Object.freeze({
    patterns: Object.freeze([
      "地下",
      "underground",
      "dark gym",
      "dimly lit",
      "gritty",
      "grimy",
      "cage",
      "octagon",
    ]),
    reason_ja: "暗い地下格闘技ジムの絵は、女性・保護者・初心者が最も避ける画。",
    instead_ja: "明るい・清潔・窓のある空間",
  }),
]);

/** 未成年が写る絵は保護者同意の確認が要る。生成前に人へ回す。 */
const MINOR_PATTERNS: readonly string[] = Object.freeze([
  "kid",
  "kids",
  "child",
  "children",
  "boy",
  "girl",
  "子ども",
  "子供",
  "キッズ",
]);

const ASCII_ONLY = /^[\x20-\x7e]+$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 1語が本文に出てくるか。
 * 英数字だけの語は単語の切れ目で見る。日本語は切れ目が無いので部分一致で見る。
 */
function matches(haystack: string, pattern: string): boolean {
  const needle = pattern.toLowerCase();
  if (!ASCII_ONLY.test(needle)) return haystack.includes(needle);
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`).test(haystack);
}

/** 文章1本を検査する。プロンプト・広告文・CTAのどれにも使える。 */
export function checkExpression(text: string): GuardResult {
  const haystack = text.toLowerCase();
  const hits: GuardHit[] = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (!matches(haystack, pattern)) continue;
      hits.push(
        Object.freeze({ term: pattern, reason_ja: rule.reason_ja, instead_ja: rule.instead_ja }),
      );
      break; // 同じルールで何度も報告しない
    }
  }
  return Object.freeze({ ok: hits.length === 0, hits: Object.freeze(hits) });
}

/** 未成年が写りそうかを見る。true なら保護者同意の確認まで生成しない。 */
export function mentionsMinor(text: string): boolean {
  const haystack = text.toLowerCase();
  return MINOR_PATTERNS.some(p => matches(haystack, p));
}
