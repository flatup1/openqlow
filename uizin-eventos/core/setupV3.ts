import { isAppsScriptUrl, publicEntryHash, type PublicEntryConfig } from './publicEntry.ts';
import { parseClassSettings, type ClassSettings } from './classRules.ts';
import { isDefaultWeightSettings, parseWeightSettings, weightSettingsToParam, type WeightSettings } from './weightClass.ts';
import { formatDateInput } from './dateInput.ts';
import type { EntryFieldMode } from './entryPackage.ts';
import { hanamichiRuleOk } from './hanamichi.ts';
import { PLEDGE_LIMITS, packPledge, parsePledgeCanon, type GuardianMode, type PledgeConfig } from './pledge.ts';

/** Google側（Tournament_OS_Google受付_v3.gs）の RECEPTION_BUILD と同じ値。テストで一致を確認する。 */
export const EXPECTED_RECEPTION_BUILD = '3.20261022.7';
/** クラス分けが入る前の版（3.20261004.4）・階級分けが入る前の版（3.20261010.5）・花道の追加情報が入る前の版（3.20261019.6）も、そのまま使える（その分の機能が無いだけ）。古い順に並べる */
export const ACCEPTED_RECEPTION_BUILDS = ['3.20261004.4', '3.20261010.5', '3.20261019.6', EXPECTED_RECEPTION_BUILD] as const;

/** build が、受け付ける版の一覧の中で since 以降か。一覧に無い版は false。新しい版を足しても、前の版の判定が「古い」に変わらないよう、等しいかではなく、位置で比べる */
const buildSince = (build: string | undefined, since: (typeof ACCEPTED_RECEPTION_BUILDS)[number]): boolean => {
  const list = ACCEPTED_RECEPTION_BUILDS as readonly string[];
  const at = build === undefined ? -1 : list.indexOf(build);
  return at >= 0 && at >= list.indexOf(since);
};

/** このシートの受付（Googleのコード）は、階級分け・ロゴに対応した版（3.20261019.6 以降）か。古い版のシートでは、設定タブに階級分けの行を足しても、選手には出ない */
export const supportsWeightClasses = (ping: Pick<Ping, 'build'> | null | undefined): boolean => !!ping && buildSince(ping.build, '3.20261019.6');
/** このシートの受付は、花道の追加情報に対応した版（3.20261022.7 以降）か。古い版では、設定タブに行を足しても、ping に hanamichiMode が来ない */
export const supportsHanamichi = (ping: Pick<Ping, 'build'> | null | undefined): boolean => !!ping && buildSince(ping.build, '3.20261022.7');
/** このシートの受付は、誓約書に対応した版（3.20261022.7 以降）か。古い版は、ping に誓約書の印が来ない（来ても、リンクには付けない） */
export const supportsPledge = (ping: Pick<Ping, 'build'> | null | undefined): boolean => !!ping && buildSince(ping.build, '3.20261022.7');

