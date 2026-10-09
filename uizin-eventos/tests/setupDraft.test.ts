import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTournament } from '../core/privateTournament.ts';
import { saveDraft, readDraft, validDraft, type SetupDraft } from '../core/setupDraft.ts';
import { CloudConflict } from '../core/cloudTournament.ts';
import { cloudHarness, MemoryStore } from './support/cloudHarness.ts';
import { encryptPayload, decryptPayload } from '../app/lib/privateStore.ts';
const draft=():SetupDraft=>({format:'tournament-os-draft-1',revision:0,document:{...emptyTournament('unfinished'),title:'',date:'2027年10月',recruitment:{open:true,deadline:'202710',description:'unfinished'}},controls:{rounds:2,roundSeconds:90,breakSeconds:30}});
test('draft retains unfinished fields separately, rejects unknown private fields and stale writes',async()=>{
 const store=new MemoryStore(),value=draft();assert.equal(validDraft(value,'unfinished'),true);
 assert.equal(validDraft({...value,document:{...value.document,contact:'private'}},'unfinished'),false);
 assert.equal(validDraft({...value,document:{...value.document,recruitment:{...value.document.recruitment,email:'private'}}},'unfinished'),false);
 const first=await saveDraft(store,'unfinished',value);assert.deepEqual(await readDraft(store,'unfinished'),first);
 await assert.rejects(saveDraft(store,'unfinished',value),CloudConflict);
 assert.equal(await store.get('private:current'),undefined);
});
test('draft API authenticates, catalogs unfinished events and does not change published document',async()=>{
 const h=cloudHarness(),headers={'x-operator-key':'test-only-operator'},call=(path:string,method='GET',body?:unknown,key:Record<string,string>=headers)=>h.fetch(new Request('https://local/api/'+path,{method,headers:key,body:body?JSON.stringify(body):undefined}));
 assert.equal((await call('private-draft?event=unfinished','GET',undefined,{})).status,401);
 assert.equal((await call('private-drafts','GET',undefined,{})).status,401);
 const main={...emptyTournament('unfinished'),title:'Published',date:'2027年10月3日',audience:{open:false},recruitment:{open:false,deadline:'',description:''}};
 assert.equal((await call('private-event?event=unfinished','PUT',main)).status,200);
 const before=await (await call('private-event?event=unfinished')).json() as {event:unknown};
 assert.equal((await call('private-draft?event=unfinished','PUT',draft())).status,200);h.restart();
 const saved=await (await call('private-draft?event=unfinished')).json() as {draft:SetupDraft};assert.equal(saved.draft.document.date,'2027年10月');
 assert.deepEqual((await (await call('private-event?event=unfinished')).json() as {event:unknown}).event,before.event);
 assert.equal((await call('private-draft?event=unfinished','PUT',draft())).status,409);
 const list=await (await call('private-drafts')).json() as {events:Array<{eventId:string}>};assert.equal(list.events[0].eventId,'unfinished');
 const other=await (await call('private-draft?event=another')).json() as {draft:unknown};assert.equal(other.draft,null);
});
test('handoff encryption round-trips unfinished dates and unapplied time controls; wrong password fails',async()=>{
 const value=draft(),text=await encryptPayload(value,'test-only-password');assert.equal(text.includes('unfinished'),false);assert.equal(text.includes('202710'),false);
 assert.deepEqual(await decryptPayload(text,'test-only-password'),value);
 await assert.rejects(decryptPayload(text,'wrong-password'));
 await assert.rejects(encryptPayload(value,'short'));
});

test('repeated autosaves use bounded two-slot storage and preserve the original published revision',async()=>{
 const store=new MemoryStore();let value=draft();const base=value.document.updatedAt;
 for(let i=0;i<100;i++)value=await saveDraft(store,'unfinished',{...value,document:{...value.document,title:'Draft '+i}});
 assert.equal(value.document.updatedAt,base);assert.equal(store.values.size,3);assert.deepEqual(await readDraft(store,'unfinished'),value);
});

test('draft read and concurrent slot rotations return coherent snapshots',async()=>{
 const store=new MemoryStore();let value=await saveDraft(store,'unfinished',draft());
 const reads:Array<Promise<SetupDraft|null>>=[];
 for(let i=0;i<20;i++){reads.push(readDraft(store,'unfinished'));value=await saveDraft(store,'unfinished',{...value,document:{...value.document,title:'Coherent '+i}});}
 const result=await Promise.all(reads);assert.equal(result.length,20);assert.ok(result.every(d=>d&&validDraft(d,'unfinished')));
});
