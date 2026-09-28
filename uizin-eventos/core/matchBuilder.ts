export type MatchBuilderFighter = {
  receiptNo: string; fighterName: string; fighterKana?: string; gym: string; age?: string; grade?: string;
  height?: string; weight?: string; category?: string; record?: string; comment?: string;
  musicChoice?: string; musicUrl?: string; photoUrl?: string; canFightTwice?: string; experience?: string;
};

export type DraftMatch = { id: string; redReceipt: string; blueReceipt: string; className: string; rule: string };

function cell(value: unknown): string { return '"' + String(value ?? '').replaceAll('"', '""') + '"'; }

export function moveDraftMatch(matches: DraftMatch[], index: number, direction: -1 | 1): DraftMatch[] {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= matches.length || target >= matches.length) return matches;
  const next = [...matches]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

export function swapDraftCorners(match: DraftMatch): DraftMatch {
  return { ...match, redReceipt: match.blueReceipt, blueReceipt: match.redReceipt };
}

export function validateDraftMatches(matches: DraftMatch[]): string[] {
  const errors: string[] = [];
  matches.forEach((match, index) => {
    if (!match.redReceipt || !match.blueReceipt) errors.push('第' + (index + 1) + '試合の赤・青を選んでください。');
    if (match.redReceipt && match.redReceipt === match.blueReceipt) errors.push('第' + (index + 1) + '試合で同じ選手が赤と青に入っています。');
  });
  return errors;
}

export function draftMatchesCsv(matches: DraftMatch[], fighters: MatchBuilderFighter[]): string {
  const byId = new Map(fighters.map((fighter) => [fighter.receiptNo, fighter]));
  const header = ['no','class','rule','rounds','round_seconds','break_seconds','red_name','red_team','red_kana','red_age','red_height','red_weight','red_category','red_record','red_comment','red_photo','red_music_url','blue_name','blue_team','blue_kana','blue_age','blue_height','blue_weight','blue_category','blue_record','blue_comment','blue_photo','blue_music_url','note'];
  const rows = matches.map((match, index) => {
    const red = byId.get(match.redReceipt); const blue = byId.get(match.blueReceipt);
    return [index + 1, match.className, match.rule, 2, 120, 60,
      red?.fighterName, red?.gym, red?.fighterKana, red?.age, red?.height, red?.weight, red?.category, red?.record, red?.comment, red?.photoUrl, red?.musicUrl,
      blue?.fighterName, blue?.gym, blue?.fighterKana, blue?.age, blue?.height, blue?.weight, blue?.category, blue?.record, blue?.comment, blue?.photoUrl, blue?.musicUrl, ''];
  });
  return [header.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n');
}

export function draftMusicCsv(matches: DraftMatch[], fighters: MatchBuilderFighter[], enabled: boolean): string {
  const header = ['no','match_no','kind','title','artist','music_url','seconds','note','receipt_no','fighter_name','photo_url'];
  if (!enabled) return header.map(cell).join(',');
  const byId = new Map(fighters.map((fighter) => [fighter.receiptNo, fighter]));
  const rows: unknown[][] = [];
  matches.forEach((match, index) => {
    ([['walkout_red', match.redReceipt], ['walkout_blue', match.blueReceipt]] as const).forEach(([kind, id]) => {
      const fighter = byId.get(id); if (!fighter || fighter.musicChoice === 'なし' || !fighter.musicUrl) return;
      rows.push([rows.length + 1, index + 1, kind, fighter.fighterName + ' 入場曲', '', fighter.musicUrl, 0, '', fighter.receiptNo, fighter.fighterName, fighter.photoUrl]);
    });
  });
  return [header.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n');
}

export function draftEventCsv(input: { title: string; venue: string; date: string; startAt: string; weightDisplay?: string }): string {
  return [['key','value'], ['title', input.title], ['venue', input.venue], ['date', input.date], ['start_at', input.startAt], ['hold_message','しばらくお待ちください'], ['weight_display', input.weightDisplay || 'contract']]
    .map((row) => row.map(cell).join(',')).join('\r\n');
}

export type MatchNote = { level: 'warn' | 'info'; text: string };

/** 体重差の注意の目安。これ以上なら「確認してください」を出す（決めるのは人） */
export const WEIGHT_GAP_WARN_KG = 3;
export const WEIGHT_GAP_WARN_RATIO = 0.1;

function kg(value: string | undefined): number | null {
  const m = String(value ?? '').normalize('NFKC').match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n >= 10 && n <= 200 ? n : null;
}

/** 選手がそれぞれ何試合に入っているか */
export function boutCounts(matches: DraftMatch[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matches) for (const id of [m.redReceipt, m.blueReceipt]) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * 1試合ごとの注意を出す。どれも「止める」のではなく「人が確認する」ための表示。
 * 勝手に組み替えたり決めたりはしない。
 */
export function reviewDraftMatches(matches: DraftMatch[], fighters: MatchBuilderFighter[]): MatchNote[][] {
  const byId = new Map(fighters.map((f) => [f.receiptNo, f]));
  const counts = boutCounts(matches);
  return matches.map((match) => {
    const notes: MatchNote[] = [];
    const red = byId.get(match.redReceipt); const blue = byId.get(match.blueReceipt);
    if (red && blue) {
      const r = kg(red.weight), b = kg(blue.weight);
      if (r === null || b === null) notes.push({ level: 'warn', text: '体重が未登録の選手がいます。計量で確認してください。' });
      else {
        const gap = Math.abs(r - b);
        if (gap >= WEIGHT_GAP_WARN_KG || gap / Math.min(r, b) >= WEIGHT_GAP_WARN_RATIO) {
          notes.push({ level: 'warn', text: '体重差が ' + gap.toFixed(1) + 'kg あります。この組み合わせでよいか確認してください。' });
        }
      }
    }
    for (const [side, f] of [['赤', red], ['青', blue]] as const) {
      if (!f) continue;
      const n = counts.get(f.receiptNo) ?? 0;
      if (n >= 2) {
        const no = /不可|いいえ|できない|×/.test(f.canFightTwice ?? '');
        notes.push({ level: no ? 'warn' : 'info', text: side + 'の' + f.fighterName + 'さんは ' + n + '試合目があります' + (no ? '。申込では「2試合できない」になっています。' : '。') });
      }
      const missing = [!f.photoUrl ? '写真' : '', !f.comment ? '意気込み' : ''].filter(Boolean);
      if (missing.length) notes.push({ level: 'info', text: side + 'の' + f.fighterName + 'さん: ' + missing.join('・') + 'が未登録' });
    }
    return notes;
  });
}

/** 選手の絞り込み。名前・ふりがな・所属のどれかに含まれれば残す */
export function filterFighters(fighters: MatchBuilderFighter[], query: string): MatchBuilderFighter[] {
  const q = query.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  if (!q) return fighters;
  return fighters.filter((f) => [f.fighterName, f.fighterKana ?? '', f.gym].some((v) => v.normalize('NFKC').replace(/\s+/g, '').toLowerCase().includes(q)));
}