export type Ping = {
  app: 'tournament-os'; protocol: 3; build: string; ready: boolean; accepting?: boolean;
  eventId?: string; testComplete?: boolean; settingsProblem?: string; storageProblem?: string;
  title?: string; date?: string; venue?: string; venueUrl?: string; organizer?: string; contact?: string; deadline?: string;
  music?: boolean; grade?: EntryFieldMode; age?: EntryFieldMode; comment?: EntryFieldMode; error?: string;
  classMode?: boolean; classes?: ClassSettings;
  /** 「設定」タブに、クラスの行が無い（古い版のコピー）ときだけ false が来る。ふつうは来ない */
  classRows?: boolean;
  /** 階級分け（区分→階級）。「設定」タブの「階級分け」が「あり」のときだけ weightMode が true で来る。weights は、区分ごとの階級の一覧 */
  weightMode?: boolean; weights?: WeightSettings;
  /** 「設定」タブに、階級分けの行が無い（古い版のコピー）ときだけ false が来る */
  weightRows?: boolean;
  /** 「設定」タブの「ロゴ」が「あり」のときだけ true で来る */
  logo?: boolean;
  /** 「設定」タブの「花道の追加情報」が「あり」で、設定に問題がないときだけ true で来る（個人情報・項目名は来ない）。「なし」のときは鍵ごと無い */
  hanamichiMode?: boolean;
  /**
   * 花道のルールの1行（「設定」タブの「花道のルール」）。クラス分けが「あり」で、選べる区分に「花道」の入った名前があり、設定に問題がないときだけ来る。
   * これがあると、花道の区分を選んだ人には、クラスを選ばせず、この1行を見せる。無いとき（クラス分けが「なし」・花道の区分が無い・古い版）は鍵ごと無い。1〜120字
   */
  hanamichiRule?: string;
  /**
   * 「設定」タブの「誓約書」が「あり」で、設定に問題がないときだけ来る。「なし」のときは、ここから下の6つの鍵ごと無い。
   * pledgeCanon＝文のひとまとめ（JSON の文字 {items, guardian, gym}。形と長さが守れていなければ、読み取りで捨てて undefined）／pledgeHash＝その指紋（16進の小文字64字）／
   * guardianMode＝保護者の同意を求める相手／gymMode＝ジム責任者の欄を出すか／pledgeChecked＝会長が文を「済み」にしたか（来なければ、まだ）
   */
  pledgeMode?: boolean; pledgeCanon?: string; pledgeHash?: string; guardianMode?: GuardianMode; gymMode?: boolean; pledgeChecked?: boolean;
  /** 見出しが変わったときだけ来る：直すタブの名前・マス・あるべき見出し（申込の中身・メールは来ない） */
  errorTab?: string; errorCell?: string; errorExpected?: string;
  /** 見出しの問題の種類：列が足された（その列を消す）／1行目が消えた（上に1行入れる）。どちらでもなければ、見出しの文字がちがう */
  errorInserted?: boolean; errorRowGone?: boolean;
  /** 受付が止まっている理由。deadline＝締切を過ぎた／stopped＝会長が③で止めた。受付中や、まだ開始前のときは来ない */
  closedBy?: 'deadline' | 'stopped';
};

export function pingUrl(endpoint: string): string {
  const value = endpoint.trim();
  if (!isAppsScriptUrl(value)) throw new Error('「https://script.google.com/macros/s/…/exec」で終わるURLを貼ってください。');
  return value + '?action=ping';
}

/** 受け取るのは公開してよい項目だけ。知らない項目は捨てる。 */
export function parsePing(value: unknown): Ping {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || v.app !== 'tournament-os' || v.protocol !== 3 || typeof v.build !== 'string' || typeof v.ready !== 'boolean') throw new Error('これはTournament OSの受付ではありません。貼ったURLを確認してください。');
  const text = (key: string, max = 300) => (typeof v[key] === 'string' && (v[key] as string).length <= max ? (v[key] as string) : undefined);
  /** 長すぎても捨てない（捨てると「直すところはない」と読めてしまう）。切りつめて、あることだけは残す */
  const clip = (key: string, max: number) => (typeof v[key] === 'string' ? (v[key] as string).slice(0, max) : undefined);
  const flag = (key: string) => (typeof v[key] === 'boolean' ? (v[key] as boolean) : undefined);
  const mode = (key: string): EntryFieldMode | undefined => (v[key] === 'off' || v[key] === 'optional' || v[key] === 'required' ? (v[key] as EntryFieldMode) : undefined);
  return {
    app: 'tournament-os', protocol: 3, build: v.build.slice(0, 40), ready: v.ready, accepting: flag('accepting'), eventId: text('eventId', 64), testComplete: flag('testComplete'), settingsProblem: clip('settingsProblem', 600), storageProblem: clip('storageProblem', 600),
    title: text('title'), date: text('date', 20), venue: text('venue'), venueUrl: text('venueUrl', 500), organizer: text('organizer'), contact: text('contact'), deadline: text('deadline', 20),
    music: flag('music'), grade: mode('grade'), age: mode('age'), comment: mode('comment'), error: text('error', 40),
    classMode: flag('classMode'), classes: v.classMode === true ? parseClassSettings(v.classes) : undefined,
    classRows: v.classRows === false ? false : undefined,
    weightMode: flag('weightMode'), weights: v.weightMode === true ? parseWeightSettings(v.weights) : undefined,
    weightRows: v.weightRows === false ? false : undefined,
    logo: v.logo === true ? true : undefined,
    ...(v.hanamichiMode === true ? { hanamichiMode: true } : {}),
    // 花道のルール：前後の空白を取って、1〜120字・対になっていないサロゲートなしのものだけ。読めなければ捨てる（クラスを選ばせるのは、今までどおり）
    ...(typeof v.hanamichiRule === 'string' && hanamichiRuleOk(v.hanamichiRule.trim()) ? { hanamichiRule: v.hanamichiRule.trim() } : {}),
    // 誓約書：「あり」のときだけ。文は形と長さを調べて、守れていなければ捨てる（pledgeMode だけ残るので、読み取る側が「文を読めない」と言える）
    ...(v.pledgeMode === true ? { pledgeMode: true, pledgeCanon: typeof v.pledgeCanon === 'string' && parsePledgeCanon(v.pledgeCanon) ? v.pledgeCanon : undefined, pledgeHash: typeof v.pledgeHash === 'string' && /^[0-9a-f]{64}$/.test(v.pledgeHash) ? v.pledgeHash : undefined, guardianMode: v.guardianMode === 'under18' || v.guardianMode === 'all' || v.guardianMode === 'none' ? (v.guardianMode as GuardianMode) : undefined, gymMode: flag('gymMode'), pledgeChecked: v.pledgeChecked === true } : {}),
    errorTab: text('errorTab', 60), errorCell: text('errorCell', 6), errorExpected: text('errorExpected', 60),
    errorInserted: v.errorInserted === true ? true : undefined, errorRowGone: v.errorRowGone === true ? true : undefined,
    closedBy: v.closedBy === 'deadline' || v.closedBy === 'stopped' ? v.closedBy : undefined,
  };
}

