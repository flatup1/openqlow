import path from "node:path";
import { loadConfig } from "../config.js";

export function openqlowPath(...parts: string[]): string {
  return path.join(loadConfig().root, ...parts);
}

export function flatupAiOsPath(...parts: string[]): string {
  return path.join(loadConfig().flatupAiOsRoot, ...parts);
}

export function obsidianPath(...parts: string[]): string {
  return path.join(loadConfig().obsidianVaultRoot, ...parts);
}
