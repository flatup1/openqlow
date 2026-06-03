export type PublishTarget = "drafts_only" | "google_business" | "threads" | "line_voom";

export type ApprovalCommand =
  | {
      response: "OK";
      id: string;
      raw: string;
      targets: PublishTarget[];
    }
  | {
      response: "revision";
      id: string;
      raw: string;
      note: string;
    }
  | {
      response: "reject";
      id: string;
      raw: string;
    };

const APPROVAL_ID_REGEX = "FG-\\d{8}-\\d{3}";
const ALL_PUBLISH_TARGETS: PublishTarget[] = ["google_business", "threads", "line_voom"];

function normalizeSpaces(text: string): string {
  return text.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function targetFor(rawTarget: string | undefined): PublishTarget[] | undefined {
  if (!rawTarget) return ["drafts_only"];

  const target = rawTarget.toLowerCase();
  if (target === "all") return ALL_PUBLISH_TARGETS;
  if (target === "google" || target === "gbp" || target === "google_business") return ["google_business"];
  if (target === "threads" || target === "thread") return ["threads"];
  if (target === "voom" || target === "line_voom" || target === "line") return ["line_voom"];

  return undefined;
}

export function parseApprovalCommand(text: string): ApprovalCommand | undefined {
  const raw = text.trim();
  const normalized = normalizeSpaces(raw);

  const ok = normalized.match(new RegExp(`^OK (${APPROVAL_ID_REGEX})(?: ([A-Za-z_]+))?$`, "i"));
  if (ok) {
    const targets = targetFor(ok[2]);
    if (!targets) return undefined;
    return { response: "OK", id: ok[1], raw, targets };
  }

  const revision = normalized.match(new RegExp(`^修正 (${APPROVAL_ID_REGEX})(?:[:： ]+(.+))?$`));
  if (revision) {
    return { response: "revision", id: revision[1], raw, note: (revision[2] ?? "").trim() };
  }

  const reject = normalized.match(new RegExp(`^(?:NO|N|やめる|キャンセル|×|x|✕) (${APPROVAL_ID_REGEX})$`, "i"));
  if (reject) return { response: "reject", id: reject[1], raw };

  return undefined;
}