/** 自動確認が使えないとき、確認ページに出た文字を貼ってもらう。出る項目は公開してよいものだけ。 */
export function parsePingText(text: string): Ping {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new Error('貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。'); }
  return parsePing(value);
}

export type Stage = 'old-build' | 'not-setup' | 'wrong-owner' | 'sharing' | 'folder' | 'headers' | 'missing-tab' | 'bad-settings' | 'storage-full' | 'need-selftest' | 'need-open' | 'closed' | 'ready';
export type Diagnosis = { stage: Stage; ok: boolean; message: string };

/** 申込表の1行目（見出し）が変わっているとき、直すタブ・マス・あるべき文字を言う。列が足されたときは、見出しを書き直さず、足した列を消す。 */
function headersMessage(ping: Ping): string {
  if (!ping.errorTab || !ping.errorCell || !ping.errorExpected) return '申込表の1行目（見出し）が変わっています。ジムの担当者に、この画面を見せてください。';
  const column = ping.errorCell.replace(/\d+$/, '');
  // 1行目を消したとき：見出しを打ち直すと、最初の申込の受付番号を上書きしてしまう。上に1行入れる
  if (ping.errorRowGone) return '「' + ping.errorTab + '」タブの1行目の見出しが、消えています。まず「元に戻す」を押します（Ctrl を押しながら Z。Macは ⌘ を押しながら Z）。戻らないときは、いちばん上の行を右クリックして、「上に1行挿入」を押します。そのあと、ジムの担当者に、見出しを書き直してもらいます。申込は消えません。';
  // 列を足したとき：見出しを打ち直すと、見出しだけ合って、中身が1列ずれたままになる。足した列を消す
  if (ping.errorInserted) return '「' + ping.errorTab + '」タブに、列が足されています（' + column + '列）。' + column + '列を消してください（' + column + '列の上で右クリック →「列を削除」）。見出しは、書き直しません。';
  return '「' + ping.errorTab + '」タブの' + ping.errorCell + 'を、「' + ping.errorExpected + '」に直してください。（行や列を足したり、並べかえたりしないでください）';
}

