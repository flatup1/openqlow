import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

export interface CanonEntry {
  layer: string;
  canonPath: string;
  description: string;
}

export interface CanonMap {
  entries: CanonEntry[];
  byLayer: Map<string, CanonEntry>;
}

const CANON_MAP_RELATIVE = "6_システム/FLATUPGYM_AI_正本マップ.md";
const PREFERRED_LAYERS = ["全体入口", "AIKA人格", "システム運用", "ブランド", "OPENQLOW"];

function stripBackticks(s: string): string {
  return s.replace(/^`|`$/g, "").trim();
}

export async function readCanonMap(): Promise<CanonMap> {
  const config = loadConfig();
  const file = path.join(config.obsidianVaultRoot, CANON_MAP_RELATIVE);
  const text = await readFile(file, "utf8").catch(() => "");
  return parseCanonMap(text);
}

export function parseCanonMap(markdown: string): CanonMap {
  const entries: CanonEntry[] = [];
  const lines = markdown.split(/\r?\n/);
  let inLayerTable = false;
  let pastHeader = false;

  for (const line of lines) {
    if (/^##\s+正本レイヤー/.test(line)) {
      inLayerTable = true;
      pastHeader = false;
      continue;
    }
    if (inLayerTable && /^##\s/.test(line)) {
      inLayerTable = false;
      continue;
    }
    if (!inLayerTable) continue;
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) {
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    const cells = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const [layer, canonRaw, description] = cells;
    if (!layer || !canonRaw) continue;
    entries.push({
      layer,
      canonPath: stripBackticks(canonRaw),
      description: description ?? "",
    });
  }

  const byLayer = new Map(entries.map(e => [e.layer, e]));
  return { entries, byLayer };
}

export function selectCanonReferences(map: CanonMap, max = 3): CanonEntry[] {
  const selected: CanonEntry[] = [];
  const seen = new Set<string>();

  for (const layer of PREFERRED_LAYERS) {
    const entry = map.byLayer.get(layer);
    if (entry && !seen.has(entry.layer)) {
      selected.push(entry);
      seen.add(entry.layer);
    }
    if (selected.length >= max) return selected;
  }

  for (const entry of map.entries) {
    if (!seen.has(entry.layer)) {
      selected.push(entry);
      seen.add(entry.layer);
    }
    if (selected.length >= max) return selected;
  }

  return selected;
}

export async function resolveCanonPath(layer: string): Promise<string | null> {
  const map = await readCanonMap();
  const entry = map.byLayer.get(layer);
  if (!entry) return null;
  const config = loadConfig();
  return path.join(config.obsidianVaultRoot, entry.canonPath);
}
