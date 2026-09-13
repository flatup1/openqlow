// 今日「AIに何を頼むか」を、根拠のある1件だけに絞る。
//
// 目的は、JINが毎朝「何を頼もう」と組み立てる時間を無くすこと。
// 出力は常に次の7点だけに絞る:
//   今日やること / 今やる理由 / 参照する資料 / 完成条件 / 担当するAI /
//   そのまま使える依頼文 / 人間確認が必要な地点
//
// 守っていること:
//   - 1日1件まで。増やさない。
//   - 根拠（台帳・下書き・日次ログ）が無ければ「今日は追加のAI作業なし」。
//   - 古い未完了リストは、そのまま今日の仕事にしない（既定14日で期限切れ扱い）。
//   - 送信・予約確定・料金・公開は依頼文に含めない。人間確認の地点として残す。
//
// このファイルは入出力を持たない純粋な組み立て。信号集めは src/sources/work_signals.ts。

/** 今日の仕事の種類。上にあるものほど優先が強い（朝の司令書 §今日の優先順位ルール）。 */
export type WorkKind =
  | "reply_waiting"
  | "trial_pending"
  | "trial_followup"
  | "in_progress"
  | "decision_support"
  | "growth";

/** 「こういう仕事が要る」という根拠付きの手がかり。 */
export interface WorkSignal {
  kind: WorkKind;
  /** 件数。0以下は仕事にしない。 */
  count: number;
  /** 根拠になったファイル・台帳（相対パスか台帳名）。 */
  evidence: string;
  /** 最後に動いた日（JST, YYYY-MM-DD）。古い手がかりを今日の仕事にしないために使う。 */
  observedOn: string;
  /** 補足。個人名・連絡先を入れない短文。 */
  detail?: string;
}

export interface WorkOrderTask {
  kind: WorkKind;
  title: string;
  reason: string;
  references: string[];
  doneWhen: string[];
  assignee: string;
  requestText: string;
  humanCheckpoints: string[];
  estimateMinutes: number;
}

export interface WorkOrder {
  dateJst: string;
  hasWork: boolean;
  task?: WorkOrderTask;
  /** 今日は採用しなかったもの（理由付き）。 */
  skipped: string[];
  /** AIでは取れなかった情報だけ。多くても2件。 */
  askHuman: string[];
  notes: string[];
}

export interface WorkOrderInput {
  dateJst: string;
  signals: WorkSignal[];
  /** 今日AIに使える時間（分）。渡されたら、収まる仕事だけを選ぶ。 */
  minutesAvailable?: number;
  /** 何日前までを「今日の仕事」として扱うか。既定14日。 */
  staleAfterDays?: number;
  askHuman?: string[];
  notes?: string[];
}

interface KindSpec {
  /** 小さいほど優先。 */
  order: number;
  label: string;
  /** 件数の言い方。「3件」「目安に4件不足」のように、数字の意味が分かる形にする。 */
  amount: (signal: WorkSignal) => string;
  assignee: string;
  estimateMinutes: number;
  references: string[];
  humanCheckpoints: string[];
  title: (signal: WorkSignal) => string;
  doneWhen: (signal: WorkSignal) => string[];
  request: (signal: WorkSignal, dateJst: string) => string[];
}

const CANON_REF = "docs/ai-os/canon/（料金・時間・ルールの正本）";
const NO_SEND = "送信・予約確定・料金／返金／退会の判断はしない（JINが実行する）";

