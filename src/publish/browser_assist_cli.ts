import { loadConfig } from "../config.js";
import { createBrowserAssistSheet } from "./browser_assist.js";
import { createBrowserPanel } from "./browser_panel.js";

export interface PublishAssistResult {
  ok: true;
  file: string;
}

export async function runPublishAssist(id: string): Promise<PublishAssistResult> {
  if (!id.trim()) throw new Error("post id is required");
  const config = loadConfig();
  const file = await createBrowserAssistSheet(config.root, id.trim());
  return { ok: true, file };
}

export async function runPublishPanel(id: string): Promise<PublishAssistResult> {
  if (!id.trim()) throw new Error("post id is required");
  const config = loadConfig();
  const file = await createBrowserPanel(config.root, id.trim());
  return { ok: true, file };
}
