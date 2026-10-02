import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createGoogleConnectionRequest, deadlineIso, GOOGLE_RECEPTION_BUILD, googleConnectionFresh, verifyGoogleConnection } from '../core/googleConnection.ts';
import { importFighters, validateTournament, contractWeight } from '../core/privateTournament.ts';
import { publicEntryConfig, publicEntryHash, publicEntryReady } from '../core/publicEntry.ts';

const owner='organizer@example.com', endpoint='https://script.google.com/macros/s/TEST_ONLY/exec', setupKey='a'.repeat(64);
const policy=JSON.stringify({title:'テスト大会',deadline:'2099-11-30',music:false,grade:'optional',age:'optional',comment:'optional'});
const script=readFileSync(new URL('../public/templates/Tournament_OS_Google受付.gs',import.meta.url),'utf8').replace(/^const SETTINGS = .*;$/m,
  'const SETTINGS = '+JSON.stringify({eventId:'test-cup',tournamentName:'テスト大会',expectedOwner:owner,setupKey,deadline:'2099-11-30',music:false,grade:'optional',age:'optional',comment:'optional'})+';');

function harness() {
  const props=new Map<string,string>(), books=new Map<string,any>(), resources=new Map<string,any>(), logs:string[]=[];
  let currentOwner=owner, serial=0, busy=false, serviceEndpoint:string|null=endpoint;
  const fail=new Map<string,number>();
  const hit=(name:string)=>{const n=fail.get(name)||0;if(n){fail.set(name,n-1);throw new Error('SIMULATED_'+name);}};
  const iterator=(array:any[])=>{let index=0;return{hasNext:()=>index<array.length,next:()=>array[index++]};};
  const blob=(bytes:any,type:string,name:string)=>({bytes:typeof bytes==='string'?Buffer.from(bytes):Buffer.from(bytes),type,name,getBytes(){return [...this.bytes];},setName(value:string){this.name=value;return this;}});
  const propsApi={getProperty:(name:string)=>props.get(name)||null,setProperty:(name:string,value:string)=>{hit('property:'+name);props.set(name,String(value));},setProperties:(values:Record<string,string>)=>Object.entries(values).forEach(([k,v])=>props.set(k,String(v)))};
  function resource(kind:string,name:string,parent?:string,data?:any):any {
    const id='resource'+(++serial);
    const result:any={kind,name,id,parent,children:[] as any[],data,sharing:'PRIVATE',editors:[],viewers:[],trashed:false,
      getId:()=>id,getOwner:()=>({getEmail:()=>owner}),getSharingAccess:()=>result.sharing,getEditors:()=>result.editors,getViewers:()=>result.viewers,isTrashed:()=>result.trashed,
      getUrl:()=>kind==='folder'?'https://drive.google.com/drive/folders/'+id:'https://drive.google.com/file/d/'+id+'/view',
      getSize:()=>result.data?.bytes?.length||0,getBlob:()=>blob(result.data.bytes,result.data.type,result.name),
      getParents:()=>iterator(parent?[resources.get(parent)]:[]),
      createFolder:(value:string)=>{hit('createFolder');const next=resource('folder',value,id);result.children.push(next);return next;},
      createFile:(value:any)=>{hit('photo:before');const next=resource('file',value.name,id,value);result.children.push(next);hit('photo:after');return next;},
      getFilesByName:(value:string)=>iterator(result.children.filter((child:any)=>child.kind==='file'&&child.name===value&&!child.trashed)),
    };
    resources.set(id,result);return result;
  }
  function sheet(book:any,name:string):any {
    const formats=new Map<string,string>();
    const stored=(value:any,r:number,c:number)=>typeof value==='string'&&formats.get(r+':'+c)!=='@'&&/^\d+(?:\.\d+)?$/.test(value)?Number(value):value;
    const result:any={name,rows:[] as any[][],
      setName:(value:string)=>{book.sheets.delete(result.name);result.name=value;book.sheets.set(value,result);},
      getLastRow:()=>result.rows.length,
      appendRow:(values:any[])=>{hit('append:before:'+result.name);const r=result.rows.length+1;result.rows.push(values.map((v,c)=>stored(v,r,c+1)));hit('append:after:'+result.name);},
      getRange:(r:number,c:number,n=1,m=1)=>{const range={
        getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(result.rows[r-1+i]?.[c-1+j]??'').replace(/^'(?=[=+\-@])/u,''))),
        setValues:(values:any[][])=>{const isNew=r>result.rows.length&&c===1&&m===18;if(isNew)hit('append:before:'+result.name);hit('set:'+result.name);values.forEach((row,i)=>{result.rows[r-1+i]??=[];row.forEach((value,j)=>result.rows[r-1+i][c-1+j]=stored(value,r+i,c+j));});if(isNew)hit('append:after:'+result.name);return range;},
        setNumberFormat:(format:string)=>{for(let i=0;i<n;i++)for(let j=0;j<m;j++)formats.set((r+i)+':'+(c+j),format);return range;},
        getDisplayValue:()=>range.getDisplayValues()[0][0],
        setValue:(value:any)=>range.setValues([[value]]),
        setFontWeight:()=>range,
      };return range;},
      getDataRange:()=>result.getRange(1,1,result.rows.length,result.rows[0]?.length||1),
    };book.sheets.set(name,result);return result;
  }
  const api:any={
    Session:{getEffectiveUser:()=>({getEmail:()=>currentOwner})},
    PropertiesService:{getScriptProperties:()=>propsApi},
    LockService:{getScriptLock:()=>({tryLock:()=>!busy,releaseLock:()=>undefined})},
    SpreadsheetApp:{
      create:(name:string)=>{const file=resource('file',name);const book:any={id:file.id,sheets:new Map(),getId:()=>file.id,getUrl:()=>'https://docs.google.com/spreadsheets/d/'+file.id+'/edit',getSheets:()=>[...book.sheets.values()],getSheetByName:(value:string)=>book.sheets.get(value),insertSheet:(value:string)=>sheet(book,value)};sheet(book,'Sheet1');books.set(file.id,book);return book;},
      openById:(id:string)=>{const value=books.get(id);if(!value)throw new Error('book missing');return value;},flush:()=>hit('flush'),
    },
    DriveApp:{Access:{PRIVATE:'PRIVATE'},createFolder:(name:string)=>resource('folder',name),getFolderById:(id:string)=>{const value=resources.get(id);if(!value)throw new Error('folder missing');return value;},getFileById:(id:string)=>{const value=resources.get(id);if(!value)throw new Error('file missing');return value;}},
    Utilities:{getUuid:randomUUID,base64Decode:(value:string)=>[...Buffer.from(value,'base64')],newBlob:blob,Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_:any,value:string|number[])=>[...createHash('sha256').update(typeof value==='string'?value:Buffer.from(value.map(b=>b&255))).digest()],computeHmacSha256Signature:(value:string,key:string,charset:string)=>{assert.equal(charset,'utf8','確認コードはブラウザと同じUTF-8で署名する');return[...createHmac('sha256',key).update(value,'utf8').digest()];},zip:(files:any[],name:string)=>({...blob('zip','application/zip',name),files})},
    ScriptApp:{getService:()=>({getUrl:()=>serviceEndpoint})},Logger:{log:(value:string)=>logs.push(value)},
    HtmlService:{createHtmlOutput:(html:string)=>({html,setTitle(){return this;},addMetaTag(){return this;}})},console:{error:()=>undefined},
  };
  vm.createContext(api);vm.runInContext(script,api);
  const params=(mode='test',id=randomUUID())=>({protocol:'2',eventId:'test-cup',entryKey:props.get(mode==='test'?'testKey':'entryKey'),mode,requestId:id,gym:'架空ジム',name:'架空選手',height:'170',weight:'65',record:'初試合',grade:'',age:'20',comment:'がんばります',musicUrl:'',contactName:'テスト担当',contactPhone:'09000000000',contactEmail:'test@example.com',consent:'yes',photoDataUrl:'data:image/jpeg;base64,/9j/2Q=='});
  const book=()=>books.get(props.get('spreadsheetId')!);
  const rowCount=(name:string)=>book().getSheetByName(name).getLastRow()-1;
  const photos=(mode='test')=>resources.get(props.get(mode==='test'?'testFolderId':'photoFolderId')!).children.filter((r:any)=>r.kind==='file');
  return{api,props,resources,books,logs,fail,params,book,rowCount,photos,setOwner:(value:string)=>currentOwner=value,setBusy:(value:boolean)=>busy=value,setServiceEndpoint:(value:string|null)=>serviceEndpoint=value};
}

