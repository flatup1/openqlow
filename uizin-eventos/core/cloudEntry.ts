import { DEFAULT_ENTRY_CONFIG, entryErrors } from './entryPackage.ts';
import { dateDigits, isCompleteDate } from './dateInput.ts';
import { isLocalTournament, type LocalFighter, type LocalTournament } from './privateTournament.ts';
export type Recruitment = { open:boolean; deadline:string; description:string };
export function validRecruitment(value:unknown):value is Recruitment {
  if(!value||typeof value!=='object')return false;
  const c=value as Recruitment;
  return Object.keys(c).every(k=>['open','deadline','description'].includes(k))&&typeof c.open==='boolean'&&typeof c.deadline==='string'&&(!c.deadline||isCompleteDate(c.deadline))&&typeof c.description==='string'&&c.description.length<=5000;
}
export function acceptingEntries(data:LocalTournament,now=Date.now()) {
  const c=data.recruitment;
  if(!c?.open)return false;
  if(!c.deadline)return true;
  const digits=dateDigits(c.deadline);
  // Stored deadline is normalized Japanese date. End of day in Japan.
  const end=Date.UTC(Number(digits.slice(0,4)),Number(digits.slice(4,6))-1,Number(digits.slice(6,8))+1)-9*3600000;
  return now<end;
}
export function publicRecruitment(data:LocalTournament,now=Date.now()) {
  return {title:data.title,venue:data.venue,date:data.date,description:data.recruitment?.description||'',deadline:data.recruitment?.deadline||'',accepting:acceptingEntries(data,now),config:data.entryConfig||DEFAULT_ENTRY_CONFIG};
}
export function entrySubmission(value:unknown,data:LocalTournament):{requestId:string;fighter:LocalFighter} {
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['requestId','fighter'].includes(k)))throw new Error('申込内容を確認してください。');
  const v=value as {requestId:string;fighter:LocalFighter};
  if(typeof v.requestId!=='string'||! /^[a-f0-9-]{36}$/.test(v.requestId)||!v.fighter||Object.keys(v.fighter).some(k=>!['id','gym','name','grade','age','height','weight','record','comment','musicUrl','photoDataUrl'].includes(k)))throw new Error('連絡先などの項目は送信できません。');
  const fighter={...v.fighter,id:'entry-'+v.requestId};
  if(!isLocalTournament({...data,fighters:[fighter],bouts:[],currentBout:0,timer:undefined}))throw new Error('選手の内容か写真を確認してください。');
  const errors=entryErrors(fighter,Boolean(fighter.photoDataUrl),data.entryConfig||DEFAULT_ENTRY_CONFIG);
  if(errors.length)throw new Error(errors[0]);
  return {requestId:v.requestId,fighter};
}
/** Public code is an address of explicitly opened recruitment, not a login credential. */
export async function recruitmentCode(identity:string,eventId:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('recruitment|'+identity+'|'+eventId));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
