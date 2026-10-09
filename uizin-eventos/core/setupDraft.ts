import { validCloudDocument, CloudConflict, CLOUD_MAX_BYTES, type AtomicStore } from './cloudTournament.ts';
import type { LocalTournament } from './privateTournament.ts';
export type SetupDraft = { format: 'tournament-os-draft-1'; revision: number; document: LocalTournament; controls: { rounds: number; roundSeconds: number; breakSeconds: number } };
export function validDraft(value: unknown, eventId: string): value is SetupDraft {
  if (!value || typeof value !== 'object') return false;
  const d=value as SetupDraft;
  if(Object.keys(d).some(k=>!['format','revision','document','controls'].includes(k)) || d.format!=='tournament-os-draft-1' || !Number.isSafeInteger(d.revision) || d.revision<0 || !d.document || !d.controls) return false;
  const r=d.document.recruitment;
  if(r && (typeof r.deadline!=='string' || r.deadline.length>100)) return false;
  if(!validCloudDocument({...d.document,...(r?{recruitment:{...r,deadline:''}}:{})},eventId)) return false;
  return Object.keys(d.controls).sort().join(',')==='breakSeconds,roundSeconds,rounds' && Object.values(d.controls).every(n=>typeof n==='number' && Number.isFinite(n) && n>=0 && n<=3600);
}
const CHUNK=48*1024;
type Manifest={revision:number;chunks:number;slot:0|1};
export async function readDraft(store:AtomicStore,eventId:string):Promise<SetupDraft|null> {
 return store.transaction(tx=>readDraftSnapshot(tx,eventId));
}
async function readDraftSnapshot(store:AtomicStore,eventId:string):Promise<SetupDraft|null> {
 const m=await store.get<Manifest>('draft:current');if(!m)return null;
 if(![0,1].includes(m.slot)||!Number.isSafeInteger(m.revision)||!Number.isInteger(m.chunks)||m.chunks<1||m.chunks>171)throw new Error('途中保存を読めません。');
 const parts:Uint8Array[]=[];let total=0;
 for(let i=0;i<m.chunks;i++){const part=await store.get<Uint8Array>(`draft:${m.slot}:${i}`);if(!part||part.length>CHUNK||(total+=part.length)>CLOUD_MAX_BYTES)throw new Error('途中保存が不足しています。');parts.push(part);}
 const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!validDraft(value,eventId)||value.revision!==m.revision)throw new Error('途中保存を確認してください。');return value;
}
export async function saveDraft(store:AtomicStore,eventId:string,input:unknown,now=Date.now()):Promise<SetupDraft> {
 if(!validDraft(input,eventId))throw new Error('途中保存の内容を確認してください。');
 return store.transaction(async tx=>{
  const old=await tx.get<Manifest>('draft:current');
  if((old?.revision||0)!==input.revision)throw new CloudConflict('別の画面で途中保存が更新されました。引継ぎファイルを作ってから最新状態を確認してください。');
  const value={...input,revision:Math.max(now,input.revision+1)},bytes=new TextEncoder().encode(JSON.stringify(value));
  if(bytes.length>CLOUD_MAX_BYTES)throw new Error('途中保存が8MBを超えています。');
  const chunks=Math.ceil(bytes.length/CHUNK),slot=old?.slot===0?1:0;for(let i=0;i<chunks;i++)await tx.put(`draft:${slot}:${i}`,bytes.slice(i*CHUNK,(i+1)*CHUNK));
  await tx.put('draft:current',{revision:value.revision,chunks,slot});return value;
 });
}