test('GAS初期設定は繰り返しても同じ原本・写真フォルダを使い、既存データを保つ',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());
  const ids=[...h.props.entries()],count=h.resources.size;
  h.api.setupTournament();
  assert.equal(h.resources.size,count);for(const[k,v]of ids)assert.equal(h.props.get(k),v);
  assert.equal(h.rowCount('テスト申込'),1);
});
test('旧版で作った原本・フォルダ・申し込みを消さず、新しい受付設定を追加できる',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());h.api.openEntries();h.api.saveEntry_(h.params('live'));
  const sheetId=h.props.get('spreadsheetId'),folderId=h.props.get('photoFolderId'),rows=JSON.stringify(h.book().getSheetByName('申込原本（個人情報あり）').rows);
  for(const key of ['entryKey','testKey','accepting','lastTestRequest','lastTestBuild','lastTestPolicy'])h.props.delete(key);
  h.api.setupTournament();
  assert.equal(h.props.get('spreadsheetId'),sheetId);assert.equal(h.props.get('photoFolderId'),folderId);assert.equal(JSON.stringify(h.book().getSheetByName('申込原本（個人情報あり）').rows),rows);
  assert.equal(h.props.get('accepting'),'false');assert.equal(h.api.testComplete_(h.book()),false);
});
test('原本の列が変わったら保存を停止し、間違った列に情報を追加しない',()=>{
  const h=harness();h.api.setupTournament();h.book().getSheetByName('申込原本（個人情報あり）').rows[0][4]='体重';
  assert.throws(()=>h.api.saveEntry_(h.params()),/見出し/);assert.equal(h.photos().length,0);assert.equal(h.rowCount('テスト申込'),0);
});
test('他のGoogle所有者・公開共有・直接共有・削除済みフォルダでは停止する',()=>{
  const h=harness();h.setOwner('other@example.com');assert.throws(()=>h.api.setupTournament(),/主催者/);assert.equal(h.books.size,0);
  h.setOwner(owner);h.api.setupTournament();const folder=h.resources.get(h.props.get('photoFolderId')!)!;
  folder.sharing='ANYONE';assert.throws(()=>h.api.checkTournament(),/共有/);
  folder.sharing='PRIVATE';folder.viewers=[{getEmail:()=>'other@example.com'}];assert.throws(()=>h.api.checkTournament(),/共有/);
  folder.viewers=[];folder.trashed=true;assert.throws(()=>h.api.checkTournament(),/共有/);
});
test('接続確認コードは主催者・大会・GAS・共有設定・改変を検査する',async()=>{
  const h=harness();h.api.setupTournament();
  const code=h.api.checkTournament();const result=await verifyGoogleConnection(code,setupKey,'test-cup',owner,policy);
  assert.equal(result.testComplete,false);assert.equal(result.accepting,false);assert.equal(result.endpoint,endpoint);
  await assert.rejects(verifyGoogleConnection(code,setupKey,'another-cup',owner,policy));
  await assert.rejects(verifyGoogleConnection(code,setupKey,'test-cup','other@example.com',policy));
  await assert.rejects(verifyGoogleConnection(code,'b'.repeat(64),'test-cup',owner,policy));
  await assert.rejects(verifyGoogleConnection(code,setupKey,'test-cup',owner,policy.replace('2099','2098')));
  await assert.rejects(verifyGoogleConnection(code.replace('TEST_ONLY','FAKE'),setupKey,'test-cup',owner,policy));
});
test('編集画面が /dev でもコードの手修正を求めず、公開受付で直接照合し、原本・設定を変えない',async()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());
  const beforeProps=[...h.props.entries()],beforeRows=JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows])),beforeResources=h.resources.size;
  h.setServiceEndpoint('https://script.google.com/macros/s/EDITOR_TEST_ONLY/dev');
  assert.throws(()=>h.api.checkTournament(),/コードは書き直さなくて/);
  const request=await createGoogleConnectionRequest(endpoint,setupKey,'test-cup');
  h.setServiceEndpoint(endpoint);
  const code=h.api.verifyConnection_({protocol:'2',...request});
  const result=await verifyGoogleConnection(code,setupKey,'test-cup',owner,policy,request);
  assert.equal(result.endpoint,endpoint);assert.equal(result.testComplete,true);assert.equal(result.accepting,false);
  assert.equal(result.deploymentVerified,true);assert.equal(result.build,GOOGLE_RECEPTION_BUILD);assert.equal(googleConnectionFresh(result),true);
  assert.deepEqual([...h.props.entries()],beforeProps);assert.equal(JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows])),beforeRows);assert.equal(h.resources.size,beforeResources);
});
test('デプロイID・ /dev・他ドメイン・検索付きURL・未設定はGoogleへ送る前に拒否する',async()=>{
  for(const value of ['','AKfyDEPLOYMENT_ID','https://script.google.com/macros/s/TEST_ONLY/dev','https://example.com/exec','https://script.google.com/macros/s/TEST_ONLY/exec?x=1'])await assert.rejects(createGoogleConnectionRequest(value,setupKey,'test-cup'),/ウェブアプリ URL/);
});
test('確認コードのコピー失敗は古い実行ログでなく今のGoogleの白い欄へ案内する',async()=>{
  for(const code of ['', 'not-code', 'TOS2.not-json', 'TOS2.{"payload":null,"signature":"bad"}']){
    await assert.rejects(verifyGoogleConnection(code,setupKey,'test-cup',owner,policy),(error:Error)=>{
      assert.match(error.message,/白い欄/);assert.doesNotMatch(error.message,/実行ログ/);return true;
    });
  }
});
test('接続照合POSTは確認画面だけを返し、写真・申込・受付状態を変えず秘密をURLに入れない',async()=>{
  const h=harness();h.api.setupTournament();const request=await createGoogleConnectionRequest(endpoint,setupKey,'test-cup');
  const beforeProps=[...h.props],beforeResources=h.resources.size;
  const response=h.api.doPost({parameter:{action:'verifyConnection',protocol:'2',payload:request.payload,signature:request.signature}});
  assert.match(response.html,/Google受付の接続を確認できました/);assert.match(response.html,/readonly/);assert.doesNotMatch(response.html,new RegExp(setupKey));
  assert.deepEqual([...h.props],beforeProps);assert.equal(h.resources.size,beforeResources);assert.equal(h.rowCount('テスト申込'),0);assert.equal(h.rowCount('申込原本（個人情報あり）'),0);
  assert.equal(request.endpoint,endpoint);assert.equal(request.endpoint.includes(request.signature),false);
});
test('別の会長・別の大会・URL改変・期限切れの接続照合では受付キーを返さない',async()=>{
  const h=harness();h.api.setupTournament();
  const sign=(value:any,key=setupKey)=>{const payload=JSON.stringify(value);return{protocol:'2',payload,signature:createHmac('sha256',key).update(payload).digest('hex')};};
  const base={eventId:'test-cup',endpoint,nonce:randomUUID(),issuedAt:Date.now()};
  for(const params of [sign(base,'b'.repeat(64)),sign({...base,eventId:'other-cup'}),sign({...base,endpoint:'https://script.google.com/macros/s/OTHER/exec'}),sign({...base,issuedAt:Date.now()-310_000}),sign({...base,issuedAt:Date.now()+60_000}),sign({...base,nonce:'short'}),sign({...base,issuedAt:'bad'}),{protocol:'2',payload:'not-json',signature:'0'.repeat(64)}]){
    const reply=h.api.doPost({parameter:{action:'verifyConnection',...params}});assert.match(reply.html,/まだ接続できません/);assert.doesNotMatch(reply.html,/TOS2\./);assert.doesNotMatch(reply.html,new RegExp(h.props.get('entryKey')!));
  }
  h.setOwner('other@example.com');assert.throws(()=>h.api.verifyConnection_(sign(base)),/主催者/);
  h.setOwner(owner);h.setServiceEndpoint('https://script.google.com/macros/s/EDITOR/dev');assert.throws(()=>h.api.verifyConnection_(sign(base)),/URLか確認時間/);
});
test('同じ会長でも公開版・確認の回・受付URL・時間が違えば配布用の接続確認にしない',async()=>{
  const h=harness();h.api.setupTournament();const request=await createGoogleConnectionRequest(endpoint,setupKey,'test-cup');
  const original=h.api.verifyConnection_({protocol:'2',...request});
  const envelope=JSON.parse(original.slice(5)), report=JSON.parse(envelope.payload);
  const forged=(extra:any)=>{const payload=JSON.stringify({...report,...extra});return'TOS2.'+JSON.stringify({payload,signature:createHmac('sha256',setupKey).update(payload).digest('hex')});};
  for(const extra of [{challenge:randomUUID()},{endpoint:'https://script.google.com/macros/s/OTHER/exec'},{checkedVia:'editor'},{build:'2.old'},{issuedAt:Date.now()-16*60_000},{issuedAt:Date.now()+60_000}])await assert.rejects(verifyGoogleConnection(forged(extra),setupKey,'test-cup',owner,policy,request));
  const legacy=await verifyGoogleConnection(h.api.checkTournament(),setupKey,'test-cup',owner,policy);assert.equal(legacy.deploymentVerified,false);assert.equal(googleConnectionFresh(legacy),false);
  const proof=await verifyGoogleConnection(original,setupKey,'test-cup',owner,policy,request);assert.equal(googleConnectionFresh(proof,proof.issuedAt+16*60_000),false);
});
test('受付開始は編集画面の /dev による後続エラーを出さず、状態変更を正直に報告する',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());h.setServiceEndpoint('https://script.google.com/macros/s/EDITOR/dev');
  assert.equal(h.api.openEntries(),true);assert.equal(h.props.get('accepting'),'true');assert.match(h.logs.at(-1)!,/受付を開始しました/);
});
test('テスト3点の一致がないと本番を開けず、テスト申込は本番へ混ざらない',async()=>{
  const h=harness();h.api.setupTournament();assert.throws(()=>h.api.openEntries(),/テスト/);
  const p=h.params();h.api.saveEntry_(p);h.api.openEntries();
  const proof=await verifyGoogleConnection(h.api.checkTournament(),setupKey,'test-cup',owner,policy);
  assert.equal(proof.testComplete,true);assert.equal(proof.accepting,true);assert.equal(h.rowCount('申込原本（個人情報あり）'),0);assert.equal(h.rowCount('OS取込用（連絡先なし）'),0);
  h.book().getSheetByName('テストOS取込用').rows[1][2]='ずれ';assert.throws(()=>h.api.openEntries(),/テスト/);
});
for(const point of ['photo:before','photo:after','append:before:テスト申込','append:after:テスト申込','append:before:テストOS取込用','append:after:テストOS取込用','flush','property:lastTestRequest']){
  test('途中失敗から同じ申込番号で復旧し、写真・原本・OS用が1件ずつになる: '+point,()=>{
    const h=harness();h.api.setupTournament();const p=h.params();h.fail.set(point,1);
    const first=h.api.doPost({parameter:p});assert.match(first.html,/同じ申込を確認・再開する/);assert.doesNotMatch(first.html,/<h1>申し込みが完了しました/);
    const receipt=h.api.saveEntry_(p);assert.equal(h.api.saveEntry_(p),receipt);
    assert.equal(h.rowCount('テスト申込'),1);assert.equal(h.rowCount('テストOS取込用'),1);assert.equal(h.photos().length,1);assert.equal(h.api.testComplete_(h.book()),true);
  });
}
test('本番受付は開く前・閉じた後・締切後に拒否し、既存申込の修復は継続できる',()=>{
  const h=harness();h.api.setupTournament();assert.throws(()=>h.api.saveEntry_(h.params('live')),/受け付け/);
  h.api.saveEntry_(h.params());h.api.openEntries();const p=h.params('live'),receipt=h.api.saveEntry_(p);
  h.api.closeEntries();assert.throws(()=>h.api.saveEntry_(h.params('live')),/受け付け/);assert.equal(h.api.saveEntry_(p),receipt);
  h.props.set('accepting','true');vm.runInContext("SETTINGS.deadline='2000-01-01';",h.api);
  assert.throws(()=>h.api.saveEntry_(h.params('live')),/受け付け/);assert.equal(h.api.saveEntry_(p),receipt);
});
test('Googleの数字変換があっても、電話番号・数字だけの選手名・学年の先頭0を保存する',()=>{
  const h=harness();h.api.setupTournament();
  const p={...h.params(),gym:'001',name:'007',grade:'01',contactName:'009',contactPhone:'09000000000'};
  const receipt=h.api.saveEntry_(p);
  const original=h.book().getSheetByName('テスト申込').getRange(2,1,1,18).getDisplayValues()[0];
  assert.equal(original[3],'001');assert.equal(original[4],'007');assert.equal(original[5],'01');
  assert.equal(original[13],'009');assert.equal(original[14],'09000000000');
  const os=h.book().getSheetByName('テストOS取込用').getRange(2,1,1,11).getDisplayValues()[0];
  assert.equal(os[1],'001');assert.equal(os[2],'007');assert.equal(os[3],'01');
  assert.equal(h.api.saveEntry_(p),receipt);assert.equal(h.rowCount('テスト申込'),1);
});
test('同じ申込番号で内容や写真を変えても、古い内容を完了と表示せず、元のデータを保つ',()=>{
  const h=harness();h.api.setupTournament();const p=h.params(),receipt=h.api.saveEntry_(p);
  const beforeRows=JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows]));
  for(const changes of [{name:'別選手'},{weight:'66'},{contactEmail:'other@example.com'},{photoDataUrl:'data:image/jpeg;base64,/9gB/9k='}]){
    const reply=h.api.doPost({parameter:{...p,...changes}});
    assert.match(reply.html,/主催者へ訂正/);assert.doesNotMatch(reply.html,/<h1>申し込みが完了しました/);
    assert.equal(JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows])),beforeRows);assert.equal(h.photos().length,1);
  }
  assert.equal(h.api.saveEntry_({...p,height:'170.0',weight:'65.00',name:' '+p.name+' '}),receipt);
});
test('再送時に保存済み写真が削除・公開・改変されていたら、完了と表示しない',()=>{
  for(const mutation of ['trash','sharing','bytes']){
    const h=harness();h.api.setupTournament();const p=h.params();h.api.saveEntry_(p);const photo=h.photos()[0];
    if(mutation==='trash')photo.trashed=true;
    if(mutation==='sharing')photo.sharing='ANYONE';
    if(mutation==='bytes')photo.data.bytes=Buffer.from([255,216,1,255,217]);
    const reply=h.api.doPost({parameter:p});assert.doesNotMatch(reply.html,/<h1>申し込みが完了しました/);
  }
});
test('申込番号・大会・専用キー・同意・数値・写真形式の不正を保存前に止める',()=>{
  const h=harness();h.api.setupTournament();
  for(const changes of [{eventId:'other'},{entryKey:'wrong'},{consent:'no'},{height:'-170'},{weight:'abc'},{age:'500'},{photoDataUrl:'data:image/jpeg;base64,YWJjZA=='},{website:'bot'},{requestId:'short'}]){
    assert.throws(()=>h.api.saveEntry_({...h.params(),...changes}));
  }
  assert.equal(h.rowCount('テスト申込'),0);assert.equal(h.photos().length,0);
});
test('同時受付でロックを取れないと保存せず、再開できる結果を返す',()=>{
  const h=harness();h.api.setupTournament();h.setBusy(true);
  assert.match(h.api.doPost({parameter:h.params()}).html,/同じ申込を確認・再開する/);assert.equal(h.rowCount('テスト申込'),0);
  h.setBusy(false);h.api.saveEntry_(h.params());assert.equal(h.rowCount('テスト申込'),1);
});
test('無料枠を浪費する大量申込を止め、拒否後に写真は増えない',()=>{
  const h=harness();h.api.setupTournament();
  for(let i=0;i<30;i++)h.api.saveEntry_(h.params());
  assert.throws(()=>h.api.saveEntry_(h.params()),/混み合/);assert.equal(h.photos().length,30);
});
test('受付結果は目に見えるHTMLで、反射入力やpostMessageに依存しない',()=>{
  const h=harness();h.api.setupTournament();const p=h.params();
  assert.match(h.api.doPost({parameter:p}).html,/<h1>申し込みが完了しました/);
  h.fail.set('flush',1);const error=h.api.doPost({parameter:{...h.params(),name:'"><script>alert(1)</script>'}});
  assert.ok(!error.html.includes('value=""><script>'));assert.ok(error.html.includes('&lt;script&gt;'));assert.doesNotMatch(error.html,/postMessage/);assert.match(error.html,/target="_top"/);
});
test('OS用ZIPは本番だけで連絡先を含まず、受付番号と写真ファイルが一致する',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());h.api.openEntries();const receipt=h.api.saveEntry_(h.params('live'));
  h.api.exportTournament();const zip=h.photos('live').find((file:any)=>file.name.endsWith('.zip'))!;
  const files=zip.data.files,csv=files[0].bytes.toString('utf8');
  assert.ok(!csv.includes('contact'));assert.ok(!csv.includes('test@example.com'));assert.ok(!csv.includes('09000000000'));assert.ok(!csv.includes('TEST-'));
  const imported=importFighters(csv);assert.equal(imported.blockedHeaders.length,0);assert.equal(imported.fighters.length,1);assert.equal(imported.fighters[0].id,receipt);
  assert.equal(files[1].name,'photos/'+receipt+'.jpg');assert.equal(imported.fighters[0].height,'170');assert.equal(imported.fighters[0].weight,'65');
});
test('テスト用ZIPは最後のテスト1件だけを書き出し、本番・原本・受付状態を変更しない',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());const receipt=h.api.saveEntry_({...h.params(),name:'最後の架空選手'});
  const beforeProps=[...h.props],beforeRows=JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows]));
  h.api.exportTestTournament();const zip=h.photos().find((file:any)=>file.name.startsWith('TEST_Tournament_OS_'))!;
  assert.ok(zip);assert.equal(h.photos('live').length,0);assert.deepEqual([...h.props],beforeProps);assert.equal(JSON.stringify([...h.book().sheets].map(([name,sheet]:any)=>[name,sheet.rows])),beforeRows);
  const files=zip.data.files,csv=files[0].bytes.toString('utf8'),imported=importFighters(csv);
  assert.equal(imported.fighters.length,1);assert.equal(imported.fighters[0].id,receipt);assert.equal(imported.fighters[0].name,'最後の架空選手');assert.equal(files[1].name,'photos/'+receipt+'.jpg');
  for(const text of ['test@example.com','09000000000','テスト担当','連絡先'])assert.ok(!csv.includes(text));
});
test('テスト用ZIPは未完了・古い版・公開共有の写真を出さない',()=>{
  const h=harness();h.api.setupTournament();assert.throws(()=>h.api.exportTestTournament(),/テスト/);
  h.api.saveEntry_(h.params());h.props.set('lastTestBuild','old');assert.throws(()=>h.api.exportTestTournament(),/テスト/);
  h.api.saveEntry_(h.params());h.photos().at(-1)!.sharing='ANYONE';assert.throws(()=>h.api.exportTestTournament(),/テスト/);
  assert.equal(h.photos().filter((file:any)=>file.name.endsWith('.zip')).length,0);
});
test('Google確認コードの保存・読み込みが、実際の公開用・テスト用リンクへ正しくつながる',async()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());h.api.openEntries();
  const proof=await verifyGoogleConnection(h.api.checkTournament(),setupKey,'test-cup',owner,policy);
  const base={endpoint:proof.endpoint,eventId:proof.eventId,title:'テスト大会',organizer:'主催者',date:'2099-12-20',venue:'テスト会場',venueUrl:'',deadline:'2099-11-30',contact:'公式連絡先',music:false,grade:'optional' as const,age:'optional' as const,comment:'optional' as const,protocol:'2'};
  for(const mode of ['test','live'] as const){
    const config={...base,entryKey:mode==='test'?proof.testKey:proof.entryKey,mode};
    assert.deepEqual(publicEntryConfig(publicEntryHash(config)),config);assert.equal(publicEntryReady(config),true);
  }
  assert.equal(publicEntryReady({...base,entryKey:'',mode:'live'}),false);
});
test('締切は実在日だけを受け付け、日本語の日付も同じ日として扱う',()=>{
  assert.equal(deadlineIso('2026年11月30日（月）'),'2026-11-30');assert.equal(deadlineIso('2026/11/30'),'2026-11-30');
  assert.equal(deadlineIso('2026-02-30'),'');assert.equal(deadlineIso('2026-13-01'),'');
});

