// 集客AI司令塔ジェネレータ群の共有ユーティリティ・正本値。
//
// inquiry_reply / trial_followup / ad_copy / site_audit が共通で使う:
//   - FLATUP_INFO（料金・スケジュール等の正本値）と共通型
//   - 正規表現述語（matchesAny / countMatches）
//   - AIKA 署名付きの本文組み立て（composeSigned）
//   - CLI のフラグ解析（parseFlags）と表示用セクション（section）
//
// 正本値・型をここに集約することで、各ジェネレータが互いに import し合う歪な依存を避ける。

export type Gender = "female" | "male" | "unknown";

/** 見込み客の属性分類 */
export type Attribute = "kids" | "women" | "men" | "parent_child" | "senior" | "beginner";

/** 温度感（入会への近さ） */
export type Temperature = "high" | "mid" | "low";

/**
 * FLATUP GYM 基本情報（正本値）。
 * AIはこの値を勝手に変更してはいけない。料金改定時はここだけを更新する。
 */
export const FLATUP_INFO = {
  trialFirst: "初回体験500円",
  visitorSecond: "2回目以降ビジター3,000円",
  priceKids: "キッズ7,700円",
  priceWomen: "女性8,800円",
  priceMen: "男性9,900円",
  joinFee: "入会金10,000円",
  bring: "動きやすい服・タオル・水",
  parking: "専用駐車場あり",
  address: "成田市土屋516-4 2F（百香亭の上）",
  nearestStation: "成田駅",
  access: "成田駅からイオンモール行きのバスに乗り、イオンのバス停で下車、徒歩約5分",
  scheduleKids: "火曜・木曜18:00、土曜13:00",
  scheduleLadies: "土曜14:00",
  bookingMen: "火曜・木曜・土曜（男性インストラクター在籍）、または平日19:00以降",
  bookingWomen: "月曜・水曜・土曜",
  noBooking: "日曜・祝日は原則体験不可",
  // オーナー確定（2026-06-25）。AIはこの値だけを案内し、推測で変えない。
  businessHours: "平日10:00〜12:00・18:00〜20:00、土曜はクラス制、日曜・祝日休",
  classes:
    "ボクシング／キックボクシング／ムエタイ／寝技／レスリング／総合格闘技(MMA)／ブラジリアン柔術／キッズ／レディース",
  parentDiscount: "親子割：親子合計で月-¥500",
  referralBenefit: "紹介特典：紹介でお互いにFLATUPバンテージ進呈",
} as const;

/** AIKA 返信の署名 */
export const AIKA_SIGN = "AIKA";

/** いずれかのパターンにマッチするか。 */
export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

/** マッチしたパターンの数を数える。 */
export function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

/** 空行を除いた本文を改行で連結し、末尾に「AIKA」署名を付ける。 */
export function composeSigned(lines: string[]): string {
  return [...lines.filter(Boolean), AIKA_SIGN].join("\n");
}

/**
 * CLI 引数を `--key value` フラグと位置引数に分解する。
 * 値の無いフラグ（次が別フラグ/末尾）は空文字になる。
 */
export function parseFlags(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      flags[key] = value;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

/** CLI 表示用の「■ タイトル + 本文」セクション。 */
export function section(title: string, body: string): string {
  return `\n■ ${title}\n${body}`;
}