/** 画面に出す「次の1つ」。迷う原因（古い版・設定前・設定の間違い）を1行で言う。 */
export function diagnose(ping: Ping): Diagnosis {
  if (!(ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes(ping.build)) return { stage: 'old-build', ok: false, message: 'Googleの版が古いです。ひな形をもう一度コピーするか、「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」を押してください。' };
  if (!ping.ready) {
    // Google側が「設定前」ではなく、別の理由で止まっているとき。①を押しても直らないものは、それぞれ別の案内にする
    if (ping.error === 'owner') return { stage: 'wrong-owner', ok: false, message: 'デプロイは、①を押したのと同じGoogleアカウントでやり直します。（Googleの右上の丸いアイコンで、どのアカウントか確かめます）' };
    if (ping.error === 'sharing') return { stage: 'sharing', ok: false, message: 'シートと写真フォルダの共有を「制限付き」にしてください。' };
    if (ping.error === 'folder') return { stage: 'folder', ok: false, message: 'Googleドライブの「Tournament OS 顔写真」フォルダが、ゴミ箱に入っているか、見つかりません。Googleドライブの「ゴミ箱」を開き、そのフォルダを選んで「元に戻す」を押してください。戻したら、シートのメニュー「Tournament OS」→「① 最初の設定」を押します。' };
    if (ping.error === 'headers') return { stage: 'headers', ok: false, message: headersMessage(ping) };
    if (ping.error === 'missing') return { stage: 'missing-tab', ok: false, message: (ping.errorTab ? '「' + ping.errorTab + '」タブ' : '申込表のタブ') + 'が見つかりません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押すと、作り直します。' };
    return { stage: 'not-setup', ok: false, message: 'まだ最初の設定が終わっていません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押してください。' };
  }
  if (ping.settingsProblem) return { stage: 'bad-settings', ok: false, message: 'シートの「設定」タブを直してください。' + ping.settingsProblem };
  if (ping.storageProblem) return { stage: 'storage-full', ok: false, message: ping.storageProblem };
  if (!ping.testComplete) return { stage: 'need-selftest', ok: false, message: 'つながりました。自動テストがまだです。シートのメニュー「Tournament OS」→「① 最初の設定」をもう一度押してください。' };
  // 締切を過ぎた／会長が③で止めた：受付は終わっている。「あと1つで完成」とは言わず、選手に渡さない
  if (!ping.accepting && ping.closedBy === 'deadline') return { stage: 'closed', ok: false, message: '締切を過ぎたので、受付は終わっています。選手は、もう申し込めません。' };
  if (!ping.accepting && ping.closedBy === 'stopped') return { stage: 'closed', ok: false, message: '受付を止めています。選手は、いま申し込めません。' };
  if (!ping.accepting) return { stage: 'need-open', ok: false, message: 'つながりました。テストもできています。次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。' };
  return { stage: 'ready', ok: true, message: '受付できます。選手に渡すURLをコピーできます。' };
}

/** 申込ページへ渡す大会の情報は、Googleのシートの「設定」タブから読んだものだけ。画面で入れ直さない。 */
export function entryConfigFromPing(ping: Ping, endpoint: string, mode: 'test' | 'live'): PublicEntryConfig {
  const need = [ping.eventId, ping.title, ping.date, ping.venue, ping.organizer, ping.contact, ping.deadline];
  if (!isAppsScriptUrl(endpoint) || need.some((v) => !v)) throw new Error('シートの「設定」タブが、まだ全部入っていません。');
  if (ping.classMode && !ping.classes) throw sheetFixError('クラス分けが「あり」ですが、クラスの内容を読めませんでした。「設定」タブのクラスの欄（B13〜B20）を確かめてください。');
  if (ping.weightMode && !ping.weights) throw sheetFixError('階級分けが「あり」ですが、区分と階級の表を読めませんでした。「設定」タブの「階級：…」の行を確かめてください（階級は、-37、-40、+60、無差別 のように書きます）。');
  const config: PublicEntryConfig = {
    endpoint: endpoint.trim(), protocol: '3', mode, eventId: ping.eventId!, title: ping.title!, organizer: ping.organizer!, date: formatDateInput(ping.date!), venue: ping.venue!, venueUrl: ping.venueUrl || '',
    deadline: ping.deadline!, contact: ping.contact!, music: ping.music === true, grade: ping.grade || 'optional', age: ping.age || 'optional', comment: ping.comment || 'optional',
    ...(ping.classes ? { classes: ping.classes } : {}),
    // 花道のルール：クラス分けがあるときだけ（リンクに hr が付く）。「なし」・古い版では、項目ごと無い
    ...(ping.classes && ping.hanamichiRule ? { hanamichiRule: ping.hanamichiRule } : {}),
    ...(ping.weights ? { weights: ping.weights } : {}),
    ...(ping.logo ? { logo: true } : {}),
    // 花道の追加の質問は、対応した版のシートが「あり」と言ったときだけ（リンクに hn=on が付く）。「なし」・古い版では、項目ごと無い
    ...(ping.hanamichiMode && supportsHanamichi(ping) ? { hanamichi: true } : {}),
    // 誓約書は、対応した版のシートが「あり」と言ったときだけ（リンクに pl・plg・plm・plc・plf・plt が付く）。「なし」・古い版では、項目ごと無い
    ...pledgeFromPing(ping),
  };
  if (publicEntryHash(config).length > 4500) throw sheetFixError(longestFieldMessage(ping));
  return config;
}

/** 「設定」タブを直せば解決する問題（画面では、設定の直しものとして出す）。 */
export class SheetFixError extends Error {}
function sheetFixError(message: string): SheetFixError { return new SheetFixError(message); }

/**
 * 誓約書の決まりと文を、ping から読む（申し込みリンクに入れる形）。ping の文（pledgeCanon）は Google が作ったもの。ここでは作らず・直さず、そのまま使う。
 * 「なし」（pledgeMode が無い）・この版が対応していない → 何も足さない（{}）。「あり」なのに、文・指紋・決まりのどれかが読めない → 直しもの（リンクを作らない）。
 */
function pledgeFromPing(ping: Ping): { pledge?: PledgeConfig; pledgeHash?: string } {
  if (!ping.pledgeMode || !supportsPledge(ping)) return {};
  const texts = parsePledgeCanon(ping.pledgeCanon);
  if (!texts || !ping.pledgeHash || !ping.guardianMode || typeof ping.gymMode !== 'boolean') {
    // 1つの問題＝1つの文（文の中に「。」を入れない。設定の直しものは「。」で割って1文ずつ出すため）
    throw sheetFixError('誓約書が「あり」ですが、「誓約書」タブの文を読めませんでした（項目は' + PLEDGE_LIMITS.items + '個まで、1項目' + PLEDGE_LIMITS.item + '文字まで、全部で' + PLEDGE_LIMITS.total + '文字までなので、「誓約書」タブを確かめてください）。');
  }
  return { pledge: { items: texts.items, guardian: texts.guardian, gym: texts.gym, mode: ping.guardianMode, gymMode: ping.gymMode, confirmed: ping.pledgeChecked === true }, pledgeHash: ping.pledgeHash };
}

/** リンクの plt に入る誓約書の文の長さ（packPledge の長さ。1文字が約2.7文字になる）。「あり」でないとき・読めないときは 0 */
function pledgeLinkSize(ping: Ping): number {
  if (!ping.pledgeMode || !supportsPledge(ping)) return 0;
  const texts = parsePledgeCanon(ping.pledgeCanon);
  return texts ? packPledge(texts.items, texts.guardian, texts.gym).length : 0;
}

/** 診断の1行に書く、保護者の同意を求める相手の言い方（「設定」タブの「保護者の同意」の▼と同じ言葉） */
const GUARDIAN_MODE_TEXT: Record<GuardianMode, string> = { under18: '18歳未満のみ', all: '全員', none: 'なし' };

/** 会長が文を「済み」にしていないとき、診断の赤い✕に足す1文（操作の言葉だけ。URLは出る。止めるのは、申し込みページとGoogleの受付） */
export const PLEDGE_UNCONFIRMED_ADVICE = '会長が原本と見比べて、設定タブの「誓約書の文の確認」を「済み」にするまで、本番のURLは選手に送らないでください。';

/**
 * 設定の画面の診断に出す、誓約書の1行。「なし」・この版が対応していない・文が読めない（その場合は entryConfigProblem が赤い直しものを出す）→ undefined（何も足さない）。
 * line＝「誓約書：あり（5項目・保護者の同意：18歳未満のみ・ジム責任者：あり）・会長の確認：まだ」／confirmed＝会長の確認が「済み」か／gym＝ジム責任者の欄があるか（画面は ping の鍵を読まない。「選手に送る前の説明」が、ジム責任者の名前・電話も覚えると言うかどうかに使う）
 */
export function pledgeDiagnosis(ping: Ping | null | undefined): { line: string; confirmed: boolean; gym: boolean } | undefined {
  if (!ping || !ping.pledgeMode || !supportsPledge(ping) || !ping.pledgeHash || !ping.guardianMode || typeof ping.gymMode !== 'boolean') return undefined;
  const texts = parsePledgeCanon(ping.pledgeCanon);
  if (!texts) return undefined;
  const confirmed = ping.pledgeChecked === true;
  return { line: '誓約書：あり（' + texts.items.length + '項目・保護者の同意：' + GUARDIAN_MODE_TEXT[ping.guardianMode] + '・ジム責任者：' + (ping.gymMode ? 'あり' : 'なし') + '）・会長の確認：' + (confirmed ? '済み' : 'まだ'), confirmed, gym: ping.gymMode };
}

/** URLが長すぎるとき、いちばん長い欄を名前で言う（クラスだけのせいにしない）。 */
function longestFieldMessage(ping: Ping): string {
  const parts: [string, string, string][] = [
    ['大会名', 'B2', ping.title || ''], ['会場', 'B4', ping.venue || ''], ['会場の地図URL', 'B5', ping.venueUrl || ''], ['主催者名', 'B6', ping.organizer || ''], ['問い合わせ先', 'B7', ping.contact || ''],
    ['上のクラスの条件', 'B15', ping.classes?.upper.condition || ''], ['上のクラスのルール', 'B16', ping.classes?.upper.rule || ''], ['下のクラスの条件', 'B18', ping.classes?.lower.condition || ''], ['下のクラスのルール', 'B19', ping.classes?.lower.rule || ''],
  ];
  // リンクの中では、日本語の1文字が9文字ぶんになる。長さは、リンクに入る形（encodeURIComponent）で比べる
  const size = (value: string): number => encodeURIComponent(value).length;
  const top = parts.reduce((a, b) => (size(b[2]) > size(a[2]) ? b : a));
  const classy = top[0].includes('クラス');
  // 階級の表（区分と階級）が長いときは、表のほうを言う。はじめの表と同じなら、リンクに何も足さないので、数えない
  const weightSize = ping.weights && !isDefaultWeightSettings(ping.weights) ? size(weightSettingsToParam(ping.weights)) : 0;
  // 誓約書の文は、リンクの中では plt（packPledge）の長さ。いちばん長いのが誓約書なら、誓約書のせいだと言う
  const pledgeSize = pledgeLinkSize(ping);
  if (pledgeSize > size(top[2]) && pledgeSize > weightSize) return '誓約書の文が長すぎて、選手に渡すURLに入りません。「誓約書」タブの項目を、減らすか短くしてください。';
  if (weightSize > size(top[2])) return '階級の表（区分と階級）が長すぎて、選手に渡すURLに入りません。「設定」タブの「階級：…」の行を、減らすか短くしてください。';
  return (classy ? 'クラスの' : '') + '文が長すぎて、選手に渡すURLに入りません。「' + top[0] + '」（セル ' + top[1] + '）を短くしてください。';
}

/** 申込ページに渡す内容が作れない理由のうち、「設定」タブを直せば解決するもの（なければ空）。 */
export function entryConfigProblem(ping: Ping, endpoint: string): string {
  try { entryConfigFromPing(ping, endpoint, 'live'); return ''; } catch (e) { return e instanceof SheetFixError || (e instanceof Error && e.message.startsWith('クラス')) ? e.message : ''; }
}

/** ひな形（オーナーが自分のシートを公開用にしたもの）のURLから、会長が開く「コピーを作る」リンクを作る。 */
export function templateCopyLink(sheetUrl: string): string {
  const match = sheetUrl.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})(?:[/?#].*)?$/);
  if (!match) throw new Error('GoogleスプレッドシートのURL（https://docs.google.com/spreadsheets/d/…）を貼ってください。');
  return 'https://docs.google.com/spreadsheets/d/' + match[1] + '/copy';
}

export function isTemplateCopyLink(value: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]{20,}\/copy$/.test(value.trim());
}

