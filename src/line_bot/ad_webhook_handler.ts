import {
  type AdLeadEvent,
  type AdLineRoute,
  type AdvertisingLineConfig,
  createAdLeadEvent,
  routeAdvertisingLineMessage,
} from "./ad_channel_boundary.js";

interface LineTextEvent {
  type?: string;
  timestamp?: number;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
}

export interface AdvertisingLineWebhookPayload {
  destination?: string;
  events?: LineTextEvent[];
}

export interface AdvertisingLineOutcome {
  route: AdLineRoute;
  event?: AdLeadEvent;
  action: "owner_ad_ops" | "queue_ad_lead" | "handoff_member_support" | "ignore";
}

/**
 * 広告専用LINEのWebhook本文を純関数で処理する。
 * 顧客への返信・予約確定・既存会員CRMへの書き込みは行わない。
 */
export function handleAdvertisingLinePayload(
  payload: AdvertisingLineWebhookPayload,
  config: Pick<AdvertisingLineConfig, "ownerUserId">,
): AdvertisingLineOutcome[] {
  if (!Array.isArray(payload.events)) return [];

  return payload.events.map(lineEvent => {
    if (lineEvent.type !== "message" || lineEvent.message?.type !== "text") {
      return { route: "ignored", action: "ignore" };
    }

    const input = {
      userId: lineEvent.source?.userId,
      text: lineEvent.message.text,
      ownerUserId: config.ownerUserId,
    };
    const route = routeAdvertisingLineMessage(input);
    const eventDate = typeof lineEvent.timestamp === "number" ? new Date(lineEvent.timestamp) : undefined;
    const occurredAt = eventDate && Number.isFinite(eventDate.getTime()) ? eventDate : new Date();

    if (route === "owner_ad_ops") return { route, action: "owner_ad_ops" };
    if (route === "ad_lead_intake") {
      return { route, action: "queue_ad_lead", event: createAdLeadEvent(input, route, occurredAt) };
    }
    if (route === "member_support_handoff") {
      return { route, action: "handoff_member_support", event: createAdLeadEvent(input, route, occurredAt) };
    }
    return { route: "ignored", action: "ignore" };
  });
}
