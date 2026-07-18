// AIKA（守りの受付AI / flatup-ai-os）移植用 — FLATUP GYM 正本データ（確定版）。
//
// 依存ゼロ。flatup-ai-os にコピーし、返信生成・FAQ応答はこの値だけを参照する。
// 推測で変えない。値の改定時はここ1か所だけを更新する（OPENQLOW 側 src/generators/shared.ts と同期）。
// オーナー確定日: 2026-06-25。

export const FLATUP_CANON = {
  // 料金
  trialFirst: "初回体験500円",
  visitorSecond: "2回目以降ビジター3,000円",
  visitorPass6: "6回券15,000円（1年有効）",
  visitorPass12: "12回券30,000円（1年有効）",
  priceKids: "キッズ7,700円",
  priceWomen: "女性8,800円",
  priceMen: "男性9,900円",
  joinFee: "入会金10,000円",
  parentDiscount: "親子割：親子合計で月-¥500",
  referralBenefit: "紹介特典：紹介でお互いにFLATUPバンテージ進呈",
  gloveSet: "グローブ＋レガースのセット11,000円（体験時は貸出あり・購入は任意）",

  // 持ち物・設備
  bring: "動きやすい服・タオル・水",
  parking: "専用駐車場あり",

  // 場所・アクセス
  address: "成田市土屋516-4 2F（百香亭の上）",
  nearestStation: "成田駅",
  access: "成田駅からイオンモール行きのバスに乗り、イオンのバス停で下車、徒歩約5分",

  // 営業・スケジュール
  // 公式サイト照合（2026-07-18）。会員のセルフ利用とスタッフ対応時間を区別する。
  businessHours:
    "会員はカードキーで24時間セルフ利用可。スタッフ対応は平日10:00〜12:00・18:00〜21:00、土曜はクラス制、日曜・祝日休（体験・見学はスタッフ対応時間のみ）",
  selfAccess: "会員はカードキーで24時間セルフ利用可（体験・見学は対象外）",
  cancellation:
    "退会は当月末日までの申請で翌月末退会（即日不可・退会届の提出が必要）。キャンペーン適用で入会し、1年未満で退会する場合は入会金相当10,000円が発生する可能性があります。詳細は契約内容を確認。正本は cancellation_rules.md",
  suspension: "休会は原則3ヶ月。詳細はスタッフ確認。正本は cancellation_rules.md",
  classes:
    "ボクシング／キックボクシング／ムエタイ／寝技／レスリング／総合格闘技(MMA)／ブラジリアン柔術／キッズ／レディース",
  scheduleKids: "火曜・木曜18:00〜19:00、土曜13:00〜",
  scheduleLadies: "土曜14:00〜15:00",
  bookingMen: "火曜・木曜・土曜（男性インストラクター在籍）、または平日19:00以降",
  bookingWomen: "月曜・水曜・土曜",
  noBooking: "日曜・祝日は原則体験不可",
} as const;

// AIKA / OPENQLOW が侵してはいけない操作（人間 Jin の判断領域）。
// AIKA は一次受付まで。送信・確定・変更・返金は人間が行う。
export const FORBIDDEN_ACTIONS = [
  "send_to_customer_directly", // お客様への直接送信
  "confirm_reservation",       // 予約確定
  "handle_complaint",          // クレーム対応
  "process_cancellation",      // 退会処理
  "modify_member_data",        // 会員情報の変更
  "send_apology",              // 謝罪文の送信
  "change_pricing",            // 料金変更
  "issue_refund",              // 返金処理
] as const;

// ブランドの芯（言葉でも体現する）
export const BRAND = {
  tagline: "世界一優しい格闘技ジム（太陽のジム）",
  values: ["怒鳴らない", "威圧しない", "初心者・女性・キッズ・保護者が安心", "勝ち負けより挑戦する勇気"],
} as const;