test('Googleエディタだけ更新しても古いデプロイのテスト実績で受付開始できない',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_(h.params());
  h.props.set('lastTestBuild','old');assert.throws(()=>h.api.openEntries(),/テスト/);
  h.api.saveEntry_(h.params());vm.runInContext("SETTINGS.music=true;",h.api);
  assert.throws(()=>h.api.openEntries(),/テスト/);
});
test('数式に見える入力は原本からOS表へ再保存するときも数式にしない',()=>{
  const h=harness();h.api.setupTournament();h.api.saveEntry_({...h.params(),name:'=1+1',gym:'@test'});
  assert.equal(h.book().getSheetByName('テスト申込').rows[1][4],"'=1+1");
  assert.equal(h.book().getSheetByName('テストOS取込用').rows[1][2],"'=1+1");
  assert.equal(h.api.testComplete_(h.book()),true);
});
test('長すぎる入力を黙って切り捨てず、保存前に止める',()=>{
  const h=harness();h.api.setupTournament();
  for(const changes of [{name:'あ'.repeat(81)},{gym:'あ'.repeat(121)},{contactName:'あ'.repeat(101)}])assert.throws(()=>h.api.saveEntry_({...h.params(),...changes}));
  assert.equal(h.rowCount('テスト申込'),0);
});
test('入場曲と追加項目は大会の設定に従い、未入力・偽の曲URLを拒否する',()=>{
  const h=harness();h.api.setupTournament();
  vm.runInContext("SETTINGS.music=true;SETTINGS.grade='required';SETTINGS.age='required';SETTINGS.comment='required';",h.api);
  for(const changes of [{},{grade:'小5',age:'',comment:'全力',musicUrl:'https://youtu.be/test'},{grade:'小5',comment:'全力',musicUrl:'https://music.apple.com.evil.test/song/1'}])assert.throws(()=>h.api.saveEntry_({...h.params(),...changes}));
  h.api.saveEntry_({...h.params(),grade:'小5',comment:'全力',musicUrl:'https://music.apple.com/jp/song/1'});
  const row=h.book().getSheetByName('テスト申込').rows[1];assert.equal(row[5],'小5');assert.equal(row[11],'https://music.apple.com/jp/song/1');
  vm.runInContext("SETTINGS.music=false;SETTINGS.grade='off';SETTINGS.age='off';SETTINGS.comment='off';",h.api);
  h.api.saveEntry_({...h.params(),grade:'小5',comment:'全力',musicUrl:'https://music.apple.com/jp/song/1'});
  const off=h.book().getSheetByName('テスト申込').rows[2];for(const i of [5,6,10,11])assert.equal(off[i],'');
});