export type SetupFile = { kind: 'tournament-os-setup'; version: 2; eventId: string; endpoint: string };

const FORBIDDEN = /@|TOS2\./;

/** 設定の書き出し。大会の中身はGoogleのシートにあるので、ここに入れるのは「この画面での大会名札」と受付URLだけ。 */
export function exportSetup(file: Omit<SetupFile, 'kind' | 'version'>): string {
  const body: SetupFile = { kind: 'tournament-os-setup', version: 2, ...file };
  for (const v of [body.eventId, body.endpoint]) if (FORBIDDEN.test(v)) throw new Error('設定に連絡先や鍵らしい文字が入っています。書き出しを止めました。');
  return JSON.stringify(body, null, 2);
}

export function importSetup(text: string): SetupFile {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text); } catch { throw new Error('設定ファイルを読めません。書き出したファイルを選んでください。'); }
  if (!value || value.kind !== 'tournament-os-setup' || value.version !== 2) throw new Error('これはTournament OSの設定ファイルではありません。');
  const eventId = value.eventId, endpoint = value.endpoint;
  if (typeof eventId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventId)) throw new Error('設定ファイルの名札が正しくありません。');
  if (typeof endpoint !== 'string' || (endpoint !== '' && !isAppsScriptUrl(endpoint))) throw new Error('設定ファイルの受付URLが正しくありません。');
  return { kind: 'tournament-os-setup', version: 2, eventId, endpoint };
}

