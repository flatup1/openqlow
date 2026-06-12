// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — 公開キット生成（外部公開を簡単に × 安全そのまま）
//
// 承認済みドラフトを「コピー用本文 ＋ X/Threads の投稿画面起動リンク」に変換する。
// ネットワーク送信も自動投稿も一切しない。最後に投稿を押すのは人間のまま＝安全モデル不変。
//
// 安全のおまけ(C): 起動リンクを作る直前に checkDraftSafety をもう一度回す（再ゲート）。
// 承認後に本文を手直ししていても、危険・営業CTA等が混ざっていればリンクを作らない。
//
// 捨てやすさ:
//   - 依存ゼロ・純関数。adapters/publish(Codex領域)には触らない。
//   - 構造的な型で受けるので types.ts にも依存しない。
//   - LINEへ流す配線(B)は Codex領域なので、ここでは「キットを作る」までに留める。
//   - 撤去はこのファイルと publish_kit.test.ts を消すだけ。
// ─────────────────────────────────────────────────────────────────────────

import { checkDraftSafety } from "../safety/check.js";

/** publish_kit が受け取る最小のドラフト形（PlatformDraft の部分集合）。 */
export interface DraftInput {
  platform: string;
  body: string;
  hashtags?: string[];
}

export type LaunchKind = "x_intent" | "threads_intent" | "copy_only";

export interface PublishKitItem {
  platform: string;
  /** 実際に投稿される最終テキスト（本文＋ハッシュタグ）。コピー用。 */
  finalText: string;
  /** 再安全チェックを通ったか。false ならリンクは作らない。 */
  safe: boolean;
  /** ブロック理由（severity=block のメッセージ）。 */
  blockedReasons: string[];
  /** 警告（severity=warn のメッセージ）。 */
  warnings: string[];
  /** 投稿画面を本文入りで開くリンク。プリフィル不可の媒体・非安全・長さ超過時は null。 */
  launchUrl: string | null;
  launchKind: LaunchKind;
  /** 画像添付のリマインド。リンクでは画像を渡せないので手で付ける案内。不要なら null。 */
  mediaHint: string | null;
  /** 最終テキストの文字数（絵文字・サロゲートペアを1字として数える）。 */
  charCount: number;
  /** この媒体の文字数上限。上限なしの媒体は null。 */
  charLimit: number | null;
  /** 文字数が上限以内か。超過していると起動リンクは作らない。 */
  withinLimit: boolean;
}

export interface PublishKit {
  recordId?: string;
  items: PublishKitItem[];
  /** 全ドラフトが安全に通ったか。 */
  allSafe: boolean;
}

function renderFinalText(body: string, hashtags: string[] = []): string {
  const tags = hashtags
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  return tags ? `${body.trim()}\n\n${tags}` : body.trim();
}

// 媒体ごとの文字数上限（運用ポリシー）。X は短く刺すため 140 字に絞る。上限なしは未設定。
const CHAR_LIMITS: Record<string, number> = {
  x: 140,
};

// 絵文字やサロゲートペアを1字として数える（[...str].length は code point 単位）。
function countChars(text: string): number {
  return [...text].length;
}

// 各 SNS の「投稿画面を本文入りで開く」公式 intent エンドポイント。
// X / Threads は text プリフィルに対応。Instagram 等はフィード投稿のプリフィルが無い。
function buildLaunchUrl(platform: string, finalText: string): { url: string | null; kind: LaunchKind } {
  const encoded = encodeURIComponent(finalText);
  switch (platform) {
    case "x":
      return { url: `https://twitter.com/intent/tweet?text=${encoded}`, kind: "x_intent" };
    case "threads":
      return { url: `https://www.threads.net/intent/post?text=${encoded}`, kind: "threads_intent" };
    default:
      return { url: null, kind: "copy_only" }; // instagram / line / youtube はコピー運用
  }
}