const KIND_SPECS: Record<WorkKind, KindSpec> = {
  reply_waiting: {
    order: 1,
    label: "返信待ち",
    amount: signal => `${signal.count}件`,
    assignee: "AIKA（守りの顧客対応・下書きまで）",
    estimateMinutes: 15,
    references: ["state/reply_drafts/（保留中の返信下書き）", CANON_REF],
    humanCheckpoints: ["送るかどうかの判断", "送信操作", "料金・退会・怪我に触れる返答"],
    title: signal => `お客様を待たせている返信下書き${signal.count}件を、送れる形に整える`,
    doneWhen: signal => [
      `${signal.count}件それぞれに「このまま送れる／ここを直す」が付いている`,
      "料金・時間・ルールが正本と一致している",
      "JINはコピーして送るだけの状態になっている",
    ],
    request: (signal, dateJst) => [
      `未通知の返信下書き${signal.count}件（${dateJst}時点）を確認して、JINがそのまま送れる形に整えてください。`,
      "",
      "やること:",
      "1. state/reply_drafts/ の保留中の下書きを読む",
      "2. 料金・営業時間・ルールを docs/ai-os/canon/ と照合する",
      "3. 1件ずつ「このまま送れる」か「ここを直す」かを書く",
      "",
      `やらないこと: ${NO_SEND}`,
    ],
  },
  trial_pending: {
    order: 2,
    label: "体験の結果待ち",
    amount: signal => `${signal.count}件`,
    assignee: "openQLOW（攻めの営業・経営支援）",
    estimateMinutes: 10,
    references: ["01_DAILY_OPERATIONS/体験予約・入会管理.md", CANON_REF],
    humanCheckpoints: ["台帳に結果を書き込む操作", "お客様への連絡"],
    title: signal => `体験予定日を過ぎて結果が未記録の${signal.count}件を、確認できる形にする`,
    doneWhen: signal => [
      `${signal.count}件が「参加／欠席／キャンセル」のどれか確認待ちとして一覧になっている`,
      "JINがLINEに打ち込むだけの記録コマンド文が用意されている",
      "台帳そのものは書き換えていない",
    ],
    request: (signal, dateJst) => [
      `体験予約・入会管理.md のうち、体験予定日を過ぎて結果が未記録の${signal.count}件（${dateJst}時点）を一覧にしてください。`,
      "",
      "やること:",
      "1. 対象をID（TRIAL-xxxx）と体験予定日だけで一覧にする",
      "2. 1件ずつ、記録用のLINEコマンド文（例: `参加 山田 T.`）の雛形を作る",
      "3. 判断できない点があれば、JINに聞く質問を1つにまとめる",
      "",
      `やらないこと: 台帳の書き換え、${NO_SEND}`,
    ],
  },
  trial_followup: {
    order: 3,
    label: "体験済み未入会のフォロー",
    amount: signal => `${signal.count}件`,
    assignee: "AIKA（守りの顧客対応・下書きまで）",
    estimateMinutes: 15,
    references: [
      "01_DAILY_OPERATIONS/体験予約・入会管理.md",
      "docs/ai-os/workflows/trial_followup.md",
      CANON_REF,
    ],
    humanCheckpoints: ["送るかどうかの判断", "送信操作", "料金・キャンペーンの確定"],
    title: signal => `体験に来て未入会の${signal.count}名へのフォロー文を用意する`,
    doneWhen: signal => [
      `${signal.count}名分の下書きが、押し売りにならない短文でできている`,
      "料金・入会条件が正本と一致している",
      "送る／送らないをJINが選べる形になっている",
    ],
    request: (signal, dateJst) => [
      `体験に来たあと入会が決まっていない${signal.count}名（${dateJst}時点）へのフォロー文を作ってください。`,
      "",
      "やること:",
      "1. `npm run trial-followup -- --status 検討中` で下書きの土台を出す",
      "2. 不安（料金・強さ・続けられるか）を1つだけ先回りして消す",
      "3. 押し売りにしない。返事がなくても気まずくならない終わり方にする",
      "",
      `やらないこと: ${NO_SEND}`,
    ],
  },
  in_progress: {
    order: 4,
    label: "進行中の仕事",
    amount: signal => `${signal.count}件`,
    assignee: "Claude Code（実装）",
    estimateMinutes: 30,
    references: ["01_DAILY_OPERATIONS/daily_logs/（status: IMPLEMENTING のメモ）", "COORDINATION.md"],
    humanCheckpoints: ["commit / push / 本番反映", "担当領域がCOORDINATIONで他AIの場合の着手"],
    title: signal => `進行中の仕事を1つ終わらせる: ${signal.detail ?? signal.evidence}`,
    doneWhen: () => [
      "動くところまで進んでいる（typecheck とテストが通る）",
      "終わっていない部分が、次に読む人に分かる形で書かれている",
      "commit / push はJIN承認前で止まっている",
    ],
    request: signal => [
      `進行中のまま止まっている仕事を1つ終わらせてください。`,
      "",
      `対象: ${signal.detail ?? signal.evidence}`,
      `根拠: ${signal.evidence}（${signal.observedOn}）`,
      "",
      "やること:",
      "1. 既存の実装と未コミット差分を先に読む（作り直さない）",
      "2. 足りない所だけを足す",
      "3. `npm run typecheck` と関連テストを通す",
      "",
      "やらないこと: 既存ファイルの全面上書き、commit、push、本番反映",
    ],
  },
  decision_support: {
    order: 5,
    label: "保留中の判断",
    amount: signal => `${signal.count}件`,
    assignee: "openQLOW（攻めの営業・経営支援）",
    estimateMinutes: 20,
    references: ["01_DAILY_OPERATIONS/daily_logs/（status: CONSIDERING のメモ）", CANON_REF],
    humanCheckpoints: ["採用するかどうかの決定", "お金・契約が動く選択"],
    title: signal => `保留のままの判断を、選べる形にする: ${signal.detail ?? signal.evidence}`,
    doneWhen: () => [
      "選択肢が2〜3個に絞られている",
      "それぞれの費用・手間・リスクが1行ずつ書かれている",
      "おすすめが1つだけ示され、決めるのはJINになっている",
    ],
    request: signal => [
      "保留のままになっている判断を、JINがその場で決められる形に整理してください。",
      "",
      `対象: ${signal.detail ?? signal.evidence}`,
      `根拠: ${signal.evidence}（${signal.observedOn}）`,
      "",
      "やること:",
      "1. 選択肢を2〜3個に絞る",
      "2. 1つずつ「費用・かかる手間・失敗したとき」を1行で書く",
      "3. おすすめを1つだけ選び、理由を1行で書く",
      "",
      "やらないこと: 新しい契約・課金・SaaS追加を前提にした案、決定そのもの",
    ],
  },
  growth: {
    order: 6,
    label: "体験を増やす",
    amount: signal => `目安に${signal.count}件不足`,
    assignee: "openQLOW（攻めの営業・経営支援）",
    estimateMinutes: 20,
    references: ["01_DAILY_OPERATIONS/体験予約・入会管理.md", "docs/ai-os/workflows/social_content.md", CANON_REF],
    humanCheckpoints: ["投稿・広告の公開", "費用が発生する判断"],
    title: signal => `体験が目標ペースに届いていない（${signal.detail ?? ""}）。体験につながる行動を1つ用意する`,
    doneWhen: () => [
      "今日出せる行動が1つだけ決まっている",
      "文面の下書きができている（公開はしない）",
      "狙う相手（初心者・女性・キッズ・親御さん・シニア）が1つに決まっている",
    ],
    request: (signal, dateJst) => [
      `体験の件数が目標ペースに届いていません（${signal.detail ?? ""}／${dateJst}時点）。今日1つだけ、体験につながる行動の下書きを作ってください。`,
      "",
      "やること:",
      "1. 狙う相手を1つに決める（初心者・女性・キッズ・親御さん・シニア）",
      "2. 投稿文か案内文の下書きを1本作る",
      "3. 効果が出たと言える条件（例: 問い合わせ1件）を先に書く",
      "",
      "やらないこと: 公開・配信、費用が発生する提案、新しい仕組みの追加",
    ],
  },
};

