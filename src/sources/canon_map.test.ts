import { parseCanonMap, selectCanonReferences } from "./canon_map.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const sample = `# FLATUPGYM AI 正本マップ

## 正本レイヤー

| レイヤー | 正本 | 役割 |
|---|---|---|
| 全体入口 | \`00_CORE/FLATUPGYM_AI_HOME.md\` | AIが最初に読むホーム |
| AIKA人格 | \`1_AIKA人格_本番.md\` | LINE Botの人格正本 |
| システム運用 | \`6_システム/\` | LINE Bot、AIOS |

## 次のセクション
これは無視されるはず
`;

const map = parseCanonMap(sample);
assert(map.entries.length === 3, `expected 3 entries, got ${map.entries.length}`);
assert(map.byLayer.get("全体入口")?.canonPath === "00_CORE/FLATUPGYM_AI_HOME.md", "全体入口 path");
assert(map.byLayer.get("AIKA人格")?.canonPath === "1_AIKA人格_本番.md", "AIKA人格 path");
assert(map.byLayer.get("システム運用")?.canonPath === "6_システム/", "システム運用 path");

const selected = selectCanonReferences(map, 2);
assert(selected.length === 2, "selects requested number of references");
assert(selected[0]?.layer === "全体入口", "全体入口 is the first preferred reference");
assert(selected[1]?.layer === "AIKA人格", "AIKA人格 is the second preferred reference");

const empty = parseCanonMap("");
assert(empty.entries.length === 0, "empty markdown produces empty map");

console.log("canon map tests passed");
