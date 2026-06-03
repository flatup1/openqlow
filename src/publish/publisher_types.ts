export type PublishDestination = "google_business" | "threads" | "line_voom";

export type PublishQueueStatus = "queued_for_owner";

export interface DestinationInstruction {
  mode: "api_setup_required" | "api_or_browser_assist" | "browser_assist_only";
  requiredEnvKeys: string[];
  humanFinalClickRequired: boolean;
  note: string;
}

export interface PublishQueueEntry {
  recordId: string;
  status: PublishQueueStatus;
  destinations: PublishDestination[];
  mediaFiles?: string[];
  sourceDraftIds: string[];
  createdAt: string;
  instructions: Record<PublishDestination, DestinationInstruction>;
}
