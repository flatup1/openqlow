import type { LocalTournament } from './privateTournament.ts';
export type PrivateTimer = { boutId: string; phase: 'round'|'break'|'complete'; round: number; status: 'paused'|'running'; remainingMs: number; startedAt: number };
export type TimerAction = 'start'|'pause'|'reset';
export function timerRule(data: LocalTournament) { return data.schedule?.find(rule=>rule.no===data.currentBout+1); }
export function validTimer(value: unknown): value is PrivateTimer {
  if(!value||typeof value!=='object')return false;
  const t=value as PrivateTimer;
  return Object.keys(t).every(k=>['boutId','phase','round','status','remainingMs','startedAt'].includes(k))&&typeof t.boutId==='string'&&t.boutId.length>0&&t.boutId.length<=5000&&['round','break','complete'].includes(t.phase)&&['running','paused'].includes(t.status)&&Number.isInteger(t.round)&&t.round>=1&&t.round<=20&&Number.isSafeInteger(t.remainingMs)&&t.remainingMs>=0&&t.remainingMs<=3600000&&Number.isSafeInteger(t.startedAt)&&t.startedAt>=0;
}
/** Absolute server timestamp avoids drift and survives a closed browser. */
export function timerAt(data: LocalTournament, now: number): PrivateTimer|null {
  const rule=timerRule(data),bout=data.bouts[data.currentBout];
  if(!rule||!bout)return null;
  let t:PrivateTimer=data.timer?.boutId===bout.id ? {...data.timer} : {boutId:bout.id,phase:'round',round:1,status:'paused',remainingMs:rule.roundSeconds*1000,startedAt:now};
  if(t.status!=='running')return t;
  let elapsed=Math.max(0,now-t.startedAt);
  for(let i=0;i<40;i++) {
    if(elapsed<t.remainingMs)return {...t,remainingMs:t.remainingMs-elapsed,startedAt:now};
    elapsed-=t.remainingMs;
    if(t.phase==='round'&&t.round>=rule.rounds)return {...t,phase:'complete',status:'paused',remainingMs:0,startedAt:now};
    if(t.phase==='break')return {...t,phase:'round',round:t.round+1,status:'paused',remainingMs:rule.roundSeconds*1000,startedAt:now};
    t={...t,phase:'break',remainingMs:rule.breakSeconds*1000};
  }
  throw new Error('試合の時間設定を確認してください。');
}
export function timerCommand(data:LocalTournament,action:TimerAction,now:number):LocalTournament {
  const current=timerAt(data,now),rule=timerRule(data);
  if(!current||!rule)throw new Error('先にこの試合の時間設定を保存してください。');
  if(!['start','pause','reset'].includes(action))throw new Error('時計の操作を確認してください。');
  const timer=action==='reset'?{...current,phase:'round' as const,round:1,status:'paused' as const,remainingMs:rule.roundSeconds*1000,startedAt:now}:action==='pause'?{...current,status:'paused' as const}:current.phase==='complete'?current:{...current,status:'running' as const,startedAt:now};
  return {...data,timer};
}
