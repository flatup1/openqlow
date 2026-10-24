import { normalizeClass, parseClassSettings, type ClassSettings } from './classRules.ts';
import { weightChoiceError, weightSettingsToParam, weightsFromParam, type WeightSettings } from './weightClass.ts';

export type EntryFighter = {
  id: string;
  gym: string;
  name: string;
  grade: string;
  age: string;
  height: string;
  weight: string;
  record: string;
  comment: string;
  musicUrl: string;
  /** クラス（例：Aクラス）。クラスを使う大会だけ。個人情報ではない */
  fighterClass?: string;
  /** 区分（例：中学生男子）と階級（例：37kg以下）。階級分けをする大会だけ。個人情報ではない */
  division?: string;
  weightClass?: string;
};

export type EntryFieldMode = 'off' | 'optional' | 'required';
export type EntryFormConfig = { music: boolean; grade: EntryFieldMode; age: EntryFieldMode; comment: EntryFieldMode; /** クラスを使う大会の設定（シートの「設定」タブと同じ）。無いときは、クラスの欄を出さない */ classes?: ClassSettings; /** 階級分け（区分→階級）をする大会の設定。無いときは、区分・階級の欄を出さない */ weights?: WeightSettings; /** 申込ページと当日の画面に、ロゴを出す（シートの「設定」タブの「ロゴ」が「あり」） */ logo?: boolean };
export const DEFAULT_ENTRY_CONFIG: EntryFormConfig = { music: false, grade: 'optional', age: 'optional', comment: 'optional' };

export function entryConfigFromSearch(search: string): EntryFormConfig {
  const params = new URLSearchParams(search);
  const mode = (key: string, fallback: EntryFieldMode): EntryFieldMode => {
    const value = params.get(key);
    return value === 'off' || value === 'optional' || value === 'required' ? value : fallback;
  };
  const config: EntryFormConfig = { music: params.get('music') === 'on', grade: mode('grade', 'optional'), age: mode('age', 'optional'), comment: mode('comment', 'optional') };
  const classes = classesFromParam(params.get('cs'));
  if (classes) config.classes = classes;
  const weights = weightsFromParam(params.get('ws'));
  if (weights) config.weights = weights;
  if (params.get('logo') === 'on') config.logo = true;
  return config;
}

/** 「cs=」の文字（クラス設定をJSONにしたもの）から、正しい設定だけを取り出す。読めなければ undefined */
export function classesFromParam(value: string | null | undefined): ClassSettings | undefined {
  if (!value || value.length > 1200) return undefined;
  try { return parseClassSettings(JSON.parse(value)); } catch { return undefined; }
}

export function entryConfigSearch(config: EntryFormConfig): string {
  const params = new URLSearchParams({ music: config.music ? 'on' : 'off', grade: config.grade, age: config.age, comment: config.comment });
  if (config.classes) params.set('cs', JSON.stringify(config.classes));
  if (config.weights) params.set('ws', weightSettingsToParam(config.weights));
  if (config.logo) params.set('logo', 'on');
  return params.toString();
}

/**
 * 見えない文字（コピーや貼り付けで入ってくる）。文字の向きの印（U+202A〜202E、2066〜2069）、幅ゼロの空白（U+200B〜200F、2060〜2064）、
 * 柔らかいハイフン（U+00AD）、BOM（U+FEFF）など。電話・メール・数字・リンクの検査の前に、かならず取り除く（Googleの受付の text_／clean_／phoneOk_ と同じ決まり）。
 */
export const INVISIBLE_CHARS = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
export const stripInvisible = (value: string): string => String(value ?? '').replace(INVISIBLE_CHARS, '');
/** 見えない文字を取り、前後の空白を取る。これが空なら「入っていない」。 */
export const visibleTrim = (value: string): string => stripInvisible(value).trim();

