import { readFile } from "node:fs/promises";
import type { DraftRecord, PlatformDraft } from "../types.js";
import { resolvePublicMediaUrl } from "./public_media.js";
import { publishXPost, type XCredentials } from "./x_api.js";
import { publishInstagramImage } from "./instagram_api.js";
import { buildInstagramCaption } from "./instagram_caption.js";
import { publishFacebookPost } from "./facebook_api.js";

type ExtraPlatform = "x" | "instagram" | "facebook";

// X / Instagram への自動投稿（Threads以外のAPI対応媒体）。
// キーが設定された媒体だけ投稿する。postId/tweetId が取れた時のみ成功扱い。
// 失敗・未対応・キー未設定は skipped に理由を入れる（投稿できてないのに成功扱いしない）。
// 鍵・トークンはログ・返信に出さない。

export interface ExtraPublishResult {
  published: Array<{ platform: ExtraPlatform; externalId: string }>;
  skipped: Array<{ platform: ExtraPlatform; reason: string }>;
}

function postText(record: DraftRecord): string {
  const draft: PlatformDraft | undefined = record.drafts.find(d => d.platform === "threads") ?? record.drafts[0];
  return [
    draft?.body ?? "",
    draft?.hashtags?.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
  ].filter(Boolean).join("\n\n");
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PublishExtraOptions {
  record: DraftRecord;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

/** X と Instagram に（キーがあれば）自動投稿する。 */
export async function publishExtraPlatforms(opts: PublishExtraOptions): Promise<ExtraPublishResult> {
  const env = opts.env ?? process.env;
  const result: ExtraPublishResult = { published: [], skipped: [] };
  const text = postText(opts.record);
  const mediaFile = opts.record.mediaFiles?.[0];

  // ===== X (Twitter) =====
  const xCreds: XCredentials = {
    apiKey: env.X_API_KEY ?? "",
    apiSecret: env.X_API_SECRET ?? "",
    accessToken: env.X_ACCESS_TOKEN ?? "",
    accessSecret: env.X_ACCESS_SECRET ?? "",
  };
  if (xCreds.apiKey && xCreds.apiSecret && xCreds.accessToken && xCreds.accessSecret) {
    try {
      const mediaBytes = mediaFile ? await readFile(mediaFile).catch(() => undefined) : undefined;
      const published = await publishXPost({ creds: xCreds, text, mediaBytes, fetchImpl: opts.fetchImpl });
      result.published.push({ platform: "x", externalId: published.tweetId });
    } catch (error) {
      const reason = errorReason(error);
      // Xの課金未設定(402)は保留運用中なので毎回の「未投稿」表示はしない（静音化）。
      // 本物の不具合（権限・認証など）だけ報告する。
      if (!/\b402\b/.test(reason)) {
        result.skipped.push({ platform: "x", reason });
      }
    }
  }

  // ===== Facebook ページ（写真があれば写真投稿。リンクはクリック可能なので本文そのまま） =====
  const fbPageId = env.FB_PAGE_ID ?? "";
  const fbToken = env.FB_PAGE_ACCESS_TOKEN ?? "";
  if (fbPageId && fbToken) {
    try {
      const imageUrl = mediaFile ? await resolvePublicMediaUrl(mediaFile, env) : undefined;
      const published = await publishFacebookPost({
        pageId: fbPageId,
        accessToken: fbToken,
        message: text,
        imageUrl: imageUrl ?? undefined,
        fetchImpl: opts.fetchImpl,
      });
      result.published.push({ platform: "facebook", externalId: published.postId });
    } catch (error) {
      result.skipped.push({ platform: "facebook", reason: errorReason(error) });
    }
  }

  // ===== Instagram（写真必須・公開URLが必要） =====
  const igUserId = env.IG_USER_ID ?? "";
  const igToken = env.IG_ACCESS_TOKEN ?? "";
  if (igUserId && igToken) {
    if (!mediaFile) {
      result.skipped.push({ platform: "instagram", reason: "Instagramは写真が必要です（画像を付けてください）" });
    } else {
      const imageUrl = await resolvePublicMediaUrl(mediaFile, env);
      if (!imageUrl) {
        result.skipped.push({ platform: "instagram", reason: "公開画像URLが未解決（OPENQLOW_PUBLIC_MEDIA_*未設定）" });
      } else {
        try {
          // Instagramは導線最適化したキャプション（CTA＋ローカルタグ／LINE生URLは外す）を使う。
          const igCaption = buildInstagramCaption(opts.record, env);
          const published = await publishInstagramImage({ igUserId, accessToken: igToken, imageUrl, caption: igCaption, fetchImpl: opts.fetchImpl });
          result.published.push({ platform: "instagram", externalId: published.postId });
        } catch (error) {
          result.skipped.push({ platform: "instagram", reason: errorReason(error) });
        }
      }
    }
  }

  return result;
}
