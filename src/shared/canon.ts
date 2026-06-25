// FLATUP GYM 単一正本（攻めOPENQLOW・守りAIKA 共通の唯一の情報源）。
//
// 料金・スケジュール・クラス・住所・アクセス等の事実は **このファイルだけ** を真とする。
// 各AI・各返信はここを参照し、数値や住所を直書きしない（永久機関 要件 R2/R4 参照）。
// 料金改定・スケジュール変更時は、ここ1か所だけを更新する。
//
// 互換: `src/generators/shared.ts` の `FLATUP_INFO` は本ファイルの `FLATUP_CANON` を再エクスポートしている。
// 外部AIKA配布用の複製は `port/aika/flatup_canon.ts`（in-repoの正本は本ファイル）。

export const FLATUP_CANON = {
  trialFirst: "初回体験500円",
  visitorSecond: "2回目以降ビジター3,000円",
  priceKids: "キッズ7,700円",
  priceWomen: "女性8,800円",
  priceMen: "男性9,900円",
  joinFee: "入会金10,000円",
  bring: "動きやすい服・タオル・水",
  parking: "専用駐車場あり",
  gloveSet: "グローブ＋レガースのセット11,000円（体験時は貸出あり・購入は任意）",
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

export type FlatupCanon = typeof FLATUP_CANON;

// ブランドの芯（言葉でも体現する）。詳細な禁止行為は `src/safety/forbidden_actions.ts` が正本。
export const BRAND = {
  tagline: "世界一優しい格闘技ジム（太陽のジム）",
  values: ["怒鳴らない", "威圧しない", "初心者・女性・キッズ・保護者が安心", "勝ち負けより挑戦する勇気"],
} as const;
