// AIKA 移植キット — 日付と曜日の食い違いを止めるガード
//
// 2026-08-06 の実例:
//   お客様「8/8の10:45頃に改めます！」
//   AIKA  「かしこまりました😊8月8日（木曜日）10:45頃のご来館ですね。」
//   → 8月8日は**土曜日**。木曜日は「返信した当日（8/6）」の曜日だった。
//     日付は相手の発言から正しく拾えているのに、曜日だけ「今日」のものを付けてしまう型。
//
// 曜日は来館日を左右する重要な情報で、間違えるとお客様が別の日に来てしまう。
// 送信前にこのガードを通し、食い違いがあれば送らずに直す。
//
// 依存ゼロ。外部importなし。AIKA側へそのままコピーして使う。

/** 日本語の曜日（Dateの getUTCDay() と同じ並び） */
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 日付は必ず日本時間で判断する。サーバーがUTCだと深夜帯に1日ずれるため。 */
function toJst(at: Date): Date {
  return new Date(at.getTime() + 9 * 60 * 60 * 1000);
}

/** その日の曜日（日本時間）。「土」のように1文字で返す。 */
export function weekdayJa(at: Date): string {
  return WEEKDAY_JA[toJst(at).getUTCDay()];
}

/** 年月日から日本時間の Date を作る。 */
export function jstDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
}

/**
 * 「8月8日（土曜日）」の形に整える。曜日は必ず日付から計算する。
 * 返信文を組み立てるときは、曜日を手で書かずこの関数を使う。
 */
export function formatDateWithWeekday(year: number, month: number, day: number): string {
  return `${month}月${day}日（${weekdayJa(jstDate(year, month, day))}曜日）`;
}

/**
 * 年の指定がない「8月8日」がどの年かを決める。
 *
 * 基準日と同じ年をまず候補にし、それが基準日より30日以上前なら翌年とみなす。
 * 「先月の話」を来年扱いしない程度の余裕を持たせつつ、
 * 年末に「1月5日」と言われたら翌年と解釈できるようにするため。
 */
export function resolveYear(month: number, day: number, now: Date): number {
  const today = toJst(now);
  const year = today.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, day);
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = (candidate - base) / (24 * 60 * 60 * 1000);
  if (diffDays < -30) return year + 1;
  return year;
}

export interface DateWeekdayIssue {
  /** 見つかった表記そのまま（例: "8月8日（木曜日）"） */
  found: string;
  month: number;
  day: number;
  /** 文中に書かれていた曜日 */
  statedWeekday: string;
  /** 実際の曜日 */
  actualWeekday: string;
  /** 差し替えるべき正しい表記 */
  correction: string;
}

// 「8月8日（木曜日）」「8月8日(木)」などを拾う。
// NFKC正規化をかけると全角括弧「（」が半角「(」に変わってしまい、
// 元の文と一致しなくなって置換に失敗する。そのため正規化はせず、
// 全角・半角の数字と括弧を正規表現側で直接受ける。
const DATE_WEEKDAY_PATTERN =
  /([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日\s*[（(]\s*([日月火水木金土])\s*曜?\s*日?\s*[)）]/g;

/** 全角数字も受けて数値にする。 */
function toNumber(digits: string): number {
  return Number(digits.normalize("NFKC"));
}

/**
 * 文中の「M月D日（X曜日）」の曜日が正しいか検証する。
 * 食い違いがあれば、正しい表記を添えて返す。空配列なら問題なし。
 *
 * @param text 送信前の返信文
 * @param now 基準日時（年の解決に使う。省略時は現在）
 */
export function findDateWeekdayMismatches(text: string, now: Date = new Date()): DateWeekdayIssue[] {
  const issues: DateWeekdayIssue[] = [];
  const source = text ?? "";

  DATE_WEEKDAY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_WEEKDAY_PATTERN.exec(source)) !== null) {
    const month = toNumber(match[1]);
    const day = toNumber(match[2]);
    const statedWeekday = match[3];
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const year = resolveYear(month, day, now);
    const target = jstDate(year, month, day);
    // 実在しない日付（2月30日など）は曜日を判定しない
    const jst = toJst(target);
    if (jst.getUTCMonth() + 1 !== month || jst.getUTCDate() !== day) continue;

    const actualWeekday = weekdayJa(target);
    if (actualWeekday !== statedWeekday) {
      issues.push({
        found: match[0],
        month,
        day,
        statedWeekday,
        actualWeekday,
        correction: formatDateWithWeekday(year, month, day),
      });
    }
  }
  return issues;
}

/**
 * 食い違いを正しい曜日に置き換えた文を返す。
 * 送信前の自動修正に使う。問題がなければ元の文をそのまま返す。
 */
export function fixDateWeekdays(text: string, now: Date = new Date()): string {
  let out = text ?? "";
  for (const issue of findDateWeekdayMismatches(out, now)) {
    out = out.split(issue.found).join(issue.correction);
  }
  return out;
}
