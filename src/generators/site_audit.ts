// FLATUP集客AI司令塔 — サイト改善チェック（スペック ⑥）
//
// 公式サイトのテキスト/HTML を入力すると、初心者女性・キッズ保護者の視点で
// 「不安になる点 / 料金の分かりにくさ / 体験予約導線の弱さ / キッズ導線」などを
// ルールベースでチェックし、改善メモを生成する。
//
// 設計方針:
//   - ライブ取得（ネットワーク）はコアに持たない。入力は貼り付け/保存ファイルのテキスト。
//     → 他の generator と同じく純粋・決定的・テスト可能。取得は CLI 側で分離。
//   - これは簡易ヒューリスティックチェック。最終判断は人間が行う。
//   - 改善案の文面は FLATUP のやさしいトーン（怒鳴らない・初心者安心・初回500円）に寄せる。

export type AuditSeverity = "good" | "warn" | "missing";

export interface AuditFinding {
  /** チェック観点 */
  area: string;
  severity: AuditSeverity;
  /** 所見 */
  message: string;
  /** 改善案（good 以外のとき） */
  suggestion?: string;
}

export interface SiteAuditInput {
  /** サイトのテキストまたはHTML */
  content: string;
  /** ページ名（任意。例: トップページ） */
  pageLabel?: string;
}

export interface SiteAuditResult {
  pageLabel: string;
  findings: AuditFinding[];
  /** good=1 / warn=0.5 / missing=0 を平均した 0-100 のスコア */
  score: number;
  summary: string;
  notes: string[];
}

