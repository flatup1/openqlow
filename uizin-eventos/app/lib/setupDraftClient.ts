import { getOperatorKey } from './config.ts';
import { validDraft, type SetupDraft } from '../../core/setupDraft.ts';
export async function draftRequest(eventId:string,value?:SetupDraft):Promise<SetupDraft|null> {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/private-draft?event='+encodeURIComponent(eventId),{method:value?'PUT':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json','x-operator-key':getOperatorKey()},body:value?JSON.stringify(value):undefined});
  const body=await response.json() as {ok?:boolean;draft?:unknown;reason?:string};
  if(!response.ok||!body.ok)throw new Error(body.reason||'途中保存できません。画面を閉じずに引継ぎファイルを作ってください。');
  if(body.draft===null)return null;
  if(!validDraft(body.draft,eventId))throw new Error('途中保存を読めません。');return body.draft;
 }finally{clearTimeout(timer);}
}
