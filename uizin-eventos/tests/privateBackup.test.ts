import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, preparePrivateEventSave, PrivateSaveConflict } from '../app/lib/privateStore.ts';
import { emptyTournament } from '../core/privateTournament.ts';

test('暗号化バックアップから名簿・写真・試合位置・募集項目を完全に復元する',async()=>{
  const original={...emptyTournament('backup-test'),entryConfig:{music:true,grade:'required' as const,age:'optional' as const,comment:'off' as const},fighters:[{id:'F1',gym:'架空ジム',name:'架空選手',grade:'小5',age:'11',height:'140',weight:'35',record:'初試合',comment:'',musicUrl:'',photoDataUrl:'data:image/jpeg;base64,/9j/2Q=='}]};
  const encoded=await encryptBackup(original,'Test-only-password-2026');
  assert.ok(!encoded.includes('架空選手'));assert.ok(!encoded.includes('photoDataUrl'));
  assert.deepEqual(await decryptBackup(encoded,'Test-only-password-2026'),original);
  const snapshot=JSON.stringify(original);
  await assert.rejects(decryptBackup(encoded,'different-password'));
  const corrupted=JSON.parse(encoded);corrupted.data=(corrupted.data[0]==='A'?'B':'A')+corrupted.data.slice(1);
  await assert.rejects(decryptBackup(JSON.stringify(corrupted),'Test-only-password-2026'));
  assert.equal(JSON.stringify(original),snapshot);
});

test('別画面の古い保存を拒否し、時計が戻っても保存番号を進める',()=>{
  const original={...emptyTournament('concurrent-test'),updatedAt:100};
  const first=preparePrivateEventSave({...original,title:'先に保存した画面'},original,90);
  assert.equal(first.updatedAt,101);
  assert.throws(()=>preparePrivateEventSave({...original,title:'古い画面'},first,110),PrivateSaveConflict);
  assert.equal(first.title,'先に保存した画面');
  const again=preparePrivateEventSave({...first,venue:'新しい入力'},first,90);
  assert.equal(again.updatedAt,102);
  assert.equal(original.updatedAt,100);
  assert.throws(()=>preparePrivateEventSave(original,{...original,eventId:'other'}),PrivateSaveConflict);
  assert.throws(()=>preparePrivateEventSave(original,{broken:true}),/元のデータは変えていません/);
});

test('確認後のバックアップ復元は今の保存番号を使い、別画面の更新時は止める',()=>{
  const current={...emptyTournament('restore-test'),updatedAt:200,title:'現在'};
  const backup={...current,updatedAt:100,title:'復元した内容'};
  assert.throws(()=>preparePrivateEventSave(backup,current),PrivateSaveConflict);
  const restored=preparePrivateEventSave({...backup,updatedAt:current.updatedAt},current,190);
  assert.equal(restored.title,'復元した内容');assert.equal(restored.updatedAt,201);
  assert.throws(()=>preparePrivateEventSave({...backup,updatedAt:current.updatedAt},{...current,updatedAt:201}),PrivateSaveConflict);
});
test('短いパスワード・別形式・不正な名簿・重複管理番号の復元を拒否する',async()=>{
  const data=emptyTournament('backup-test');
  await assert.rejects(encryptBackup(data,'short'),/10文字/);
  await assert.rejects(decryptBackup('{}','Test-only-password-2026'),/バックアップ/);
  const malformed={...data,currentBout:50};
  const encrypted=await encryptBackup(malformed,'Test-only-password-2026');
  await assert.rejects(decryptBackup(encrypted,'Test-only-password-2026'),/中身/);
  const duplicate={...data,bouts:[{id:'B1',redId:'',blueId:'',className:'',rule:''},{id:'B1',redId:'',blueId:'',className:'',rule:''}]};
  await assert.rejects(decryptBackup(await encryptBackup(duplicate,'Test-only-password-2026'),'Test-only-password-2026'),/中身/);
});
