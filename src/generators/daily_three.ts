import type { ContentIdea } from "../types.js";
import { buildMmaIdeas } from "./mma_topic.js";
import { readOpenqlowInbox } from "../sources/obsidian_inbox.js";
import { readCanonMap, selectCanonReferences } from "../sources/canon_map.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { createHash } from "node:crypto";

export async function generateDailyThree(date = new Date()): Promise<ContentIdea[]> {
  const inbox = await readOpenqlowInbox();
  const isoDate = formatDateInTimeZone(date);
  const canonReferences = selectCanonReferences(await readCanonMap()).map(entry => ({
    layer: entry.layer,
    canonPath: entry.canonPath,
    description: entry.description,
  }));

  if (inbox.length > 0) {
    const fromInbox = inbox.slice(0, 3).map((note): ContentIdea => {
      const firstLine = note.text.split(/\r?\n/).find(Boolean) || "OPENQLOW inbox idea";
      const seed = `${note.path}:${note.text}`;
      return {
        id: `idea_${createHash("sha1").update(seed).digest("hex").slice(0, 10)}`,
        date: isoDate,
        theme: firstLine.slice(0, 50),
        angle: note.text.slice(0, 180),
        audience: "beginners",
        source: "obsidian_inbox",
        valueConnection: "Jinさんの生ネタをFLATUPの価値観に変換して使う。",
        canonReferences,
      };
    });
    return fromInbox.length === 3
      ? fromInbox
      : [...fromInbox, ...buildMmaIdeas(date).map(idea => ({ ...idea, canonReferences }))].slice(0, 3);
  }

  return buildMmaIdeas(date).map(idea => ({ ...idea, canonReferences }));
}
