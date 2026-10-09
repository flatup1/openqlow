export const RULE_HEADERS=['試合番号','ラウンド数','ラウンド秒','休憩秒'];
export type SafeRule={no:number;rounds:number;roundSeconds:number;breakSeconds:number};
export function safeGoogleRules(value: unknown): SafeRule[] {
  if (!Array.isArray(value) || value.length > 3001 || JSON.stringify(value[0])!==JSON.stringify(RULE_HEADERS)) throw new Error('Googleの専用表は指定した4列だけにしてください。氏名・写真・連絡先の表は読み込みません。');
  const seen=new Set<number>();
  return value.slice(1).map(row=>{
    if(!Array.isArray(row)||row.length!==4||row.some(v=>typeof v!=='number'&&!(typeof v==='string'&&/^\d+$/.test(v))))throw new Error('大会設定には半角数字だけを入れてください。');
    const [no,rounds,roundSeconds,breakSeconds]=row.map(Number);
    if(![no,rounds,roundSeconds,breakSeconds].every(Number.isInteger)||no<1||no>3000||rounds<1||rounds>20||roundSeconds<10||roundSeconds>3600||breakSeconds<0||breakSeconds>3600||seen.has(no))throw new Error('試合番号・ラウンド数・時間を確認してください。');
    seen.add(no);return {no,rounds,roundSeconds,breakSeconds};
  });
}
