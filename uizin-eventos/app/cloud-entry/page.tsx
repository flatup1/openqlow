'use client';
import { useEffect, useState } from 'react';
import EntryForm from '../components/EntryForm.tsx';
export default function CloudEntry() {
  const [code,setCode]=useState<string|null>(null);
  useEffect(()=>setCode(new URLSearchParams(location.search).get('code')||''),[]);
  if(code===null)return <main className="p-8">募集内容を確認しています…</main>;
  if(!/^[a-f0-9]{64}$/.test(code))return <main className="p-8">主催者から届いた募集リンクを開いてください。</main>;
  return <EntryForm onlineCode={code}/>;
}