function parseDay(dateJst: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateJst);
  if (!match) return null;
  // 日付の差だけを見るので、時差の影響が出ない UTC 正午で扱う。
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** observedOn が dateJst から何日前か。比べられないときは null。 */
export function daysBefore(dateJst: string, observedOn: string): number | null {
  const today = parseDay(dateJst);
  const observed = parseDay(observedOn);
  if (today === null || observed === null) return null;
  return Math.round((today - observed) / 86_400_000);
}

function buildTask(signal: WorkSignal, dateJst: string): WorkOrderTask {
  const spec = KIND_SPECS[signal.kind];
  return {
    kind: signal.kind,
    title: spec.title(signal),
    reason: `${spec.label}: ${spec.amount(signal)}（根拠: ${signal.evidence} / ${signal.observedOn}）`,
    references: spec.references,
    doneWhen: spec.doneWhen(signal),
    assignee: spec.assignee,
    requestText: spec.request(signal, dateJst).join("\n"),
    humanCheckpoints: spec.humanCheckpoints,
    estimateMinutes: spec.estimateMinutes,
  };
}

/**
 * 手がかりから「今日の1件」を決める。
 * 該当が無ければ hasWork=false を返す。無理に仕事を作らない。
 */
export function buildAiWorkOrder(input: WorkOrderInput): WorkOrder {
  const staleAfterDays = input.staleAfterDays ?? 14;
  const skipped: string[] = [];
  const notes = [...(input.notes ?? [])];

  const alive: WorkSignal[] = [];
  for (const signal of input.signals) {
    if (signal.count <= 0) continue;
    const age = daysBefore(input.dateJst, signal.observedOn);
    if (age !== null && age > staleAfterDays) {
      skipped.push(`${KIND_SPECS[signal.kind].label}（${signal.evidence}）: ${age}日前で古いため、今日の仕事にしない`);
      continue;
    }
    alive.push(signal);
  }

  alive.sort((a, b) => KIND_SPECS[a.kind].order - KIND_SPECS[b.kind].order || b.count - a.count);

  const fits = (signal: WorkSignal): boolean =>
    input.minutesAvailable === undefined || KIND_SPECS[signal.kind].estimateMinutes <= input.minutesAvailable;

  const chosen = alive.find(fits);
  for (const signal of alive) {
    if (signal === chosen) continue;
    const spec = KIND_SPECS[signal.kind];
    skipped.push(
      fits(signal)
        ? `${spec.label}（${spec.amount(signal)}）: 今日は1件だけにするため見送り`
        : `${spec.label}（${spec.amount(signal)}）: 目安${spec.estimateMinutes}分で今日の持ち時間に入らない`,
    );
  }

  if (!chosen) {
    notes.push(
      alive.length === 0
        ? "根拠のある仕事が見つからないため、今日は追加のAI作業なし。"
        : "今日の持ち時間に収まる仕事が無いため、今日は追加のAI作業なし。",
    );
  }

  return {
    dateJst: input.dateJst,
    hasWork: Boolean(chosen),
    ...(chosen ? { task: buildTask(chosen, input.dateJst) } : {}),
    skipped,
    askHuman: (input.askHuman ?? []).slice(0, 2),
    notes,
  };
}