// 起動リンク／コピー運用のどちらでも、画像は本文と一緒に自動では渡せない（媒体・ブラウザの仕様）。
// 「手で1枚付ける」案内を媒体ごとに出す。instagram は画像必須なので強めの文言。
function mediaHintFor(platform: string): string | null {
  switch (platform) {
    case "instagram":
      return "📷 画像が必須です。投稿画面で写真（または動画）を選んでください。";
    case "x":
    case "threads":
      return "📷 写真を付けたい場合は、開いた投稿画面で画像ボタンから1枚選んでください（本文は入力済み）。";
    default:
      return null;
  }
}

export function buildKitItem(draft: DraftInput): PublishKitItem {
  const finalText = renderFinalText(draft.body, draft.hashtags);
  const safety = checkDraftSafety(finalText); // ← 公開直前の再ゲート(C)
  const blockedReasons = safety.issues.filter(i => i.severity === "block").map(i => i.message);
  const warnings = safety.issues.filter(i => i.severity === "warn").map(i => i.message);

  const charCount = countChars(finalText);
  const charLimit = CHAR_LIMITS[draft.platform] ?? null;
  const withinLimit = charLimit === null || charCount <= charLimit;

  // 起動リンクは「安全」かつ「長さが上限以内」のときだけ作る。超過分は人が削ってから。
  const canLaunch = safety.ok && withinLimit;
  const launch = canLaunch ? buildLaunchUrl(draft.platform, finalText) : { url: null, kind: "copy_only" as LaunchKind };

  return {
    platform: draft.platform,
    finalText,
    safe: safety.ok,
    blockedReasons,
    warnings,
    launchUrl: launch.url,
    launchKind: launch.kind,
    mediaHint: safety.ok ? mediaHintFor(draft.platform) : null,
    charCount,
    charLimit,
    withinLimit,
  };
}

export function buildPublishKit(record: { id?: string; drafts: DraftInput[] }): PublishKit {
  const items = record.drafts.map(buildKitItem);
  return {
    recordId: record.id,
    items,
    allSafe: items.every(item => item.safe),
  };
}

export function formatKitItem(item: PublishKitItem): string {
  if (!item.safe) {
    return [
      `[${item.platform}] ⛔ ブロック（公開キットは作りません）`,
      ...item.blockedReasons.map(r => `    - ${r}`),
    ].join("\n");
  }
  const count =
    item.charLimit !== null
      ? `  文字数: ${item.charCount} / ${item.charLimit}`
      : `  文字数: ${item.charCount}`;
  const overBy = item.charLimit !== null ? item.charCount - item.charLimit : 0;
  const launch = item.withinLimit
    ? item.launchUrl
      ? `起動リンク: ${item.launchUrl}`
      : "起動リンク: なし（コピーして手動投稿）"
    : `起動リンク: なし（${overBy}字オーバー。${item.charLimit}字以内に縮めてください）`;
  const warn = item.warnings.length ? `\n  ⚠ ${item.warnings.join(" / ")}` : "";
  const media = item.mediaHint ? `\n  ${item.mediaHint}` : "";
  const head = item.withinLimit ? `[${item.platform}] ✅ 安全チェック済み` : `[${item.platform}] ⚠ 文字数オーバー`;
  return [
    head,
    count,
    `  ${launch}${warn}${media}`,
    `  --- コピー用 ---`,
    item.finalText
      .split("\n")
      .map(line => `  ${line}`)
      .join("\n"),
  ].join("\n");
}

export function formatPublishKit(kit: PublishKit): string {
  const head = kit.recordId ? `公開キット: ${kit.recordId}` : "公開キット";
  return [head, "", ...kit.items.map(formatKitItem)].join("\n\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────
//   tsx src/distribution/publish_kit.ts --platform x --tags 成田市,格闘技 "本文..."
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  let platform = "x";
  let tags: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--platform") platform = argv[++i] ?? "x";
    else if (argv[i] === "--tags") tags = (argv[++i] ?? "").split(",").map(t => t.trim()).filter(Boolean);
    else rest.push(argv[i]);
  }
  const body = rest.join(" ");
  if (!body.trim()) {
    console.error("本文が空です。引数で本文を渡してください。");
    process.exit(1);
  }
  console.log(formatKitItem(buildKitItem({ platform, body, hashtags: tags })));
}
