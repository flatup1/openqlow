import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTournament } from '../core/privateTournament.ts';
import { CloudConflict, readCloudTournament, saveCloudTournament } from '../core/cloudTournament.ts';
import { safeGoogleRules, RULE_HEADERS } from '../core/safeGoogleRules.ts';
import { cloudHarness, MemoryStore } from './support/cloudHarness.ts';
import { readFileSync } from 'node:fs';

test('cloud document survives room restart and isolates events; public state never includes private data',async()=>{
  const backend=cloudHarness();
  const request=(event:string,method='GET',body?:unknown,key='test-only-operator')=>backend.fetch(new Request('https://local/api/private-event?event='+event,{method,headers:{'x-operator-key':key},body:body?JSON.stringify(body):undefined}));
  assert.equal((await request('cloud-a','GET',undefined,'')).status,401);
  const value={...emptyTournament('cloud-a'),title:'Dummy tournament'};
  assert.equal((await request('cloud-a','PUT',value)).status,200);
  const catalog=await (await backend.fetch(new Request('https://local/api/private-events',{headers:{'x-operator-key':'test-only-operator'}}))).json() as {events:Array<{eventId:string}>};
  assert.equal(catalog.events[0].eventId,'cloud-a');
  backend.restart();
  const read=await (await request('cloud-a')).json() as {event:typeof value};
  assert.equal(read.event.title,value.title);
  assert.equal((await request('cloud-a','PUT',value)).status,409);
  assert.equal((await (await request('cloud-b')).json() as {event:unknown}).event,null);
  const publicState=await (await backend.fetch(new Request('https://local/api/state?event=cloud-a'))).text();
  assert.equal(publicState.includes(value.title),false);
  assert.equal((await request('cloud-b','PUT',value)).status,400);
});
test('chunked cloud storage saves photographs and retains previous revision; concurrent stale writers are rejected',async()=>{
  const store=new MemoryStore();
  const original={...emptyTournament('chunk-test'),fighters:[{id:'D1',gym:'Dummy',name:'Dummy',grade:'',age:'',height:'170',weight:'60',record:'',comment:'',musicUrl:'',photoDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200000)}]};
  const first=await saveCloudTournament(store,'chunk-test',original,100);
  assert.deepEqual(await readCloudTournament(store,'chunk-test'),first);
  assert.ok([...store.values.keys()].filter(key=>key.startsWith('private:')).length>4);
  const results=await Promise.allSettled([saveCloudTournament(store,'chunk-test',{...first,title:'One'},200),saveCloudTournament(store,'chunk-test',{...first,title:'Two'},200)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason instanceof CloudConflict).length,1);
  assert.ok(store.values.has(`private:${first.updatedAt}:0`));
});
test('cloud rejects hidden contact fields and broken payloads without overwriting',async()=>{
  const store=new MemoryStore(),original=emptyTournament('safe-test');
  const first=await saveCloudTournament(store,'safe-test',original);
  await assert.rejects(saveCloudTournament(store,'safe-test',{...first,entryConfig:{music:false,grade:'off',age:'off',comment:'off',phone:'dummy'}}));
  await assert.rejects(saveCloudTournament(store,'safe-test',{...first,schedule:[{no:1,rounds:3,roundSeconds:180,breakSeconds:60,phone:'dummy'}]}));
  await assert.rejects(saveCloudTournament(store,'safe-test',{...first,contactEmail:'dummy@example.invalid'}));
  await assert.rejects(saveCloudTournament(store,'safe-test',{...first,eventId:'other'}));
  assert.deepEqual(await readCloudTournament(store,'safe-test'),first);
});
test('Google allows only the four numeric columns and rejects PII columns, extra fields and invalid ranges',()=>{
  assert.deepEqual(safeGoogleRules([RULE_HEADERS,[1,3,180,60]]),[{no:1,rounds:3,roundSeconds:180,breakSeconds:60}]);
  for(const rows of [[['選手名'],['Dummy']],[[...RULE_HEADERS,'電話'],[1,3,180,60,'dummy']],[RULE_HEADERS,[1,3,180,60,'extra']],[RULE_HEADERS,[1,3,'Dummy',60]],[RULE_HEADERS,[1,3,180,60],[1,3,180,60]]])assert.throws(()=>safeGoogleRules(rows));
});
test('Google dedicated action returns before original sheet access; same-origin binding has fixed paths',()=>{
  const gas=readFileSync(new URL('../docs/templates/entry-sheet-apps-script.gs',import.meta.url),'utf8');
  const start=gas.indexOf("body.action === 'rules'");const end=gas.indexOf('const sheet = book.getSheetByName(SHEET_NAME)');
  assert.ok(start<end);const action=gas.slice(start,end);
  assert.match(action,/getLastColumn\(\) !== 4/);assert.match(action,/getRange\(1,1,Math.max\(1,rules.getLastRow\(\)\),4\)/);
  assert.doesNotMatch(action,/getDataRange|rowToEntry/);
  const proxy=readFileSync(new URL('../functions/api/[[path]].ts',import.meta.url),'utf8');
  assert.match(proxy,/EVENTOS_API/);assert.match(proxy,/redirect:'manual'/);
});
