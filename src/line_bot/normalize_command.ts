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
const MORNING_ALIASES = new Set(["おはよう", "/おはよう", "おはよー", "/おはよー", "朝", "/朝", "朝の質問", "/朝の質問"]);
const SAVE_ALIASES = new Set(["保存用ログ", "/保存用ログ", "保存", "/保存"]);
const CANCEL_ALIASES = new Set(["中止", "/中止", "キャンセル", "/キャンセル"]);

export type CanonicalLineCommand =
  | "/push"
  | "/追記"
  | "/昨日の記録"
  | "/おはよう"
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
  if (SAVE_ALIASES.has(head)) return "/保存用ログ";
  if (CANCEL_ALIASES.has(head)) return "/中止";
  return undefined;
}
