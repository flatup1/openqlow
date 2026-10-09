// Only local build artifacts; excludes the legacy Google/admin paths from the test site.
import { cp, mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const source=resolve('out');
// A fresh folder keeps previous preparations intact.
const name='out-test-'+Date.now();const target=resolve(name);
await access(resolve(source,'setup/index.html'));
await mkdir(target);
for(const path of ['_next','cloud-manage','setup','cloud-entry','cloud-view','_headers','404.html'])await cp(resolve(source,path),resolve(target,path),{recursive:true});
await mkdir(resolve(target,'private'));
for(const path of (await readdir(resolve(source,'private'))).filter(p=>/\.(?:html|txt)$/.test(p)).concat(['entry','live']))await cp(resolve(source,'private',path),resolve(target,'private',path),{recursive:true});
await writeFile(resolve(target,'index.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><title>Tournament OS テスト</title><h1>架空データ専用</h1><a href="/setup/">大会を作る</a></html>');
const config=JSON.parse(await readFile('wrangler.test.jsonc','utf8'));
config.pages_build_output_dir='./'+name;
await writeFile('wrangler.test-prepared.json',JSON.stringify(config,null,2)+'\n');
await writeFile(resolve(target,'TEST_ONLY.txt'),'架空データ専用。公開・認証設定・実データ移送は未実施。\n');
console.log(JSON.stringify({directory:target,config:'wrangler.test-prepared.json',excluded:['admin','apply','entry','private/google-setup','private/setup'],deployed:false}));
