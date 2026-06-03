// CRM ログ Markdown 生成器
// セッション内の genre 回答群を、Obsidian 用 Markdown に整形する。
// プライバシールールが既に適用された前提（session_store に保存される段階で sanitise 済み）。

import fs from "node:fs/promises";
import path from "node:path";
import type { ConversationSession, Genre, GenreEntry } from "./session_store.js";
import { obsidianPath } from "../utils/paths.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { assertNoForbiddenContent } from "../privacy/rules.js";

const CRM_LOG_DIRECTORY_RELATIVE = "6_システム/openqlow_crm_logs";

const GENRE_SECTION_TITLE: Record<Genre, string> = {
  trial: "## 昨日の体験",
  enrollment: "## 昨日の入会",
  inquiry: "## 昨日の問い合わせ",
  member_change: "## 気になる会員",
  other: "## その他のメモ",
  morning: "## 朝の整理（6 問）",
};

const GENRE_TAG: Record<Genre, string> = {
  trial: "trial",
  enrollment: "enrollment",
  inquiry: "inquiry",
  member_change: "member_change",
  other: "other",
  morning: "morning",
};

export interface CrmLogRenderOptions {
  /** 日付（JST）。省略時は現在日時から算出。 */
  dateJst?: string;
  /** 出力時のタイムゾーン。デフォルト Asia/Tokyo。 */
  timeZone?: string;
  /** Now 関数（テスト用） */
  now?: () => Date;
}

function entryToMarkdown(entry: GenreEntry, index: number): string {
  const lines: string[] = [];
  if (index > 0) {
    lines.push(`### ${GENRE_SECTION_TITLE[entry.type].replace(/^##\s*/, "")} ${index + 1}`);
  }
  for (const ans of entry.answers) {
    // value が空文字 / なし は省略
    const trimmed = ans.answer?.trim?.() ?? "";
    if (!trimmed || trimmed === "なし") continue;
    lines.push(`- ${ans.key}: ${trimmed}`);
  }
  return lines.join("\n");
}

function groupByGenre(genres: GenreEntry[]): Map<Genre, GenreEntry[]> {
  const map = new Map<Genre, GenreEntry[]>();
  for (const g of genres) {
    const arr = map.get(g.type) ?? [];
    arr.push(g);
    map.set(g.type, arr);
  }
  return map;
}

function buildFrontMatter(dateJst: string, tags: string[]): string {
  const cleanTags = ["FLATUP", "CRM", ...tags];
  const lines = [
    "---",
    `date: ${dateJst}`,
    "type: daily_crm_log",
    "gym: FLATUP GYM",
    "tags:",
    ...cleanTags.map(t => `  - ${t}`),
    `created_at: ${new Date().toISOString()}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

export function renderCrmLogMarkdown(session: ConversationSession, options: CrmLogRenderOptions = {}): {
  markdown: string;
  dateJst: string;
} {
  const now = options.now ? options.now() : new Date();
  const dateJst = options.dateJst ?? formatDateInTimeZone(now, options.timeZone ?? "Asia/Tokyo");

  const grouped = groupByGenre(session.genres);
  const usedGenres: Genre[] = Array.from(grouped.keys());
  const tags = usedGenres.map(g => GENRE_TAG[g]);
  const frontMatter = buildFrontMatter(dateJst, tags);

  const sections: string[] = [];
  sections.push(`# FLATUP GYM 日次 CRM ログ`);
  sections.push("");
  sections.push(`## 日付\n${dateJst}`);
  sections.push("");

  if (session.genres.length === 0) {
    sections.push("## 記録なし");
    sections.push("- 昨日は特記事項なし。");
    sections.push("");
  } else {
    for (const genre of usedGenres) {
      const entries = grouped.get(genre)!;
      sections.push(GENRE_SECTION_TITLE[genre]);
      sections.push("");
      entries.forEach((entry, idx) => {
        sections.push(entryToMarkdown(entry, idx));
        sections.push("");
      });
    }
  }

  sections.push("## AI メモ");
  sections.push(`- 記録時刻: ${now.toISOString()}`);
  sections.push(`- ジャンル数: ${usedGenres.length}`);
  sections.push(`- エントリ数: ${session.genres.length}`);
  sections.push("- 次の振り返りで使えるか、金曜の振り返り時に確認すること。");
  sections.push("");

  const markdown = frontMatter + sections.join("\n").trimEnd() + "\n";

  // 最終チェック：個人情報（連絡先等）が混入していないか
  assertNoForbiddenContent(markdown, "crm_log_generator.renderCrmLogMarkdown");

  return { markdown, dateJst };
}

export interface SaveCrmLogResult {
  filePath: string;
  dateJst: string;
  bytes: number;
  appended: boolean;
}

/**
 * Obsidian Vault に CRM ログを書き出す。
 * 同日に既存ファイルがあれば末尾に追記（区切り線 + 時刻）する。
 */
export async function saveCrmLog(session: ConversationSession, options: CrmLogRenderOptions = {}): Promise<SaveCrmLogResult> {
  const { markdown, dateJst } = renderCrmLogMarkdown(session, options);

  const dir = obsidianPath(CRM_LOG_DIRECTORY_RELATIVE);
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${dateJst}.md`;
  const filePath = path.join(dir, fileName);

  let appended = false;
  try {
    const existing = await fs.readFile(filePath, "utf-8");
    // 既存があれば区切り線 + 追記。frontmatter は重複させない（追記分は素のセクションのみ）。
    const appendBlock = [
      "",
      "---",
      "",
      `## 追記: ${new Date().toISOString()}`,
      "",
      markdown.replace(/^---[\s\S]*?---\n/, ""), // front matter を剥がす
    ].join("\n");
    await fs.writeFile(filePath, existing + appendBlock);
    appended = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.writeFile(filePath, markdown);
    } else {
      throw error;
    }
  }

  const stats = await fs.stat(filePath);
  return { filePath, dateJst, bytes: stats.size, appended };
}
