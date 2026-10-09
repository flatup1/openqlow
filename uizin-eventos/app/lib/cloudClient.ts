import { getOperatorKey } from './config.ts';
import { isLocalTournament, type LocalTournament } from '../../core/privateTournament.ts';
import { PrivateSaveConflict } from './privateStore.ts';
import type { TimerAction } from '../../core/privateTimer.ts';
let serverOffset=0;
export const cloudServerTime=()=>Date.now()+serverOffset;

export async function cloudRequest(eventId: string, value?: LocalTournament): Promise<LocalTournament | null> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const sentAt=Date.now();
    const response=await fetch('/api/private-event?event='+encodeURIComponent(eventId),{
      method:value?'PUT':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
      headers:{'content-type':'application/json','x-operator-key':getOperatorKey()},body:value?JSON.stringify(value):undefined,
    });
    const body=await response.json() as {ok?:boolean;event?:unknown;reason?:string;serverNow?:number};
    if(typeof body.serverNow==='number')serverOffset=body.serverNow-(sentAt+Date.now())/2;
    if(response.status===409)throw new PrivateSaveConflict();
    if(!response.ok||!body.ok)throw new Error(body.reason||'クラウドへ接続できません。入力は残しています。');
    if(body.event===null)return null;
    if(!isLocalTournament(body.event)||body.event.eventId!==eventId)throw new Error('クラウドの保存結果を確認できません。');
    return body.event;
  } finally {clearTimeout(timer);}
}
export async function cloudTimerCommand(data:LocalTournament,action:TimerAction):Promise<LocalTournament> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000),sentAt=Date.now();
  try {
    const response=await fetch('/api/private-timer?event='+encodeURIComponent(data.eventId),{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json','x-operator-key':getOperatorKey()},body:JSON.stringify({action,updatedAt:data.updatedAt})});
    const body=await response.json() as {ok?:boolean;event?:unknown;reason?:string;serverNow?:number};
    if(response.status===409)throw new PrivateSaveConflict();
    if(!response.ok||!body.ok||!isLocalTournament(body.event)||body.event.eventId!==data.eventId)throw new Error(body.reason||'時計の保存結果を確認できません。画面を読み直してください。');
    if(typeof body.serverNow==='number')serverOffset=body.serverNow-(sentAt+Date.now())/2;
    return body.event;
  }finally{clearTimeout(timer);}
}
