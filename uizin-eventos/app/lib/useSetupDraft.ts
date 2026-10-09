import { useEffect, useRef, useState } from 'react';
import { draftRequest } from './setupDraftClient.ts';
import type { SetupDraft } from '../../core/setupDraft.ts';
import type { LocalTournament } from '../../core/privateTournament.ts';
export function useSetupDraft(document:LocalTournament|null,controls:SetupDraft['controls']) {
 const [candidate,setCandidate]=useState<SetupDraft|null>(null),[ready,setReady]=useState(''),[status,setStatus]=useState('途中保存を確認しています。');
 const revisions=useRef(new Map<string,number>()),pending=useRef<SetupDraft|null>(null),running=useRef(false),blocked=useRef(new Set<string>());
 const signatures=useRef(new Map<string,string>());
 const signature=document?JSON.stringify({document,controls}):'';
 const unsafe=useRef(false);unsafe.current=Boolean(document&&signatures.current.get(document.eventId)!==signature);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(unsafe.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const latest=useRef(document?.eventId);latest.current=document?.eventId;
 const flush=async()=>{
  if(running.current)return;running.current=true;
  try{while(pending.current){const next=pending.current;pending.current=null;if(blocked.current.has(next.document.eventId))continue;
   try{if(latest.current===next.document.eventId)setStatus('途中保存しています…');const result=await draftRequest(next.document.eventId,{...next,revision:revisions.current.get(next.document.eventId)||0});if(result){revisions.current.set(next.document.eventId,result.revision);signatures.current.set(next.document.eventId,JSON.stringify({document:next.document,controls:next.controls}));if(latest.current===next.document.eventId){{unsafe.current=pending.current!==null;setStatus(pending.current?'変更した入力を途中保存しています…':'途中までクラウドに保存しました。');}const url=new URL(location.href);url.searchParams.set('event',next.document.eventId);history.replaceState(null,'',url);}}}
   catch(error){blocked.current.add(next.document.eventId);if(latest.current===next.document.eventId)setStatus(error instanceof Error?error.message:'途中保存できません。');}
  }}finally{running.current=false;}
 };
 useEffect(()=>{
  if(!document)return;const id=document.eventId;let active=true;setReady('');setCandidate(null);setStatus('途中保存を確認しています。');
  draftRequest(id).then(value=>{if(!active)return;revisions.current.set(id,value?.revision||0);if(value){const rule=document.schedule?.[0];const baselineControls=rule?{rounds:rule.rounds,roundSeconds:rule.roundSeconds,breakSeconds:rule.breakSeconds}:controls;signatures.current.set(id,JSON.stringify({document,controls:baselineControls}));setCandidate(value);setStatus('途中保存があります。「続きから開く」で再開できます。');}else setStatus('入力すると自動で途中保存します。');setReady(id);}).catch(()=>{if(active){blocked.current.add(id);setStatus('途中保存に接続できません。引継ぎファイルは作れます。');}});
  return()=>{active=false;};
 },[document?.eventId]);
 useEffect(()=>{
  if(!document||ready!==document.eventId||candidate||blocked.current.has(document.eventId))return;
  setStatus('入力を途中保存します…');pending.current={format:'tournament-os-draft-1',revision:0,document,controls};
  const timer=setTimeout(()=>void flush(),600);return()=>clearTimeout(timer);
 },[document,controls.rounds,controls.roundSeconds,controls.breakSeconds,ready,candidate]);
 return {candidate,status,resume:()=>{setCandidate(null);},retry:async()=>{if(document){try{const value=await draftRequest(document.eventId);revisions.current.set(document.eventId,value?.revision||0);blocked.current.delete(document.eventId);setCandidate(value);setReady(document.eventId);setStatus(value?'途中保存を確認しました。続きから開くか、今の入力を保存してください。':'入力すると自動で途中保存します。');}catch{setStatus('接続できません。引継ぎファイルを作ってください。');}}}};
}
