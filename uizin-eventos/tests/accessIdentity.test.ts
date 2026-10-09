import test from 'node:test';
import assert from 'node:assert/strict';
import { accessIdentity } from '../core/accessIdentity.ts';
const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('email-code identity requires signed Access token, issuer, audience, expiry and explicitly allowed email',async()=>{
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const issuer='https://dummy-team.cloudflareaccess.com',settings={issuer,audience:'dummy-audience',emails:'chair@example.invalid'};
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const resolver=(async()=>Response.json({keys:[{...jwk,kid:'test-key'}]})) as typeof fetch;
  const token=async(extra:Record<string,unknown>={})=>{const message=b64({alg:'RS256',kid:'test-key'})+'.'+b64({iss:issuer,aud:['dummy-audience'],exp:2000,email:'chair@example.invalid',...extra});return message+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(message))).toString('base64url');};
  const good=await token();const id=await accessIdentity(good,settings,resolver,1000000);assert.match(id||'',/^[a-f0-9]{64}$/);
  for(const extra of [{iss:'https://wrong.cloudflareaccess.com'},{aud:['other']},{exp:999},{nbf:2000},{email:'other@example.invalid'}])assert.equal(await accessIdentity(await token(extra),settings,resolver,1000000),null);
  assert.equal(await accessIdentity(good.slice(0,-20)+'A'.repeat(20),settings,resolver,1000000),null);
  assert.equal(await accessIdentity(good,{...settings,emails:''},resolver,1000000),null);
  assert.equal(await accessIdentity(good,{...settings,issuer:'https://evil.invalid'},resolver,1000000),null);
});

test('different allowed chairs get different identities; legacy operator cannot bypass enabled Access',async()=>{
  const {cloudHarness}=await import('./support/cloudHarness.ts');
  const backend=cloudHarness();backend.env.ACCESS_AUD='configured';
  const response=await backend.fetch(new Request('https://local/api/private-event?event=chair-a',{headers:{'x-operator-key':'test-only-operator'}}));
  assert.equal(response.status,401);
});

test('signed identities isolate cloud documents and catalog even when event codes match',async()=>{
  const {cloudHarness}=await import('./support/cloudHarness.ts');
  const {emptyTournament}=await import('../core/privateTournament.ts');
  const backend=cloudHarness();
  const issuer='https://dummy-chair.cloudflareaccess.com';
  backend.env.ACCESS_ISSUER=issuer;backend.env.ACCESS_AUD='local-app';backend.env.ACCESS_ALLOWED_EMAILS='one@example.invalid,two@example.invalid';
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const token=async(email:string)=>{const message=b64({alg:'RS256',kid:'chair-key'})+'.'+b64({iss:issuer,aud:['local-app'],exp:Math.floor(Date.now()/1000)+60,email});return message+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(message))).toString('base64url');};
  const one=await token('one@example.invalid'),two=await token('two@example.invalid');
  const previous=globalThis.fetch;
  globalThis.fetch=(async(url:RequestInfo|URL)=>{assert.equal(String(url),issuer+'/cdn-cgi/access/certs');return Response.json({keys:[{...publicKey,kid:'chair-key'}]});}) as typeof fetch;
  const call=(proof:string,method='GET',body?:unknown,path='/api/private-event?event=same-code')=>backend.fetch(new Request('https://local'+path,{method,headers:{'cf-access-jwt-assertion':proof},body:body?JSON.stringify(body):undefined}));
  try{
    assert.equal((await call(one,'PUT',{...emptyTournament('same-code'),title:'Dummy private event'})).status,200);
    assert.equal((await (await call(two)).json() as {event:unknown}).event,null);
    assert.equal((await (await call(two,'GET',undefined,'/api/private-events')).json() as {events:unknown[]}).events.length,0);
    assert.equal((await (await call(one,'GET',undefined,'/api/private-events')).json() as {events:unknown[]}).events.length,1);
    assert.equal((await call('forged-token')).status,401);
  }finally{globalThis.fetch=previous;}
});
