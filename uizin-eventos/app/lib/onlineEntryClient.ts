import type { EntryFormConfig } from '../../core/entryPackage.ts';
import type { LocalFighter } from '../../core/privateTournament.ts';
export type OnlineRecruitment={title:string;venue:string;date:string;description:string;deadline:string;accepting:boolean;config:EntryFormConfig};
export async function onlineEntryRequest(code:string,fighter?:LocalFighter):Promise<{recruitment?:OnlineRecruitment;receipt?:string}> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch('/api/cloud-entry?code='+encodeURIComponent(code),{method:fighter?'POST':'GET',headers:{'content-type':'application/json'},body:fighter?JSON.stringify({requestId:fighter.id,fighter}):undefined,cache:'no-store',credentials:'omit',signal:controller.signal});
    const body=await response.json() as {ok:boolean;reason?:string;recruitment?:OnlineRecruitment;receipt?:string};
    if(!response.ok||!body.ok)throw new Error(body.reason||'受付結果を確認できません。入力を残し、同じ内容で再確認してください。');
    return body;
  }finally{clearTimeout(timer);}
}
