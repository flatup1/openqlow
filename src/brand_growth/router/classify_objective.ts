// Brand Growth Phase 1 Router: 何を起こしたいか（Objective）を決める。
//
// 参照: TARGET_ROUTER_SPEC §5、ACCEPTANCE_TESTS AT-006 / AT-007。
// 既定は trust。再生数は objective にしない。
//
// 設計判断（記録）:
//   CLAUDE_CODE_IMPLEMENTATION_SPEC §6 は「Instagram は trial 明示が無ければ awareness」と書くが、
//   AT-007 は「変換の合図が無ければ trust」を要求する。受入試験は実装前に固定された契約なので、
//   ここでは AT-007（既定 trust）を採用する。媒体だけでは objective を動かさない。

import type { CreativeInput } from "../contracts/creative_input.js";
import type { Classified, Intent, Objective } from "../contracts/route_decision.js";
import { anyPhrasePresent, confidenceFromMatch, scoreLexicon, type Phrase } from "./lexicon.js";
import type { NormalizedInput } from "./normalize_input.js";

const OBJECTIVE_PHRASES: readonly Phrase<Objective>[] = [
  // 体験
  { value: "trial", phrase: "体験", weight: 2 },
  { value: "trial", phrase: "来てもらい", weight: 2 },
  { value: "trial", phrase: "来てほしい", weight: 2 },
  { value: "trial", phrase: "試してもらい", weight: 2 },
  // 入会
  { value: "enrollment", phrase: "入会", weight: 2 },
  { value: "enrollment", phrase: "申し込", weight: 2 },
  { value: "enrollment", phrase: "入りたくなる", weight: 2 },
  // LINE・相談
  { value: "line_add", phrase: "line", boundary: true },
  { value: "line_add", phrase: "公式ライン" },
  { value: "line_add", phrase: "ライン登録" },
  { value: "line_add", phrase: "ライン追加" },
  { value: "line_add", phrase: "相談" },
  { value: "line_add", phrase: "問い合わせを増や" },
  // プロフィール
  { value: "profile_visit", phrase: "プロフィールへ" },
  { value: "profile_visit", phrase: "プロフィールに飛" },
  { value: "profile_visit", phrase: "プロフィール誘導" },
  // 認知
  { value: "awareness", phrase: "知ってほしい" },
  { value: "awareness", phrase: "知ってもらい" },
  { value: "awareness", phrase: "認知" },
  { value: "awareness", phrase: "広めたい" },
  // 信頼
  { value: "trust", phrase: "安心してほしい" },
  { value: "trust", phrase: "安心感" },
  { value: "trust", phrase: "紹介したい" },
  { value: "trust", phrase: "信頼" },
];

/** 告知の文脈にあるか。intent announce と組み合わせて event を決める。 */
const EVENT_CONTEXT: readonly string[] = ["大会", "試合", "イベント", "開催"];

export function classifyObjective(
  input: CreativeInput,
  normalized: NormalizedInput,
  intent: Intent,
): Classified<Objective> {
  const hint = input.objective_hint;
  if (hint) {
    return { value: hint, confidence: 0.95, source: "explicit_hint" };
  }

  // 告知依頼で大会・イベントの話をしているなら event。
  if (intent === "announce" && anyPhrasePresent(EVENT_CONTEXT, normalized)) {
    return { value: "event", confidence: 0.9, source: "explicit_text" };
  }

  const match = scoreLexicon(OBJECTIVE_PHRASES, normalized);
  if (match) {
    return { value: match.value, confidence: confidenceFromMatch(match), source: "explicit_text" };
  }

  if (intent === "announce") {
    return { value: "event", confidence: 0.7, source: "explicit_text" };
  }

  // 変換の合図が無いときは trust。売り込みを既定にしない。
  return { value: "trust", confidence: 0.5, source: "default" };
}
