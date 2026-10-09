import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudHarness } from './support/cloudHarness.ts';
import { emptyTournament, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { acceptingEntries, recruitmentCode } from '../core/cloudEntry.ts';
import { timerAt, timerCommand } from '../core/privateTimer.ts';
const photo='data:image/png;base64,aGVsbG8=';
const fighter:LocalFighter={id:'ignored',name:'架空選手',gym:'架空ジム',height:'170',weight:'60',record:'初試合',grade:'',age:'',comment:'',musicUrl:'',photoDataUrl:photo};
const auth={'x-operator-key':'test-only-operator'};
const call=(h:ReturnType<typeof cloudHarness>,path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>h.fetch(new Request('https://local'+path,{method,headers,body:body?JSON.stringify(body):undefined}));
async function save(h:ReturnType<typeof cloudHarness>,data:LocalTournament) {const response=await call(h,'/api/private-event?event='+data.eventId,'PUT',data,auth);assert.equal(response.status,200);return (await response.json() as {event:LocalTournament}).event;}
test('online recruitment only reveals published settings and stores a retry once, across restart',async()=>{
  const h=cloudHarness();let data=await save(h,{...emptyTournament('signup'),recruitment:{open:true,deadline:'2099年12月31日',description:'架空の大会'}});
  const code=await recruitmentCode('legacy-operator','signup'),path='/api/cloud-entry?code='+code;
  const publicBody=await (await call(h,path)).json();assert.ok(!JSON.stringify(publicBody).includes('fighters'));assert.ok(!JSON.stringify(publicBody).includes('updatedAt'));
  const body={requestId:'11111111-1111-4111-a111-111111111111',fighter};
  const first=await call(h,path,'POST',body);assert.equal(first.status,200);const receipt=await first.json();
  h.restart();assert.deepEqual(await (await call(h,path,'POST',body)).json(),receipt);
  const read=await call(h,'/api/private-event?event=signup','GET',undefined,auth);data=(await read.json() as {event:LocalTournament}).event;assert.equal(data.fighters.length,1);assert.equal(data.fighters[0].name,fighter.name);
  assert.equal((await call(h,path,'POST',{...body,fighter:{...fighter,name:'別の名前'}})).status,409);
  await save(h,{...data,recruitment:{...data.recruitment!,open:false}});assert.equal((await call(h,path,'POST',body)).status,404);assert.equal((await call(h,path)).status,404);
});
test('online submissions reject contacts, no photo, closed deadline, unauthorized management and oversized request',async()=>{
  const h=cloudHarness();await save(h,{...emptyTournament('guard'),recruitment:{open:true,deadline:'2099年1月1日',description:''}});
  const path='/api/cloud-entry?code='+await recruitmentCode('legacy-operator','guard');
  const body={requestId:'22222222-2222-4222-a222-222222222222',fighter};
  assert.equal((await call(h,path,'POST',{...body,fighter:{...fighter,email:'dummy@example.invalid'}})).status,400);
  assert.equal((await call(h,path,'POST',{...body,fighter:{...fighter,photoDataUrl:''}})).status,400);
  assert.equal((await call(h,'/api/private-recruitment?event=guard')).status,401);
  assert.equal((await call(h,path,'POST',{...body,fighter:{...fighter,photoDataUrl:'x'.repeat(2*1024*1024)}})).status,413);
  const value=(await (await call(h,'/api/private-event?event=guard','GET',undefined,auth)).json() as {event:LocalTournament}).event;
  await save(h,{...value,recruitment:{...value.recruitment!,deadline:'2000年1月1日'}});
  assert.equal((await call(h,path,'POST',body)).status,409);
});
test('simultaneous applicants preserve both players and prevent stale admin overwrite',async()=>{
  const h=cloudHarness();const original=await save(h,{...emptyTournament('concurrent'),recruitment:{open:true,deadline:'',description:''}});
  const path='/api/cloud-entry?code='+await recruitmentCode('legacy-operator','concurrent');
  const ids=['33333333-3333-4333-a333-333333333333','44444444-4444-4444-a444-444444444444'];
  const replies=await Promise.all(ids.map(requestId=>call(h,path,'POST',{requestId,fighter})));
  assert.deepEqual(replies.map(r=>r.status),[200,200]);
  const current=(await (await call(h,'/api/private-event?event=concurrent','GET',undefined,auth)).json() as {event:LocalTournament}).event;
  assert.equal(current.fighters.length,2);
  assert.equal((await call(h,'/api/private-event?event=concurrent','PUT',original,auth)).status,409);
});
test('deadline ends at midnight Japan time for normalized and pasted digits',()=>{
  for(const deadline of ['2027年10月3日','２０２７１００３']) {const d={...emptyTournament('deadline'),recruitment:{open:true,deadline,description:''}};assert.equal(acceptingEntries(d,Date.parse('2027-10-03T14:59:59Z')),true);assert.equal(acceptingEntries(d,Date.parse('2027-10-03T15:00:00Z')),false);}
});
test('Google integration calls only numeric rules action and those rules drive the same saved timer',async()=>{
  const h=cloudHarness();h.env.ENTRY_SHEET_WEBHOOK_URL='https://example.invalid/rules';h.env.ENTRY_SHEET_WEBHOOK_SECRET='dummy-only';
  const previous=globalThis.fetch;let requests=0;
  globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{requests++;const payload=JSON.parse(String(init?.body));assert.equal(payload.action,'rules');assert.equal(payload.eventId,'clock');return Response.json({rows:[['試合番号','ラウンド数','ラウンド秒','休憩秒'],[1,2,10,5]]});}) as typeof fetch;
  try {const response=await call(h,'/api/private-rules?event=clock','GET',undefined,auth);assert.equal(response.status,200);const {rules}=await response.json() as {rules:LocalTournament['schedule']};const saved=await save(h,{...timed(),schedule:rules});const started=await call(h,'/api/private-timer?event=clock','POST',{action:'start',updatedAt:saved.updatedAt},auth);assert.equal(started.status,200);const {event}=await started.json() as {event:LocalTournament};assert.equal(event.timer?.remainingMs,10000);assert.equal(requests,1);}
  finally{globalThis.fetch=previous;}
});
function timed() {return {...emptyTournament('clock'),fighters:[fighter,{...fighter,id:'second'}],bouts:[{id:'bout',redId:'ignored',blueId:'second',className:'',rule:''}],schedule:[{no:1,rounds:2,roundSeconds:10,breakSeconds:5}]} satisfies LocalTournament;}
test('every round requires a chair start; break counts down but never starts the next round automatically',()=>{
  const started=timerCommand(timed(),'start',1000);
  assert.equal(timerAt(started,6000)?.remainingMs,5000);
  assert.equal(timerAt(started,11000)?.phase,'break');assert.equal(timerAt(started,16000)?.round,2);
  const waiting=timerAt(started,18000);assert.equal(waiting?.remainingMs,10000);assert.equal(waiting?.status,'paused');
  const second=timerCommand(started,'start',20000),paused=timerCommand(second,'pause',22000);assert.equal(timerAt(paused,30000)?.remainingMs,8000);
  const resumed=timerCommand(paused,'start',40000);assert.equal(timerAt(resumed,48000)?.phase,'complete');
  assert.equal(timerAt(started,1_000_000)?.status,'paused');assert.equal(timerAt(started,1_000_000)?.round,2);assert.equal(timerCommand(paused,'reset',50000).timer?.remainingMs,10000);
  const noBreak=timerCommand({...timed(),schedule:[{no:1,rounds:2,roundSeconds:10,breakSeconds:0}]},'start',1000);assert.equal(timerAt(noBreak,11000)?.round,2);assert.equal(timerAt(noBreak,11000)?.status,'paused');
});
test('spectator endpoint exposes only name, gym and weight after explicit open; close also disables old links',async()=>{
  const h=cloudHarness();let data=await save(h,{...timed(),fighters:[{...fighter,comment:'架空の非公開意気込み',age:'12',musicUrl:'https://music.apple.com/test'}, {...fighter,id:'second'}]});
  const path='/api/cloud-view?code='+await recruitmentCode('legacy-operator','clock');
  assert.equal((await call(h,path)).status,404);
  data=await save(h,{...data,audience:{open:true}});
  const response=await call(h,path);assert.equal(response.status,200);const body=await response.json() as {view:{red:unknown}};
  assert.deepEqual(body.view.red,{name:fighter.name,gym:fighter.gym,weight:fighter.weight});
  for(const secret of ['photoDataUrl','架空の非公開意気込み','music.apple.com','age','record','updatedAt','ignored'])assert.ok(!JSON.stringify(body).includes(secret));
  assert.equal((await call(h,path,'POST',{})).status,405);
  await save(h,{...data,audience:{open:false}});assert.equal((await call(h,path)).status,404);
});
test('timer commands are authenticated, server timed, persisted across restart and reject stale commands',async()=>{
  const h=cloudHarness(),saved=await save(h,timed());const path='/api/private-timer?event=clock';
  assert.equal((await call(h,path,'POST',{action:'start',updatedAt:saved.updatedAt})).status,401);
  const response=await call(h,path,'POST',{action:'start',updatedAt:saved.updatedAt},auth);assert.equal(response.status,200);
  const body=await response.json() as {event:LocalTournament;serverNow:number};assert.equal(body.event.timer?.startedAt,body.serverNow);
  h.restart();const current=(await (await call(h,'/api/private-event?event=clock','GET',undefined,auth)).json() as {event:LocalTournament}).event;assert.deepEqual(current.timer,body.event.timer);
  assert.equal((await call(h,path,'POST',{action:'pause',updatedAt:saved.updatedAt},auth)).status,409);
  assert.equal((await call(h,path,'POST',{action:'pause',updatedAt:current.updatedAt},auth)).status,200);
});
