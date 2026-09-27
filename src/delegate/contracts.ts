// 委任ルーター契約: 質問を「ChatGPT(Codex)」と「Claude(Claude Code)」へ振り分ける型。
//
// なぜ作るか:
//   考える仕事（計画・レビュー・説明・文章）は ChatGPT 定額枠へ、
//   手を動かす仕事（ファイル変更・テスト・実行）は Claude Code へ回す。
//   こうするとトークン課金の対象が減る。ゼロにはならない。
//
// 方針:
//   - 型と定数だけを置く。I/O、ネットワーク、環境変数、時刻取得を持たない。
//   - 「わからない」と「0」を区別する（未定は null にし、空配列で誤魔化さない）。
//   - 料金・時間などの事実値はここに書かない（正本は src/shared/canon.ts）。

/** どちらのAIに考えさせるか。 */
export type Engine = "chatgpt" | "claude";

/** 依頼の種類。engine はこれから決まる。 */
export type TaskKind =
  | "plan"      // 計画・設計・段取り → ChatGPT
  | "review"    // レビュー・採点・指摘 → ChatGPT
  | "explain"   // 説明・調査・比較 → ChatGPT
  | "write"     // 文章・台本・コピー → ChatGPT
  | "edit"      // ファイル変更・実装 → Claude
  | "verify"    // テスト・型チェック・検証 → Claude
  | "run"       // コマンド実行・生成処理 → Claude
  | "repo"      // 差分・ログ・状態確認 → Claude
  | "unknown";  // 判定できない → 既定側へ

/** TaskKind から engine は一意に決まる（ここが唯一の対応表）。 */
export const ENGINE_BY_TASK_KIND: Readonly<Record<TaskKind, Engine>> = Object.freeze({
  plan: "chatgpt",
  review: "chatgpt",
  explain: "chatgpt",
  write: "chatgpt",
  edit: "claude",
  verify: "claude",
  run: "claude",
  repo: "claude",
  // 判定できないときは実行責任を持つ側に残す。勝手に外へ出さない。
  unknown: "claude",
});

/** なぜその engine になったか。人間に見せる用。 */
export type DecisionSource =
  | "explicit_prefix"   // 「ChatGPTに依頼：」など本人が明示した
  | "lexicon"           // 言い回し辞書で判定した
  | "default";          // 何も当たらなかった

/**
 * 人間承認が要る操作。承認行列 docs/ai-os/canon/approval_matrix.md に対応する。
 * ここに当たった依頼は、engine の判定とは無関係に自動実行しない。
 */
export type ApprovalReason =
  | "send"           // 送信・返信
  | "publish"        // 公開・投稿
  | "booking"        // 予約確定
  | "money"          // 料金・返金・課金
  | "membership"     // 退会・休会
  | "production"     // 本番反映・デプロイ
  | "git_write";     // commit / push / PR

export const ALL_APPROVAL_REASONS: readonly ApprovalReason[] = Object.freeze([
  "send",
  "publish",
  "booking",
  "money",
  "membership",
  "production",
  "git_write",
] as const);

/** ルーターの出力。生成後は凍結して変更しない。 */
export interface DelegateDecision {
  readonly task_kind: TaskKind;
  readonly engine: Engine;
  /** 0〜1。低くても質問はしない。判断の説明に使う。 */
  readonly confidence: number;
  readonly source: DecisionSource;
  /** 判定に使った語。なぜそうなったかを人間が追えるようにする。 */
  readonly matched: readonly string[];
  /** 当たった承認理由。空なら自動で進めてよい。 */
  readonly approval_reasons: readonly ApprovalReason[];
  readonly requires_human_approval: boolean;
  readonly router_version: string;
}

/**
 * 1.0.0: 初版。思考系→ChatGPT、実行系→Claude の二択に限定する。
 */
export const DELEGATE_ROUTER_VERSION = "1.0.0";
