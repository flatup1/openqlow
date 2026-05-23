import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

export interface InboxNote {
  path: string;
  text: string;
}

export async function readOpenqlowInbox(): Promise<InboxNote[]> {
  const config = loadConfig();
  const inboxPath = path.join(config.obsidianVaultRoot, config.inboxRelative);
  const names = await readdir(inboxPath).catch(() => []);
  const notes: InboxNote[] = [];

  for (const name of names.filter(name => name.endsWith(".md") || name.endsWith(".txt")).sort()) {
    const fullPath = path.join(inboxPath, name);
    const text = await readFile(fullPath, "utf8").catch(() => "");
    if (text.trim()) notes.push({ path: fullPath, text: text.trim() });
  }

  return notes;
}
