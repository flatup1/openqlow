// Brand Growth adapter for LINE webhook
// Bridges LINE text messages to Brand Growth pipeline

import { route } from "../brand_growth/index.js";
import type { RouteDecision } from "../brand_growth/contracts/route_decision.js";

export interface BrandGrowthAdapterResult {
  ok: boolean;
  action: string;
  message?: string;
  target?: string;
  objective?: string;
  intent?: string;
  handled: boolean;
  replyToSender?: boolean;
}

/**
 * Execute Brand Growth routing for LINE text input.
 *
 * Phase 1: Route user input → target + objective
 * (Brief generation and prompt composition are handled separately by Brand Growth index.ts)
 */
export async function executeBrandGrowthRouting(input: {
  text: string;
  lineUserId: string;
  messageId?: string;
}): Promise<BrandGrowthAdapterResult> {
  try {
    // Step 1: Route the user input
    const decision: RouteDecision = route({
      request_id: `req_line_${input.lineUserId}_${Date.now()}`,
      raw_text: input.text,
      input_channel: "line",
      assets: [],
      requested_at: new Date().toISOString(),
    });

    // Only proceed with Brand Growth for creative requests
    // Intent "create" or "animate" indicates content creation
    if (decision.intent !== "create" && decision.intent !== "animate") {
      return {
        ok: true,
        action: "routing_skipped",
        message: `intent was '${decision.intent}', not a creation or animation request`,
        intent: decision.intent,
        handled: false,
        replyToSender: false,
      };
    }

    // Successful routing - Brand Growth can generate brief and prompt
    return {
      ok: true,
      action: "brand_growth_routed",
      message: "Successfully routed for creative generation",
      target: decision.target_primary,
      objective: decision.objective,
      intent: decision.intent,
      handled: true,
      replyToSender: true,
    };
  } catch (error) {
    console.error("Brand Growth routing error:", error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      action: "error",
      message: "Brand Growth routing failed",
      handled: false,
      replyToSender: true,
    };
  }
}
