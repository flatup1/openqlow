import crypto from "node:crypto";
import path from "node:path";

export const AD_LINE_PURPOSE = "advertising" as const;
export const AD_LINE_WEBHOOK_PATH = "/openqlow/ad-line/webhook" as const;

export type AdLineRoute =
  | "owner_ad_ops"
  | "ad_lead_intake"
  | "member_support_handoff"
  | "ignored";

export interface AdvertisingLineConfig {
  purpose: typeof AD_LINE_PURPOSE;
  channelId: string;
  accountBasicId: string;
  ownerUserId: string;
  webhookPath: typeof AD_LINE_WEBHOOK_PATH;
  dataDir: string;
  dryRun: boolean;
  /** 受信署名を検証できる状態。送信用tokenの有無とは分ける。 */
  credentialsReady: boolean;
}

export type AdvertisingLineConfigResult =
  | { ok: true; config: AdvertisingLineConfig }
  | { ok: false; errors: string[] };

export interface AdLineMessageInput {
  userId?: string;
  text?: string;
  ownerUserId: string;
}

export interface AdLeadEvent {
  id: string;
  route: Exclude<AdLineRoute, "owner_ad_ops" | "ignored">;
  sourceUserHash: string;
  campaignCode?: string;
  occurredAt: string;
}

// 新規見込み客の「会員になりたい」「月会費を知りたい」を誤って会員対応へ
// 送らない。既存会員にしか成立しない手続き、または既存会員だと明示された
// 問い合わせだけを会員対応へ引き渡す。
const MEMBER_ONLY_ACTION_PATTERN =
  /(退会|休会|引き落とし(?:口座)?(?:の)?変更|契約(?:内容)?(?:の)?変更|プラン変更|クラス変更|所属変更|登録情報(?:の)?変更|クレーム|苦情)/;
const EXISTING_MEMBER_PATTERN = /(既存会員|現在会員|すでに会員|会員です|会員なのですが|通っています|在籍しています)/;
const MEMBER_SUPPORT_TOPIC_PATTERN =
  /(退会|休会|月会費|引き落とし|支払い|契約|プラン|クラス|所属|登録情報|怪我|けが|事故|クレーム|苦情)/;
const CAMPAIGN_CODE_PATTERN = /(?:^|\s)((?:IG|META|FB|LINE|WEB)(?:[-_]?[A-Z0-9]+){1,3})(?=\s|$)/i;
const MAX_CAMPAIGN_CODE_LENGTH = 24;
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i;
const CHANNEL_ID_PATTERN = /^\d{6,}$/;

