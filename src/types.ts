export type Platform = "x" | "instagram" | "threads" | "line" | "youtube";

export type PublicationLevel = "level_1_idea" | "level_2_draft" | "level_3_scheduled" | "level_4_publish";

export type DraftStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "needs_revision"
  | "saved";

export interface CanonReference {
  layer: string;
  canonPath: string;
  description: string;
}

export interface ContentIdea {
  id: string;
  date: string;
  theme: string;
  angle: string;
  audience: "beginners" | "women" | "kids_parents" | "mma_fans" | "local_narita";
  source: "rotation" | "obsidian_inbox" | "mma_topic";
  valueConnection: string;
  canonReferences?: CanonReference[];
}

export interface PlatformDraft {
  id: string;
  ideaId: string;
  approvalId: string;
  platform: Platform;
  publicationLevel: PublicationLevel;
  title?: string;
  body: string;
  hashtags: string[];
  cta: string;
  safetyNotes: string[];
  createdAt: string;
}

export interface DraftRecord {
  id: string;
  idea: ContentIdea;
  drafts: PlatformDraft[];
  mediaFiles?: string[];
  status: DraftStatus;
  approvalMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyIssue {
  code:
    | "pii_phone"
    | "pii_email"
    | "other_gym_attack"
    | "overclaim"
    | "unsafe_auto_publish"
    | "missing_flatup_value"
    | "salesy_cta"
    | "body_shaming"
    | "fear_baiting"
    | "before_after_baiting"
    | "elitist_phrasing"
    | "medical_claim"
    | "mocking_weakness"
    | "blaming_effort"
    | "low_kindness_score";
  severity: "block" | "warn";
  message: string;
}

export interface KindnessScore {
  notScary: number;
  beginnerFriendly: number;
  noShameOrPressure: number;
  memberDignity: number;
  flatupLike: number;
  total: number;
  decision: "strong" | "revise_lightly" | "revise_before_showing" | "reject";
}

export interface SafetyResult {
  ok: boolean;
  issues: SafetyIssue[];
  kindnessScore: KindnessScore;
}