/** 入場曲のリンクの形（Apple Music か YouTube）。HTTPS:// のように大文字が混ざっても同じリンクとして読む */
export const MUSIC_URL_FORM = /^https:\/\/(?:music\.apple\.com|(?:[\w-]+\.)?youtube\.com|youtu\.be)\//i;
/** リンクの「https://」と「ホスト名」だけを小文字にする（スマホの自動大文字で Https:// になっても同じ）。パス（/jp/…）は、そのまま */
export const lowerLinkHost = (value: string): string => value.replace(/^(https?:\/\/[^/?#]*)/i, (head) => head.toLowerCase());

/**
 * メールアドレスの形。< > ( ) " ' 空白 , ; は使えない。@ は1つ。ドメインは「.」で区切った2つ以上の部分で、
 * 空の部分・「-」で始まる／終わる部分はだめ。いちばん後ろは英字2文字以上。
 * 「..」や「.」で終わる前半は、携帯会社のアドレスにあるので、止めない。
 */
export function emailFormOk(value: string): boolean {
  if (/[<>()"'\s,;\u3000]/.test(value)) return false;
  const at = value.split('@');
  if (at.length !== 2 || !at[0]) return false;
  const labels = at[1].split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => !/^[a-z0-9-]+$/i.test(label) || label.startsWith('-') || label.endsWith('-'))) return false;
  return /^(?:[a-z]{2,}|xn--[a-z0-9-]*[a-z0-9])$/i.test(labels[labels.length - 1]);
}

/** 日本の電話番号の形（数字だけにしたあと）。携帯（050・070・080・090）は11けた、ほかは0から始まる10けた。「00」で始まる番号は無い。 */
export function phoneFormOk(digits: string): boolean {
  return /^(?:0[5789]0\d{8}|0[1-9]\d{8})$/.test(digits);
}

export const ENTRY_HEADERS = [
  '管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重',
  '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）',
] as const;

/** クラスを使う大会のときは、いちばん右に「クラス」の列を足す（古い形のファイルは今までどおり10列） */
export const ENTRY_HEADERS_WITH_CLASS = [...ENTRY_HEADERS, 'クラス'] as const;
/** 階級分けをする大会のときは、「クラス」のあとに「区分」「階級」の列を足す（クラスを使わない大会でも、「クラス」の列は空で付ける。列の順番を、Googleのシートと同じにするため） */
export const ENTRY_HEADERS_WITH_WEIGHT = [...ENTRY_HEADERS_WITH_CLASS, '区分', '階級'] as const;

function safeCell(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string): string {
  return `"${safeCell(value).replaceAll('"', '""')}"`;
}

export function entryCsv(fighters: EntryFighter[], withClass = false, withWeight = false): string {
  const rows = fighters.map((fighter) => [
    fighter.id, fighter.gym, fighter.name, fighter.grade, fighter.age,
    fighter.height, fighter.weight, fighter.record, fighter.comment, fighter.musicUrl,
    ...(withClass || withWeight ? [fighter.fighterClass ?? ''] : []),
    ...(withWeight ? [fighter.division ?? '', fighter.weightClass ?? ''] : []),
  ]);
  return '\uFEFF' + [withWeight ? ENTRY_HEADERS_WITH_WEIGHT : withClass ? ENTRY_HEADERS_WITH_CLASS : ENTRY_HEADERS, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(',')).join('\r\n') + '\r\n';
}

/** 「１７０」「65kg」「170 cm」を数にする。数字の形でなければ NaN（0x10・1e5 は数にしない）。全角の数字も読む */
function readEntryNumber(text: string, unit: RegExp): number {
  const body = text.normalize('NFKC').replace(/\s+/g, '').replace(unit, '');
  return /^\d+(?:\.\d+)?$/.test(body) ? Number(body) : Number.NaN;
}

export function entryErrors(fighter: EntryFighter, hasPhoto: boolean, config: EntryFormConfig = DEFAULT_ENTRY_CONFIG): string[] {
  const errors: string[] = [];
  // 見えない文字だけの欄は、空と同じ
  const v = {
    gym: visibleTrim(fighter.gym), name: visibleTrim(fighter.name), height: visibleTrim(fighter.height), weight: visibleTrim(fighter.weight), age: visibleTrim(fighter.age),
    record: visibleTrim(fighter.record), grade: visibleTrim(fighter.grade), comment: visibleTrim(fighter.comment), musicUrl: visibleTrim(fighter.musicUrl),
  };
  if (!v.gym) errors.push('ジム名を入力してください。');
  if (!v.name) errors.push('選手名を入力してください。');
  const height = readEntryNumber(v.height, /(?:cm|センチ(?:メートル)?)$/i);
  if (!Number.isFinite(height) || height < 50 || height > 250) errors.push('身長を50〜250cmで入力してください。');
  const weight = readEntryNumber(v.weight, /(?:kg|キロ(?:グラム)?)$/i);
  if (!Number.isFinite(weight) || weight < 10 || weight > 250) errors.push('体重を10〜250kgで入力してください。');
  if (!v.record) errors.push('戦績・競技歴を入力してください。初試合なら「初試合」と入力してください。');
  if (config.grade === 'required' && !v.grade) errors.push('学年を入力してください。');
  if (config.age === 'required' && !v.age) errors.push('年齢を入力してください。');
  const ageText = v.age.normalize('NFKC').replace(/\s+/g, '');
  if (config.age !== 'off' && v.age && (!/^\d{1,3}$/.test(ageText) || Number(ageText)<1 || Number(ageText)>120)) errors.push('年齢を1〜120歳で入力してください。');
  if (config.comment === 'required' && !v.comment) errors.push('試合への意気込みを入力してください。');
  if (config.music && !v.musicUrl) errors.push('入場曲のURLを入力してください。');
  if (config.music && v.musicUrl && !MUSIC_URL_FORM.test(v.musicUrl)) errors.push('入場曲はApple MusicかYouTubeのURLを入力してください。');
  for (const [key,max] of [['gym',120],['name',80],['record',300],['comment',500]] as const) if (v[key].length>max) errors.push('入力内容が長すぎます。短くしてください。');
  if (!hasPhoto) errors.push('選手の写真を選んでください。');
  return errors;
}

/** 他のジム用の入力画面で、クラスを選ばせるときの検査。クラスを使わない大会は、何も言わない */
export function entryClassError(fighter: EntryFighter, config: EntryFormConfig): string {
  if (!config.classes) return '';
  const names = config.classes.upper.name + 'か' + config.classes.lower.name;
  if (!(fighter.fighterClass ?? '').trim()) return 'クラスを選んでください（' + names + '）。';
  if (!normalizeClass(fighter.fighterClass ?? '', config.classes)) return 'クラスは' + names + 'から選んでください。';
  return '';
}

/**
 * 他のジム用の入力画面で、出場区分と階級を選ばせるときの検査。階級分けをしない大会は、何も言わない。
 * 申し込みページ（/apply/）と同じ文の元（weightChoiceError の既定＝DIVISION_LABEL「出場区分」）を使う。
 * 1つの画面に「出場区分」の見出しと「区分」のエラーが混ざらないよう、言い方を渡さない（保存される値・列見出しは「区分」のまま）。
 */
export function entryWeightError(fighter: EntryFighter, config: EntryFormConfig): string {
  if (!config.weights) return '';
  return weightChoiceError(fighter.division ?? '', fighter.weightClass ?? '', config.weights);
}