function value(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

function sameNonEmpty(a: string, b: string): boolean {
  return Boolean(a && b && a === b);
}

/**
 * 広告専用LINEの設定を検証する。
 *
 * 広告LINEは専用の AD_LINE_* だけを読み、既存AIKA/会員対応の LINE_* を
 * フォールバック利用しない。設定を取り違えた場合は fail-closed にする。
 */
export function validateAdvertisingLineEnv(env: NodeJS.ProcessEnv = process.env): AdvertisingLineConfigResult {
  const errors: string[] = [];
  const purpose = value(env, "AD_LINE_PURPOSE");
  const channelId = value(env, "AD_LINE_CHANNEL_ID");
  const accountBasicId = value(env, "AD_LINE_ACCOUNT_BASIC_ID");
  const ownerUserId = value(env, "AD_LINE_OWNER_USER_ID");
  const webhookPath = value(env, "AD_LINE_WEBHOOK_PATH") || AD_LINE_WEBHOOK_PATH;
  const dryRun = value(env, "AD_LINE_DRY_RUN") !== "false";
  const dataDir = value(env, "AD_LINE_DATA_DIR") || path.resolve(process.cwd(), "data", "ad-line");
  const channelSecret = value(env, "AD_LINE_CHANNEL_SECRET");
  const memberChannelId = value(env, "MEMBER_LINE_CHANNEL_ID");
  const memberBasicId = value(env, "MEMBER_LINE_ACCOUNT_BASIC_ID");

  if (purpose !== AD_LINE_PURPOSE) {
    errors.push(`AD_LINE_PURPOSE must be ${AD_LINE_PURPOSE}`);
  }
  if (!CHANNEL_ID_PATTERN.test(channelId)) {
    errors.push("AD_LINE_CHANNEL_ID must be a numeric Messaging API channel ID");
  }
  if (!accountBasicId || !accountBasicId.startsWith("@")) {
    errors.push("AD_LINE_ACCOUNT_BASIC_ID must be the advertising account basic ID starting with @");
  }
  if (!LINE_USER_ID_PATTERN.test(ownerUserId)) {
    errors.push("AD_LINE_OWNER_USER_ID must be the owner's provider-scoped LINE user ID");
  }
  if (webhookPath !== AD_LINE_WEBHOOK_PATH) {
    errors.push(`AD_LINE_WEBHOOK_PATH must be ${AD_LINE_WEBHOOK_PATH}`);
  }
  if (sameNonEmpty(channelId, memberChannelId)) {
    errors.push("Advertising and member-support LINE channel IDs must be different");
  }
  if (sameNonEmpty(accountBasicId, memberBasicId)) {
    errors.push("Advertising and member-support LINE basic IDs must be different");
  }
  // LINE_* は現在の openQLOW（@817nsdhr）の旧設定名であり、会員AIKAではない。
  // 広告専用への移行期間中は同じチャネル資格情報になり得るため、値の一致だけで
  // 拒否しない。会員AIKAとの分離は公開 channel/basic ID で fail-closed にする。
  if (!dryRun && !channelSecret) {
    errors.push("Production advertising LINE requires its dedicated channel secret");
  }
  const existingDataDir = value(env, "OPENQLOW_DATA_DIR");
  if (existingDataDir && path.resolve(dataDir) === path.resolve(existingDataDir)) {
    errors.push("AD_LINE_DATA_DIR must use a separate directory from the existing data root");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      purpose: AD_LINE_PURPOSE,
      channelId,
      accountBasicId,
      ownerUserId,
      webhookPath: AD_LINE_WEBHOOK_PATH,
      dataDir,
      dryRun,
      credentialsReady: Boolean(channelSecret),
    },
  };
}

/** 広告LINEに届いたメッセージを、会員対応へ混ぜずに振り分ける。 */
export function routeAdvertisingLineMessage(input: AdLineMessageInput): AdLineRoute {
  const userId = input.userId?.trim() ?? "";
  const text = input.text?.trim() ?? "";
  if (!userId || !text) return "ignored";
  if (userId === input.ownerUserId) return "owner_ad_ops";
  if (
    MEMBER_ONLY_ACTION_PATTERN.test(text) ||
    (EXISTING_MEMBER_PATTERN.test(text) && MEMBER_SUPPORT_TOPIC_PATTERN.test(text))
  ) {
    return "member_support_handoff";
  }
  return "ad_lead_intake";
}

export function extractCampaignCode(text: string): string | undefined {
  const code = text.match(CAMPAIGN_CODE_PATTERN)?.[1]?.toUpperCase();
  return code && code.length <= MAX_CAMPAIGN_CODE_LENGTH ? code : undefined;
}

/**
 * Growth計測へ渡す最小イベントを作る。生のLINE userIdと本文は保存しない。
 */
export function createAdLeadEvent(
  input: AdLineMessageInput,
  route: AdLineRoute,
  occurredAt = new Date(),
): AdLeadEvent | undefined {
  if (route !== "ad_lead_intake" && route !== "member_support_handoff") return undefined;
  const userId = input.userId?.trim() ?? "";
  if (!userId) return undefined;
  const sourceUserHash = crypto.createHash("sha256").update(userId).digest("hex");
  const timestamp = occurredAt.toISOString();
  const campaignCode = extractCampaignCode(input.text ?? "");
  const suffix = crypto.createHash("sha256").update(`${sourceUserHash}:${timestamp}:${route}`).digest("hex").slice(0, 12);
  return {
    id: `AD-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${suffix}`,
    route,
    sourceUserHash,
    ...(campaignCode ? { campaignCode } : {}),
    occurredAt: timestamp,
  };
}
