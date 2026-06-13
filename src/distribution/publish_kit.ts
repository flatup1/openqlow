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

// 絵文字やサロゲートペアを1字として数える（[...str].length は code point 単位）。
function countChars(text: string): number {
  return [...text].length;
}

// 媒体ごとの挙動を1か所に集約（単一の真実）。媒体を足すときはここに1エントリ追加するだけ。
//   intent   : 投稿画面を本文入りで開く公式 intent URL を作る関数。プリフィル不可なら null。
//   charLimit: 文字数上限（運用ポリシー）。上限なしは null。
//   mediaHint: 画像はリンクで渡せないため手で付ける案内。不要なら null。
interface PlatformConfig {
  intent: ((encoded: string) => string) | null;
  launchKind: LaunchKind;
  charLimit: number | null;
  mediaHint: string | null;
}

const IMAGE_OPTIONAL_HINT = "📷 写真を付けたい場合は、開いた投稿画面で画像ボタンから1枚選んでください（本文は入力済み）。";

const PLATFORMS: Record<string, PlatformConfig> = {
  // X は短く刺すため 140 字に絞る。
  x: {
    intent: encoded => `https://twitter.com/intent/tweet?text=${encoded}`,
    launchKind: "x_intent",
    charLimit: 140,
    mediaHint: IMAGE_OPTIONAL_HINT,
  },
  threads: {
    intent: encoded => `https://www.threads.net/intent/post?text=${encoded}`,
    launchKind: "threads_intent",
    charLimit: null,
    mediaHint: IMAGE_OPTIONAL_HINT,
  },
  // instagram はフィード投稿のプリフィルが無くコピー運用。画像は必須。
  instagram: {
    intent: null,
    launchKind: "copy_only",
    charLimit: null,
    mediaHint: "📷 画像が必須です。投稿画面で写真（または動画）を選んでください。",
  },
};

// 未知の媒体（line / youtube 等）はリンク・上限・案内なしのコピー運用。
const DEFAULT_PLATFORM: PlatformConfig = { intent: null, launchKind: "copy_only", charLimit: null, mediaHint: null };

function platformConfig(platform: string): PlatformConfig {
  return PLATFORMS[platform] ?? DEFAULT_PLATFORM;
}

export function buildKitItem(draft: DraftInput): PublishKitItem {
  const finalText = renderFinalText(draft.body, draft.hashtags);
  const cfg = platformConfig(draft.platform);

  const safety = checkDraftSafety(finalText); // ← 公開直前の再ゲート(C)
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  for (const issue of safety.issues) {
    if (issue.severity === "block") blockedReasons.push(issue.message);
    else if (issue.severity === "warn") warnings.push(issue.message);
  }

  const charCount = countChars(finalText);
  const withinLimit = cfg.charLimit === null || charCount <= cfg.charLimit;

  // 起動リンクは「安全」かつ「長さが上限以内」かつ「プリフィル対応媒体」のときだけ作る。
  const canLaunch = safety.ok && withinLimit && cfg.intent !== null;
  const launchUrl = canLaunch ? cfg.intent!(encodeURIComponent(finalText)) : null;

  return {
    platform: draft.platform,
    finalText,
    safe: safety.ok,
    blockedReasons,
    warnings,
    launchUrl,
    launchKind: launchUrl ? cfg.launchKind : "copy_only",
    mediaHint: safety.ok ? cfg.mediaHint : null,
    charCount,
    charLimit: cfg.charLimit,
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
