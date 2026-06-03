import path from "node:path";
import type { PublishDestination } from "./publisher_types.js";

export type MediaRuleIssueCode =
  | "missing_media"
  | "unsupported_media_type"
  | "too_many_hashtags"
  | "too_many_media_files"
  | "media_url_required";

export interface MediaRuleIssue {
  destination?: PublishDestination;
  code: MediaRuleIssueCode;
  message: string;
}

export interface MediaPlanInput {
  body: string;
  mediaFiles: string[];
  destinations: PublishDestination[];
}

export interface MediaPlanValidation {
  ok: boolean;
  issues: MediaRuleIssue[];
}

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"]);

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hashtagCount(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

function validateSharedMedia(files: string[], issues: MediaRuleIssue[]): void {
  if (files.length === 0) {
    issues.push({ code: "missing_media", message: "画像または動画ファイルを1つ以上指定してください。" });
    return;
  }

  for (const file of files) {
    if (isRemoteUrl(file)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      issues.push({ code: "unsupported_media_type", message: `未対応のメディア形式です: ${file}` });
    }
  }
}

export function validateMediaPlan(input: MediaPlanInput): MediaPlanValidation {
  const issues: MediaRuleIssue[] = [];
  validateSharedMedia(input.mediaFiles, issues);

  for (const destination of input.destinations) {
    if (destination === "threads" && hashtagCount(input.body) > 1) {
      issues.push({
        destination,
        code: "too_many_hashtags",
        message: "Threadsはハッシュタグを1つまでに抑えます。",
      });
    }

    if (destination === "line_voom" && input.mediaFiles.length > 20) {
      issues.push({
        destination,
        code: "too_many_media_files",
        message: "LINE VOOMは画像/動画を最大20個までにします。",
      });
    }

    if (destination === "google_business" && input.mediaFiles.some(file => !isRemoteUrl(file))) {
      issues.push({
        destination,
        code: "media_url_required",
        message: "Google Business Profile API投稿のメディアは公開URLが必要です。ローカルファイルはMacブラウザ投稿で処理します。",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