/**
 * 古いブラウザか。:has が使えない（古いSafari 15.3以前・古いChrome）、または古いSafariと名乗る、または古いIE。
 * 見つけたら、黄色の注意で「Chromeで開いてください」と言う（止めはしない）。
 */
export function isOldBrowser(ua: string, css: { supports?: (q: string) => boolean } | undefined): boolean {
  if (/MSIE |Trident\//.test(ua)) return true;
  if (!css || typeof css.supports !== 'function') return true;
  try { if (!css.supports('selector(:has(*))')) return true; } catch { return true; }
  const safari = /Version\/(\d+)\.(\d+)[^]*Safari\//.exec(ua);
  if (safari && !/Chrome|Chromium|CriOS|FxiOS|Edg\/|EdgiOS|OPR\//.test(ua) && (Number(safari[1]) < 15 || (Number(safari[1]) === 15 && Number(safari[2]) < 4))) return true;
  return false;
}

/* ---------- 「設定」タブの直すところを、セル番号つきの短い文にする（画面の赤い箱） ---------- */

/** 「設定」タブで、会長が必ず書く行の印（色の名前は使わない。シートのC列にも同じ印が書いてある） */
export const WRITE_MARK = '「✎ ここに書く」';
/** シートの「設定」タブの、B列のセル番号（.gs の SETTING_ROWS と同じ順番） */
export const CELL: Record<string, string> = { 大会名: 'B2', 開催日: 'B3', 会場: 'B4', 会場の地図URL: 'B5', 主催者名: 'B6', 問い合わせ先: 'B7', 申込締切: 'B8', 入場曲: 'B9', 学年: 'B10', 年齢: 'B11', 意気込み: 'B12' };
/** クラス分けの8行（12行目のあとに足した行。.gs の SETTING_ROWS の最後の8つと同じ順番）。古いコピーには、この行がない */
export const CLASS_CELL: Record<string, string> = { クラス分け: 'B13', 上のクラスの名前: 'B14', 上のクラスの条件: 'B15', 上のクラスのルール: 'B16', 下のクラスの名前: 'B17', 下のクラスの条件: 'B18', 下のクラスのルール: 'B19', 上のクラスにする勝ち数: 'B20' };
/** 階級分けとロゴの行（クラスの8行のあとに足した行）。区分の行（「階級：…」）は、主催者が増やしたり消したりできる（消すと、下の行の番号が1つずつ上がる）ので、番号を持たせない。区分の行は、いちばん下にまとめてある */
export const WEIGHT_CELL: Record<string, string> = { 階級分け: 'B21', ロゴ: 'B22' };
// 「花道の追加情報」の行は、区分の行のあと（いちばん下）にあるので、番号を持たせない。場所は『A列が「花道の追加情報」の行のB列』と言う（settingLines）
export const HOW: Record<string, string> = {
  大会名: '例：第3回 青空ジム大会 のように入れる', 開催日: '2027年10月3日 のように入れる', 会場: '例：○○体育館 のように入れる', 主催者名: '例：○○ジム のように入れる',
  問い合わせ先: '電話番号か、LINEのURLを入れる', 申込締切: '2027年9月20日 のように入れる（開催日と同じか、その前の日）', 入場曲: '▼から「なし」を選ぶ（はじめは「なし」。選手に入場曲のリンクを書いてもらうときだけ「あり」）',
};
const ALL_KEYS = [...Object.keys(CELL), ...Object.keys(CLASS_CELL), ...Object.keys(WEIGHT_CELL)].sort((a, b) => b.length - a.length);
/** 欄の名前から、セルの番号を引く。名前がそのまま合うものを先に、なければ「いちばん長い名前で始まるもの」（「会場」より「会場の地図URL」が先） */
export function cellOf(name: string): { key: string; cell: string } | undefined {
  const all: Record<string, string> = { ...CELL, ...CLASS_CELL, ...WEIGHT_CELL };
  if (all[name]) return { key: name, cell: all[name] };
  const key = ALL_KEYS.find((k) => name.startsWith(k));
  return key ? { key, cell: all[key] } : undefined;
}

/** 「設定」タブの直すところを、行・セル番号つきの短い文に直す。google は Google の言葉そのまま、fixes は画面の言葉。 */
export function settingLines(message: string): { google: string; fixes: string[] }[] {
  const body = message.replace(/^シートの「設定」タブを直してください。/, '');
  // 申込ページに入れられない理由（クラスの内容・文が長すぎる）は、1つの文のまま出す
  if (/^クラス|^階級分け|長すぎて、選手に渡すURLに入りません/.test(body)) return [{ google: body, fixes: [body] }];
  return (body || message).split('。').filter(Boolean).map((item) => {
    // 花道の追加情報の行は、区分の行のあと（いちばん下）にある。セルの番号は言わず、A列の名前で探してもらう（文の中に場所があるときは、そのまま）
    if (/「花道の追加情報」/.test(item)) return { google: item, fixes: [/A列が「花道の追加情報」の行/.test(item) ? item : item + '（「設定」タブの、A列が「花道の追加情報」の行のB列。▼から選び直す）'] };
    // 誓約書の4つの行（「誓約書」「保護者の同意」「ジム責任者の同意」「誓約書の文の確認」）も、区分の行のあと（いちばん下）にある。セルの番号は言わず、A列の名前で探してもらう
    const pledgeRow = item.match(/^「(誓約書|保護者の同意|ジム責任者の同意|誓約書の文の確認)」は、.+のどれかにしてください$/);
    if (pledgeRow) return { google: item, fixes: [item + '（「設定」タブの、A列が「' + pledgeRow[1] + '」の行のB列。▼から選び直す）'] };
    const miss = item.match(/次の欄を入れてください：(.+)$/);
    if (miss) {
      return { google: item, fixes: miss[1].split('、').map((n) => { const hit = cellOf(n); return hit ? hit.key + '（' + hit.cell + '）：書いてありません。' + (CLASS_CELL[hit.key] ? '右どなり（C列）の例を見て書く' : HOW[hit.key] || WRITE_MARK + 'の行に書く') : n + '：書いてありません'; }) };
    }
    // クラス分けの欄（B13〜B20）。Googleの文のうしろに、直すセルの番号を足す
    const classCells = Array.from(new Set(Array.from(item.matchAll(/「(.+?)」/g)).map((m) => CLASS_CELL[m[1]] || WEIGHT_CELL[m[1]]).filter(Boolean)));
    // 区分の行（「階級：…」）は、主催者が消したり足したりするので、セルの番号は言わない。A列の名前で探す
    // 「階級：…」の行（名前のない言い方）の文は、特定の行ではないので、「A列がその名前の行」とは言わない
    const divisionRow = /「階級：.+?」/.test(item) && !/「階級：…」の行/.test(item);
    if (classCells.length) return { google: item, fixes: [item + '（セル ' + classCells.join('・') + (divisionRow ? '。区分の行は、A列がその名前の行のB列' : '') + '）'] };
    if (divisionRow) return { google: item, fixes: [item + '（「設定」タブの、A列がその名前の行のB列）'] };
    if (/「階級：…」の行は12こまで/.test(item)) return { google: item, fixes: [item + '（使わない区分の行を消します）'] };
    const k = (item.match(/「(.+?)」/) || [])[1];
    const hit = k ? cellOf(k) : undefined;
    if (!hit) return { google: item, fixes: [item] };
    const cell = hit.key + '（' + hit.cell + '）：';
    const limit = item.match(/(\d+)文字までにしてください/);
    if (limit) return { google: item, fixes: [cell + limit[1] + '文字までに、短くする'] };
    if (hit.key === '開催日') return { google: item, fixes: [cell + '2027年10月3日 のように入れる'] };
    if (hit.key === '申込締切') return { google: item, fixes: [cell + (item.includes('開催日と同じ') ? '開催日と同じか、それより前の日にする' : '2027年9月20日 のように入れる')] };
    if (hit.key === '会場の地図URL') return { google: item, fixes: [cell + 'Googleマップの「共有」で出るURLにするか、空にする'] };
    if (/のどれかにしてください/.test(item)) return { google: item, fixes: [cell + '▼から選び直す'] };
    return { google: item, fixes: [item + '（セル ' + hit.cell + '）'] };
  });
}
