import { readFile } from "node:fs/promises";
import { flatupAiOsPath } from "../utils/paths.js";

const dataFiles = [
  "brand_voice.md",
  "gym_profile.md",
  "differentiation.md",
  "faq.md",
  "templates.md",
];

export async function loadBrandKnowledge(): Promise<string> {
  const chunks: string[] = [];
  for (const file of dataFiles) {
    const fullPath = flatupAiOsPath("src", "data", file);
    const text = await readFile(fullPath, "utf8").catch(() => "");
    if (text.trim()) chunks.push(`## ${file}\n\n${text.trim()}`);
  }
  return chunks.join("\n\n---\n\n");
}
