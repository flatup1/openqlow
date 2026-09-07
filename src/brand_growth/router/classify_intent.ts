// Brand Growth Phase 1 Router: 依頼の種類（Intent）を決める。
//
// 参照: TARGET_ROUTER_SPEC §3。
// 並び順が優先度。狭い意味（告知・分析・実験・別尺）を、広い意味（作る）より先に置く。
// 狭い語には重み2を与え、「大会告知を作って」で create に流れないようにする。

import type { Classified, Intent } from "../contracts/route_decision.js";
import { confidenceFromMatch, scoreLexicon, type Phrase } from "./lexicon.js";
import type { NormalizedInput } from "./normalize_input.js";

const INTENT_PHRASES: readonly Phrase<Intent>[] = [
  // 分析
  { value: "analyze", phrase: "なぜ伸び", weight: 2 },
  { value: "analyze", phrase: "結果はどう", weight: 2 },
  { value: "analyze", phrase: "分析して", weight: 2 },
  { value: "analyze", phrase: "振り返", weight: 2 },
  { value: "analyze", phrase: "伸びた理由", weight: 2 },
  // 実験
  { value: "experiment", phrase: "a/b", weight: 2, boundary: true },
  { value: "experiment", phrase: "abテスト", weight: 2 },
  { value: "experiment", phrase: "ab試験", weight: 2 },
  { value: "experiment", phrase: "試したい", weight: 2 },
  { value: "experiment", phrase: "比べたい", weight: 2 },
  { value: "experiment", phrase: "検証したい", weight: 2 },
  // 別尺・作り直し
  { value: "repurpose", phrase: "別尺", weight: 2 },
  { value: "repurpose", phrase: "使い回", weight: 2 },
  { value: "repurpose", phrase: "使いまわ", weight: 2 },
  { value: "repurpose", phrase: "にも出したい", weight: 2 },
  { value: "repurpose", phrase: "にも展開", weight: 2 },
  { value: "repurpose", phrase: "切り抜き", weight: 2 },
  // 告知
  { value: "announce", phrase: "告知", weight: 2 },
  { value: "announce", phrase: "お知らせを", weight: 2 },
  { value: "announce", phrase: "案内を出", weight: 2 },
  { value: "announce", phrase: "開催を伝", weight: 2 },
  // 動かす
  { value: "animate", phrase: "動かして", weight: 2 },
  { value: "animate", phrase: "動かしたい", weight: 2 },
  { value: "animate", phrase: "アニメに", weight: 2 },
  { value: "animate", phrase: "アニメで", weight: 2 },
  { value: "animate", phrase: "アニメ化", weight: 2 },
  // 作る（最も広い）
  { value: "create", phrase: "作って" },
  { value: "create", phrase: "作りたい" },
  { value: "create", phrase: "つくって" },
  { value: "create", phrase: "作成" },
  { value: "create", phrase: "動画に" },
  { value: "create", phrase: "映像に" },
  { value: "create", phrase: "リールに" },
  { value: "create", phrase: "まとめて" },
  { value: "create", phrase: "お願いします" },
];

/**
 * 合図が無いときは create にする。
 * 「作る」は最も広い依頼で、実際の作り方は後段の content_mode が決めるため、
 * 既定にしても安全側から外れない。
 */
export function classifyIntent(normalized: NormalizedInput): Classified<Intent> {
  const match = scoreLexicon(INTENT_PHRASES, normalized);
  if (match) {
    return { value: match.value, confidence: confidenceFromMatch(match), source: "explicit_text" };
  }
  return { value: "create", confidence: 0.55, source: "default" };
}