function block(heading: string, lines: string[]): string[] {
  return lines.length ? ["", `■ ${heading}`, ...lines] : [];
}

/** LINE・ターミナルのどちらでも読める1枚に整形する。 */
export function renderWorkOrder(order: WorkOrder): string {
  const lines: string[] = [`============ FLATUP / 今日のAI依頼（1件だけ） ${order.dateJst} ============`];

  if (order.task) {
    const task = order.task;
    lines.push(
      ...block("今日やること", [task.title]),
      ...block("今やる理由", [task.reason]),
      ...block("参照する資料", task.references.map(value => `- ${value}`)),
      ...block("完成条件", task.doneWhen.map(value => `- ${value}`)),
      ...block("担当するAI", [`${task.assignee}（目安 ${task.estimateMinutes}分）`]),
      ...block("そのまま使える依頼文（ここからコピー）", ["---", task.requestText, "---"]),
      ...block("人間確認が必要な地点", task.humanCheckpoints.map(value => `- ${value}`)),
    );
  } else {
    lines.push("", "■ 今日やること", "今日は追加のAI作業なし。今動いている仕事と現場を優先してください。");
  }

  lines.push(
    ...block("今日はやらないこと", order.skipped.map(value => `- ${value}`)),
    ...block("AIでは分からなかったこと（これだけ教えてください）", order.askHuman.map(value => `- ${value}`)),
    ...block("メモ", order.notes.map(value => `- ${value}`)),
    ...block("時間の記録（1週間だけ）", [
      "- 考えた時間: __分 / 依頼して確認した時間: __分 / 直した時間: __分",
      "- 記録先: 6_システム/AI作戦基地/06_AI依頼の時間記録.md",
    ]),
    "=====================================================================",
  );
  return lines.join("\n");
}
