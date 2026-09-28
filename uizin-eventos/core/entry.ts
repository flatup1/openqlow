export type EntrySiteConfig = {
  title: string;
  organizer: string;
  description: string;
  date: string;
  venue: string;
  weighInAt: string;
  startAt: string;
  fee: string;
  deadline: string;
  contact: string;
  usesWalkoutMusic: boolean;
  /** 顔写真を集めるか。OFFなら募集ページに写真欄を出さず、写真なしで申し込める */
  usesPhoto: boolean;
  /** 大会画面での体重の出し方 */
  weightDisplay: 'contract' | 'both' | 'none';
  published: boolean;
};

export type EntryInput = {
  fighterName: string;
  fighterKana: string;
  gym: string;
  gender: string;
  grade: string;
  age: string;
  category: string;
  height: string;
  weight: string;
  experience: string;
  record: string;
  canFightTwice: string;
  comment: string;
  musicChoice: string;
  musicUrl: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  consentPublicity: boolean;
  consentRules: boolean;
  website: string;
};

export type EntryRecord = EntryInput & {
  receiptNo: string;
  submittedAt: number;
  photoStatus: 'none' | 'uploaded';
  sheetSync: 'synced' | 'pending';
};

export const EMPTY_ENTRY_CONFIG: EntrySiteConfig = {
  title: '', organizer: '', description: '', date: '', venue: '', weighInAt: '', startAt: '',
  fee: '', deadline: '', contact: '', usesWalkoutMusic: true, usesPhoto: true, weightDisplay: 'contract', published: false,
};

const WEB_URL = /^https:\/\/(?:music\.apple\.com|(?:www\.|m\.)?(?:youtube\.com|youtu\.be))\//i;

export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeEntryInput(value: unknown): EntryInput {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    fighterName: cleanText(raw.fighterName, 80), fighterKana: cleanText(raw.fighterKana, 100),
    gym: cleanText(raw.gym, 120), gender: cleanText(raw.gender, 30), grade: cleanText(raw.grade, 30), age: cleanText(raw.age, 3),
    category: cleanText(raw.category, 80), height: cleanText(raw.height, 10), weight: cleanText(raw.weight, 10),
    experience: cleanText(raw.experience, 100), record: cleanText(raw.record, 300),
    canFightTwice: cleanText(raw.canFightTwice, 30), comment: cleanText(raw.comment, 500), musicChoice: cleanText(raw.musicChoice, 20),
    musicUrl: cleanText(raw.musicUrl, 500), contactName: cleanText(raw.contactName, 100),
    contactPhone: cleanText(raw.contactPhone, 30), contactEmail: cleanText(raw.contactEmail, 200).toLowerCase(),
    consentPublicity: raw.consentPublicity === true, consentRules: raw.consentRules === true,
    website: cleanText(raw.website, 200),
  };
}

export function validateEntry(input: EntryInput): string[] {
  const errors: string[] = [];
  if (!input.fighterName) errors.push('選手名を入力してください。');
  if (!input.gym) errors.push('所属ジムを入力してください。');
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 4 || age > 100) errors.push('年齢を確認してください。');
  const weight = Number(input.weight);
  if (!Number.isFinite(weight) || weight < 10 || weight > 200) errors.push('希望体重を確認してください。');
  if (input.height) {
    const height = Number(input.height);
    if (!Number.isFinite(height) || height < 70 || height > 230) errors.push('身長を確認してください。');
  }
  if (!input.comment) errors.push('試合への意気込みを入力してください。');
  if (input.musicUrl && !WEB_URL.test(input.musicUrl)) errors.push('入場曲はApple MusicまたはYouTubeのURLを入力してください。');
  if (input.musicChoice === 'あり' && !input.musicUrl) errors.push('「入場曲あり」を選んだ場合は曲のURLを入力してください。');
  if (!input.contactName) errors.push('連絡先氏名を入力してください。');
  if (!/^0?[0-9][0-9 -]{8,14}$/.test(input.contactPhone)) errors.push('電話番号を確認してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) errors.push('メールアドレスを確認してください。');
  if (!input.consentRules) errors.push('大会規約と個人情報の取扱いへの同意が必要です。');
  return errors;
}

export function normalizeEntryConfig(value: unknown): EntrySiteConfig {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    title: cleanText(raw.title, 120), organizer: cleanText(raw.organizer, 120),
    description: cleanText(raw.description, 1200), date: cleanText(raw.date, 40),
    venue: cleanText(raw.venue, 200), weighInAt: cleanText(raw.weighInAt, 20),
    startAt: cleanText(raw.startAt, 20), fee: cleanText(raw.fee, 40), deadline: cleanText(raw.deadline, 40),
    contact: cleanText(raw.contact, 300), usesWalkoutMusic: raw.usesWalkoutMusic !== false, usesPhoto: raw.usesPhoto !== false,
    weightDisplay: raw.weightDisplay === 'both' || raw.weightDisplay === 'none' ? raw.weightDisplay : 'contract', published: raw.published === true,
  };
}

export function validateEntryConfig(config: EntrySiteConfig): string[] {
  const errors: string[] = [];
  if (!config.title) errors.push('大会名を入力してください。');
  if (!config.organizer) errors.push('主催者名を入力してください。');
  if (!config.date) errors.push('開催日を入力してください。');
  if (!config.venue) errors.push('会場を入力してください。');
  if (!config.deadline) errors.push('締切を入力してください。');
  return errors;
}
