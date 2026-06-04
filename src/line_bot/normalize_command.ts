const PUSH_ALIASES = new Set(["push", "/push", "プッシュ", "ぷっしゅ"]);
const APPEND_ALIASES = new Set(["追記", "/追記"]);
const DIARY_ALIASES = new Set([
  "昨日の記録",
  "/昨日の記録",
  "きのうの記録",
  "/きのうの記録",
  "昨日の日記",
  "/昨日の日記",
  "日記",
  "/日記",
  "昨日",
  "/昨日",
]);
const MORNING_ALIASES = new Set([
  "おはよう", "/おはよう", "おはよー", "/おはよー",
  "朝", "/朝", "朝の質問", "/朝の質問",
  "日報", "/日報", "にっぽう", "/にっぽう", "daily", "/daily",
]);
const MONTHLY_ALIASES = new Set([
  "月報", "/月報", "げっぽう", "/げっぽう",
  "今月の日報", "/今月の日報", "月次", "/月次", "monthly", "/monthly",
]);
const SAVE_ALIASES = new Set(["保存用ログ", "/保存用ログ", "保存", "/保存"]);
const CANCEL_ALIASES = new Set(["中止", "/中止", "キャンセル", "/キャンセル"]);

// 連結形（"日報まとめ" のようにスペース無し）の prefix 候補。
// 長い語を先に試すため降順で並べる（"朝の質問" を "朝" より先に）。
const MORNING_HEAD_PREFIXES = [
  "朝の質問", "おはよう", "おはよー", "にっぽう", "日報", "daily", "朝",
];
const MORNING_BULK_SUFFIXES = new Set(["まとめ", "bulk", "テンプレ", "template"]);

/**
 * "日報まとめ" / "おはようbulk" のようなスペース無し連結形が
 * morning コマンド + bulk サフィックスとして解釈できるかを判定。
 * 真なら canonical は /おはよう、モードは bulk として扱う。
 */
export function matchMorningConcatenated(head: string): boolean {
  const h = head.replace(/^\//, "");
  for (const prefix of MORNING_HEAD_PREFIXES) {
    if (h.length <= prefix.length) continue;
    if (!h.startsWith(prefix)) continue;
    const suffix = h.slice(prefix.length).toLowerCase();
    if (MORNING_BULK_SUFFIXES.has(suffix)) return true;
  }
  return false;
}

export type CanonicalLineCommand =
  | "/push"
  | "/追記"
  | "/昨日の記録"
  | "/おはよう"
  | "/月報"
  | "/保存用ログ"
  | "/中止";

export function normalizeLineText(text: string): string {
  const normalized = text
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/^[\s　]*[／\/\\]/, "/")
    .replace(/^\/\s+/, "/")
    .replace(/[ \t　]+/g, " ")
    .trim();
  return normalized.replace(/^\/?[A-Za-z]+(?=$|\s)/, (head) => head.toLowerCase());
}

function commandHead(text: string): string {
  const normalized = normalizeLineText(text);
  const [head = ""] = normalized.split(/\s|\n/, 1);
  return head.toLowerCase();
}

export function canonicalLineCommand(text: string): CanonicalLineCommand | undefined {
  const head = commandHead(text);
  if (PUSH_ALIASES.has(head)) return "/push";
  if (APPEND_ALIASES.has(head)) return "/追記";
  if (DIARY_ALIASES.has(head)) return "/昨日の記録";
  if (MORNING_ALIASES.has(head)) return "/おはよう";
  if (MONTHLY_ALIASES.has(head)) return "/月報";
  if (SAVE_ALIASES.has(head)) return "/保存用ログ";
  if (CANCEL_ALIASES.has(head)) return "/中止";
  // 連結形（"日報まとめ" 等）も /おはよう として扱う
  if (matchMorningConcatenated(head)) return "/おはよう";
  return undefined;
}