/** HTML タグ・script・style を除き、可視テキストに近い形へ正規化する。 */
function toVisibleText(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function any(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

function count(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

type Check = (text: string) => AuditFinding;

const CHECKS: Check[] = [
  // 1. 体験予約導線（CTA）
  (text): AuditFinding => {
    const area = "体験予約の導線";
    const hasStrongCta = any(text, [
      /体験.{0,6}(予約|申し?込|申込|お申し込み)/,
      /(予約|申し?込み?).{0,6}体験/,
      /体験はこちら/,
      /無料体験|初回体験/,
    ]);
    const mentionsTrial = any(text, [/体験/]);
    if (hasStrongCta) {
      return { area, severity: "good", message: "体験予約への明確な導線があります。" };
    }
    if (mentionsTrial) {
      return {
        area,
        severity: "warn",
        message: "体験には触れていますが、予約・申し込みの行動導線が弱いです。",
        suggestion: "「初回体験500円を予約する」ボタンをファーストビューに置き、押すと予約フォーム/LINEに直結させましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "体験予約の案内が見当たりません。",
      suggestion: "「初回体験500円」を主役にした予約ボタンを目立つ位置に追加しましょう。",
    };
  },

  // 2. 料金の明確さ
  (text): AuditFinding => {
    const area = "料金の分かりやすさ";
    const hasConcretePrice = any(text, [/\d{3,5}\s*円/, /500\s*円/]);
    const mentionsPrice = any(text, [/料金|月会費|会費|費用|価格/]);
    if (mentionsPrice && hasConcretePrice) {
      return { area, severity: "good", message: "料金が具体的な金額で示されています。" };
    }
    if (mentionsPrice || hasConcretePrice) {
      return {
        area,
        severity: "warn",
        message: "料金の記載はありますが、初回体験・月会費・入会金が一覧で分かりにくい可能性があります。",
        suggestion: "初回体験500円／月会費（キッズ・女性・男性）／入会金を1つの表でまとめ、追加費用が無いことも明記しましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "料金の記載が見当たりません。初心者がもっとも不安に感じる点です。",
      suggestion: "初回体験500円と月会費を表で明示しましょう。料金が見えないと問い合わせ前に離脱されます。",
    };
  },

  // 3. 初心者・女性の不安払拭
  (text): AuditFinding => {
    const area = "初心者・女性の安心感";
    const hits = count(text, [
      /初心者|未経験/,
      /女性|レディース/,
      /安心|やさしい|優しい/,
      /怒鳴らない|アットホーム|雰囲気/,
      /ガチスパー|安全|無理なく/,
    ]);
    if (hits >= 2) {
      return { area, severity: "good", message: "初心者・女性が安心できる表現があります。" };
    }
    if (hits === 1) {
      return {
        area,
        severity: "warn",
        message: "安心感を伝える表現がやや弱いです。",
        suggestion: "「初心者・女性が安心」「怒鳴らない」「ガチスパー禁止で安全」「女性インストラクター在籍」を具体的に書きましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "初心者や女性の不安に応える表現が見当たりません。",
      suggestion: "怖さ・続けられるか・周りの目という不安に、写真と言葉で先回りして応えましょう。",
    };
  },

  // 4. キッズ保護者の導線
  (text): AuditFinding => {
    const area = "キッズ保護者への訴求";
    const hits = count(text, [
      /キッズ|子供|子ども|小学生|お子様/,
      /礼儀|挨拶|集中力|自信/,
      /習い事|保護者|親子/,
    ]);
    if (hits >= 2) {
      return { area, severity: "good", message: "キッズ・保護者に向けた訴求があります。" };
    }
    if (hits === 1) {
      return {
        area,
        severity: "warn",
        message: "キッズ向けの情報はありますが、保護者の判断材料が不足しがちです。",
        suggestion: "キッズの曜日・時間、礼儀や自信が育つ点、見学できることを保護者目線で明記しましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "キッズ・保護者向けの導線が見当たりません。",
      suggestion: "キッズクラスの曜日時間と「楽しく礼儀・自信が身につく」点を、保護者向けに1セクション設けましょう。",
    };
  },

  // 5. アクセス・駐車場
  (text): AuditFinding => {
    const area = "アクセス・駐車場";
    const hasParking = any(text, [/駐車場|パーキング/]);
    const hasAccess = any(text, [/アクセス|住所|地図|成田|最寄|分/]);
    if (hasParking && hasAccess) {
      return { area, severity: "good", message: "駐車場とアクセス情報があります。" };
    }
    if (hasParking || hasAccess) {
      return {
        area,
        severity: "warn",
        message: "アクセスまたは駐車場のどちらかが不足しています。",
        suggestion: "「専用駐車場あり」と地図・住所・最寄りからの所要時間をセットで載せましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "アクセス・駐車場の情報が見当たりません。",
      suggestion: "成田の住所・地図・専用駐車場ありを明記すると、来店のハードルが下がります。",
    };
  },

  // 6. 問い合わせ（LINE）導線
  (text): AuditFinding => {
    const area = "問い合わせ・LINE導線";
    const hasLine = any(text, [/LINE|ライン/]);
    const hasContact = any(text, [/問い?合わせ|お問い合わせ|電話|tel|連絡|フォーム/i]);
    if (hasLine && hasContact) {
      return { area, severity: "good", message: "LINEを含む問い合わせ導線があります。" };
    }
    if (hasContact) {
      return {
        area,
        severity: "warn",
        message: "問い合わせ手段はありますが、気軽に聞けるLINE導線が弱いです。",
        suggestion: "「LINEで気軽に質問」ボタンを追加し、初回体験の予約までLINEで完結できるようにしましょう。",
      };
    }
    return {
      area,
      severity: "missing",
      message: "問い合わせ導線が見当たりません。",
      suggestion: "LINE・フォーム・電話のいずれかを目立つ位置に置き、迷わず連絡できるようにしましょう。",
    };
  },
];

const SEVERITY_POINT: Record<AuditSeverity, number> = { good: 1, warn: 0.5, missing: 0 };

/**
 * サイトのテキスト/HTML を入力に、改善観点のチェック結果を返す。
 * ネットワーク取得は行わない（入力テキストのみを評価する）。
 */
export function auditSite(input: SiteAuditInput): SiteAuditResult {
  const text = toVisibleText(input.content ?? "");
  const findings = CHECKS.map(check => check(text));

  const total = findings.reduce((sum, f) => sum + SEVERITY_POINT[f.severity], 0);
  const score = Math.round((total / findings.length) * 100);

  const goodCount = findings.filter(f => f.severity === "good").length;
  const improveCount = findings.length - goodCount;
  const summary = `${findings.length}観点中 ${goodCount}項目OK。改善候補 ${improveCount}件（スコア ${score}/100）。`;

  const notes = [
    "⚠ これはルールベースの簡易チェックです。最終的な改善判断は人間が行ってください。",
    "入力はサイトのテキスト/HTMLです。最新の状態を貼るか、保存したページを渡してください。",
    "HTMLタグ・script・styleは判定対象から除外しています（可視テキストで評価）。",
  ];

  return { pageLabel: input.pageLabel?.trim() || "サイト", findings, score, summary, notes };
}
