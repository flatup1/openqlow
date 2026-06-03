// 記憶係 /昨日の記録 のインタビュー進行ロジック
// 1 問ずつ質問し、回答に応じて next を決める純粋関数群。
// I/O は持たない（テスト容易性のため）。

import type { ConversationSession, Genre, GenreEntry } from "./session_store.js";
import { formatAge, formatName, sanitiseFreeText } from "../privacy/rules.js";

export interface QuestionDefinition {
  key: string;
  question: string;
  /** 回答を保存する前に通すサニタイズ関数 */
  sanitise?: (input: string) => string;
}

// ジャンル別の質問セット
const GENRE_QUESTIONS: Record<Genre, QuestionDefinition[]> = {
  trial: [
    { key: "name", question: "体験者の名前（姓だけでも、フルネームでもOK。プライバシー保護のためイニシャル化します）", sanitise: (s) => formatName(s) },
    { key: "gender", question: "性別を教えてください（男性 / 女性 / 不明）", sanitise: (s) => s.trim() },
    { key: "age_band", question: "年齢層は？（20代 / 30代 / キッズ / 不明 等）", sanitise: (s) => formatAge(s) },
    { key: "reaction", question: "体験中の反応はどうでしたか？（短く OK）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "enrollment_status", question: "入会しましたか？（はい / 保留 / いいえ / 検討中）", sanitise: (s) => s.trim() },
    { key: "hesitation_reason", question: "保留や見送りなら、迷っていた理由は？（料金 / 時間 / 不安 / 家族相談 / 不明 等。なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "next_action", question: "今後やるべきフォローを 1 行で（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
  enrollment: [
    { key: "name", question: "新規入会者の名前を教えてください", sanitise: (s) => formatName(s) },
    { key: "plan", question: "プランは？（成人 / キッズ / 女性 / その他）", sanitise: (s) => s.trim() },
    { key: "motivation", question: "入会の動機を一言で（なければ「不明」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "initial_followup", question: "初回フォローの予定があれば短く（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
  inquiry: [
    { key: "name", question: "問い合わせ者の名前（または「匿名」）", sanitise: (s) => formatName(s) },
    { key: "content", question: "問い合わせ内容を 1 行で", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "temperature", question: "温度感は？（高 / 中 / 低）", sanitise: (s) => s.trim() },
    { key: "reply_status", question: "AIKAから返信済みですか？（済 / 未 / 不明）", sanitise: (s) => s.trim() },
    { key: "next_action", question: "今後やるべきことを 1 行で（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
  member_change: [
    { key: "name", question: "気になる会員の名前を教えてください", sanitise: (s) => formatName(s) },
    { key: "reason", question: "気になる理由を 1 行で（出席減 / 怪我 / 様子 等）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "next_action", question: "Jinが今後やることを 1 行で（なければ「様子見」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
  other: [
    { key: "topic", question: "自由記述で 1 行どうぞ", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
  // /おはよう 専用：ジャンル選択メニューには出さない、6 問固定
  morning: [
    { key: "trial_yesterday", question: "1/6: 昨日、体験に来た人はいましたか？（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "enrollment_yesterday", question: "2/6: 入会した人はいましたか？（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "followup_needed", question: "3/6: 返信・フォローが必要な人はいますか？（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "concerning_member", question: "4/6: 気になった会員さんはいますか？（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "retention_risk", question: "5/6: 休みがち・退会しそうな人はいますか？（なければ「なし」）", sanitise: (s) => sanitiseFreeText(s.trim()) },
    { key: "today_top_task", question: "6/6: 今日やるべきことを 1 つだけ選ぶなら何ですか？", sanitise: (s) => sanitiseFreeText(s.trim()) },
  ],
};

export interface NextActionPrompt {
  /** 次にユーザーに送るべきプロンプト文 */
  prompt: string;
  /** セッションが終了状態に到達した場合 true */
  finished?: boolean;
}

const GENRE_LABEL: Record<Genre, string> = {
  trial: "体験者",
  enrollment: "新規入会",
  inquiry: "問い合わせ",
  member_change: "気になる会員",
  other: "その他",
  morning: "朝の質問",
};

const GENRE_CHOICES = [
  "a) 体験者",
  "b) 新規入会",
  "c) 問い合わせ",
  "d) 気になる会員",
  "e) その他",
  "f) もう終わり",
];

const YES_PATTERNS = /^(?:はい|y(?:es)?|あり|あった|YES|Yes|yes|有|ある|y)$/i;
const NO_PATTERNS = /^(?:いいえ|no|なし|無し|NO|No|n|無)$/i;

function parseYesNo(input: string): "yes" | "no" | "unknown" {
  const trimmed = input.trim();
  if (YES_PATTERNS.test(trimmed)) return "yes";
  if (NO_PATTERNS.test(trimmed)) return "no";
  // 単独「N」/「Y」もサポート
  return "unknown";
}

function parseGenreChoice(input: string): Genre | "end" | "unknown" {
  const t = input.trim().toLowerCase();
  if (/^(a|体験|体験者|trial)/i.test(t)) return "trial";
  if (/^(b|入会|enroll|新規)/i.test(t)) return "enrollment";
  if (/^(c|問い合わせ|問合|inquiry)/i.test(t)) return "inquiry";
  if (/^(d|会員|気になる|member)/i.test(t)) return "member_change";
  if (/^(e|その他|other|自由)/i.test(t)) return "other";
  if (/^(f|終わり|終わる|終り|終了|おわり|end|done|もう|なし)/i.test(t)) return "end";
  return "unknown";
}

export function buildYesNoQuestion(): string {
  return [
    "昨日、何か出来事はありましたか？（体験・入会・問い合わせ・会員の変化など）",
    "・はい → 続きを聞きます",
    "・なし → 記録終了。今日も静かに進めましょう。",
  ].join("\n");
}

export function buildGenreChoiceQuestion(): string {
  return [
    "ジャンルを選んでください（1 件ずつ記録します）：",
    ...GENRE_CHOICES.map(c => "・" + c),
    "",
    "頭の文字 1 つだけ送ってもらえれば OK です（例：a）。",
  ].join("\n");
}

export function buildMoreGenreQuestion(): string {
  return [
    "1 件分の記録が終わりました。",
    "他に記録すべきことはありますか？",
    "・追加する → ジャンルの頭文字を送ってください（a〜e）",
    "・終わる   → f / 終わる / 終わり",
  ].join("\n");
}

export function applyYesNoAnswer(session: ConversationSession, answer: string): NextActionPrompt {
  const parsed = parseYesNo(answer);
  if (parsed === "no") {
    session.step = "ready_to_save";
    session.skipSave = true; // 空ログを残さない
    return {
      prompt: "OPENQLOW（記憶係）：記録なしで終了。今日も静かに進めましょう。",
      finished: true,
    };
  }
  if (parsed === "yes") {
    session.step = "awaiting_genre_choice";
    return { prompt: buildGenreChoiceQuestion() };
  }
  return {
    prompt: [
      "「はい」または「なし」で答えてください。",
      buildYesNoQuestion(),
    ].join("\n"),
  };
}

export function applyGenreChoice(session: ConversationSession, answer: string): NextActionPrompt {
  const parsed = parseGenreChoice(answer);
  if (parsed === "end") {
    session.step = "ready_to_save";
    // genres が空なら保存スキップ（無駄ファイル作らない）
    if (session.genres.length === 0) {
      session.skipSave = true;
      return {
        prompt: "OPENQLOW（記憶係）：記録なしで終了。今日も静かに進めましょう。",
        finished: true,
      };
    }
    return {
      prompt: "OPENQLOW（記憶係）：記録の準備ができました。自動で保存します…",
      finished: true,
    };
  }
  if (parsed === "unknown") {
    return {
      prompt: [
        "選択肢の頭文字（a〜f）で送ってください。",
        buildGenreChoiceQuestion(),
      ].join("\n"),
    };
  }

  // 新規 GenreEntry を開始
  const entry: GenreEntry = {
    type: parsed,
    data: {},
    answers: [],
  };
  session.genres.push(entry);
  session.activeGenre = parsed;
  session.activeGenreQuestionIndex = 0;
  session.step = "awaiting_genre_detail";

  const firstQ = GENRE_QUESTIONS[parsed][0];
  return {
    prompt: `【${GENRE_LABEL[parsed]}】${firstQ.question}`,
  };
}

export function applyGenreDetailAnswer(session: ConversationSession, answer: string): NextActionPrompt {
  if (!session.activeGenre) {
    session.step = "awaiting_genre_choice";
    return { prompt: buildGenreChoiceQuestion() };
  }

  const questions = GENRE_QUESTIONS[session.activeGenre];
  const currentIndex = session.activeGenreQuestionIndex;
  const current = questions[currentIndex];
  if (!current) {
    // 既に範囲外。more へ。
    session.step = "awaiting_more_genre";
    return { prompt: buildMoreGenreQuestion() };
  }

  const sanitised = current.sanitise ? current.sanitise(answer) : answer.trim();
  const activeEntry = session.genres[session.genres.length - 1];
  if (activeEntry) {
    activeEntry.data[current.key] = sanitised;
    activeEntry.answers.push({ key: current.key, question: current.question, answer: sanitised });
  }

  // 次の質問に進む
  const nextIndex = currentIndex + 1;
  if (nextIndex >= questions.length) {
    // genre 完了
    const wasMorning = session.activeGenre === "morning";
    session.activeGenre = undefined;
    session.activeGenreQuestionIndex = 0;

    // morning は 6 問固定なので「他にある？」を聞かず即保存へ
    if (wasMorning) {
      session.step = "ready_to_save";
      return {
        prompt: "☀ 6 問終わりました。Obsidian に保存します…",
        finished: true,
      };
    }

    session.step = "awaiting_more_genre";
    return { prompt: buildMoreGenreQuestion() };
  }

  session.activeGenreQuestionIndex = nextIndex;
  const nextQ = questions[nextIndex];
  return { prompt: nextQ.question };
}

export function applyMoreGenreAnswer(session: ConversationSession, answer: string): NextActionPrompt {
  // 「a/b/c/d/e」なら新しいジャンルを開始、「f or 終わり」で完了
  return applyGenreChoice(session, answer);
}

export function advanceConversation(session: ConversationSession, answer: string): NextActionPrompt {
  switch (session.step) {
    case "awaiting_yes_no":
      return applyYesNoAnswer(session, answer);
    case "awaiting_genre_choice":
      return applyGenreChoice(session, answer);
    case "awaiting_genre_detail":
      return applyGenreDetailAnswer(session, answer);
    case "awaiting_more_genre":
      return applyMoreGenreAnswer(session, answer);
    case "ready_to_save":
      return {
        prompt: [
          "既に記録準備完了です。",
          "・「/保存用ログ」で Obsidian に保存",
          "・「/中止」でやり直し",
        ].join("\n"),
        finished: true,
      };
    default:
      return { prompt: "状態を認識できませんでした。/中止 でやり直してください。" };
  }
}

export const __interviewInternals = {
  GENRE_QUESTIONS,
  GENRE_LABEL,
  parseYesNo,
  parseGenreChoice,
};
