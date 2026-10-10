'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { contractWeight, safeMusicUrl, type LocalFighter, type LocalTournament } from '../../../core/privateTournament.ts';
import { PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../../lib/privateStore.ts';
import ListView, { EmptyBouts } from './ListView.tsx';
import { Caution, ErrorLine, Hint, LockReason, NextSlot, OkLine, cx } from './liveMarks.tsx';
import { MUSIC_NEW_TAB, isRepeatPress, moveNotice, musicLabel, musicState, nextHint, parseViewParam, saveFailNotice, undoSecondsLeft, withViewParam, type LiveView, type MoveVia } from './listLogic.ts';

/*
  試合当日の画面。色と言葉の約束（黄=次はここ / 薄い黄=気をつけて / 赤=まちがい・失敗 / 緑=できた / 灰の点線=今は押せない）は app/globals.css の .tos-*。
  黄色の「次はここ」は、1つの状態に1つだけ:
    1試合ずつ = 「次の試合 →」（最後の試合では「一覧」、保存に失敗したら失敗したボタン） / 一覧 = ListView の中で決める / 空・読めない = 準備画面へ戻る
*/

/* 赤と青は、色だけでなく「言葉」と「形」でも分ける: 赤コーナー=▲ / 青コーナー=■ 。帯は 24px の太字 */
const SIDE = {
  red: { label: '赤コーナー', mark: '▲', border: 'border-rose-700', band: 'bg-rose-700' },
  blue: { label: '青コーナー', mark: '■', border: 'border-blue-700', band: 'bg-blue-700' },
} as const;

/** 高さが低い画面（スマホを横にした）でも、前・次のボタンは画面の下にくっつけたまま。説明の灰字だけを隠す。100dvh が使えない古い画面では 100vh */
const PAGE_CSS = '.live-page{min-height:100vh;min-height:100dvh}@media (min-width:1024px){.tos-next.live-next-row{display:flex;align-items:center;gap:12px}}@media (max-height:420px){.live-single-footer{position:sticky}.live-foot-hint{display:none}.live-page{padding-bottom:1rem}}';

type FighterProblem = 'missing' | 'same' | null;

function FighterCard({ side, fighter, musicEnabled, problem }: { side: 'red'|'blue'; fighter: LocalFighter | undefined; musicEnabled: boolean; problem: FighterProblem }) {
  const [playing, setPlaying] = useState(false);
  const musicUrl = musicEnabled ? safeMusicUrl(fighter?.musicUrl ?? '') : '';
  const music = musicState(fighter, musicEnabled);
  useEffect(()=>setPlaying(false),[fighter?.id]);
  const look = SIDE[side];
  const hasPhoto = !!fighter?.photoDataUrl;
  return <article className={'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border-4 bg-white text-[17px] ' + look.border}>
    <p className={'px-4 py-2 text-center text-2xl font-black text-white ' + look.band}><span aria-hidden="true">{look.mark} </span>{look.label}</p>
    <div className={'relative bg-slate-100 ' + (hasPhoto ? 'min-h-[160px] flex-1 md:min-h-[180px]' : 'h-[96px] shrink-0')}>
      {hasPhoto ? <img src={fighter?.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-slate-600">👤 写真なし</div>}
    </div>
    <div className="p-3">
      <h2 className="text-center text-[clamp(2.25rem,4.4vw,3.5rem)] font-black leading-tight [overflow-wrap:anywhere]">{fighter?.name || '選手未設定'}</h2>
      <p className="mt-1 text-center text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">{fighter?.gym}</p>
      {problem === 'missing' ? <ErrorLine className="mt-2">選手が選ばれていません。準備画面で選ぶ</ErrorLine> : null}
      {problem === 'same' ? <ErrorLine className="mt-2">まちがい：赤と青が同じ選手です。準備画面で直す</ErrorLine> : null}
      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3"><b>意気込み</b><p className="mt-1">{fighter?.comment || '未入力'}</p></div>
      {musicUrl ? <div className="mt-2">
        <a href={musicUrl} target="_blank" rel="noreferrer" onClick={()=>setPlaying(true)} className="live-list-focus flex min-h-[56px] flex-wrap items-center justify-center gap-x-2 rounded-xl border-4 border-slate-700 bg-white p-3 text-center text-xl font-black text-slate-950">{playing ? '▶ 曲の画面を開きました' : '▶ 入場曲を開く'}<span className="text-[17px] font-bold text-slate-700">{playing ? MUSIC_NEW_TAB : MUSIC_NEW_TAB + 'で曲の画面が開きます'}</span></a>
        {playing ? <Caution className="mt-2">別のタブで開きました。曲は自分で再生ボタンを押します。試合の画面にもどるには、タブを切りかえます。</Caution> : null}
      </div> :
        !musicEnabled ? <p className="mt-2 rounded-xl bg-slate-100 p-3 text-center font-bold text-slate-700">この大会は入場曲なし</p> :
        music === 'empty' ? null :
        <>
          <p className={'mt-2 rounded-xl border-4 p-3 text-center text-[18px] font-black leading-snug ' + (music === 'none' ? 'border-[#a16207] bg-[#fefce8] text-[#1c1917]' : 'border-[#b91c1c] bg-[#fef2f2] text-[#991b1b]')}>{musicLabel(music)}</p>
          {music === 'broken' ? <ErrorLine className="mt-2">曲のリンクが使えません。Apple Music か YouTube の https:// だけ使えます。準備画面で直す</ErrorLine> : null}
        </>}
    </div>
  </article>;
}

/** 保存に失敗した／別の画面とぶつかった。画面に出す赤い言葉は1つだけ（role="alert" は1つ） */
type Notice = { kind: 'save'; via: MoveVia | 'undo'; text: string; more: string; tip: string; index?: number } | { kind: 'conflict' };
/** 試合を動かした直後の案内（元にもどす／すすむ）。to = もどる先の試合、at = 動かしたあとの試合（0 始まり） */
type Undo = { to: number; at: number; via: MoveVia; since: number };

export default function PrivateLive() {
  const [data,setData]=useState<LocalTournament|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [readFailed,setReadFailed]=useState(false);
  const [slowLoad,setSlowLoad]=useState(false);
  const [notice,setNotice]=useState<Notice|null>(null);
  // 別の画面で「いまの試合」が変わったときの注意（「わかった」を押すまで残す）
  const [remote,setRemote]=useState(false);
  const [saving,setSaving]=useState(false);
  // 保存が長いとき: 0.3秒たったら「⏳ 保存しています…」(1)、3秒たったら「保存できていません」(2)
  const [savePhase,setSavePhase]=useState<0|1|2>(0);
  const [savingRow,setSavingRow]=useState<number|null>(null);
  const savingRef=useRef(false);
  const curRef=useRef<number|null>(null);
  // 同じ向きのボタンが続けて押されたとき（ダブルタップ）、2つ進まないように
  const lastPress=useRef<{dir:string;at:number}|null>(null);
  const [repeatNote,setRepeatNote]=useState(false);
  // 一覧が「次にやるのは、1試合ずつの画面へ行くこと」と言っているか（一覧の中で決まる。黄色は『1試合ずつ』のボタンに付く）
  const [listWantsSingle,setListWantsSingle]=useState(false);
  // 一覧の行から開いた直後: 2回目のクリックが新しい画面の「次の試合」などに当たらないよう、少しの間だけマウス・タッチを受けない
  const [settling,setSettling]=useState(false);
  const settleTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const openedFromList=useRef(false);
  const boutLabel=useRef<HTMLElement>(null);
  // 試合を動かしたあと、「もどす」（前の試合にもどる）ボタンを出す。10秒は大きい箱＋残り秒数、そのあとは小さい1行で、次に押すまで残す
  const [undo,setUndo]=useState<Undo|null>(null);
  const [clock,setClock]=useState(0);
  useEffect(()=>()=>{if(settleTimer.current)clearTimeout(settleTimer.current);},[]);
  useEffect(()=>{if(!undo)return;setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[undo]);
  useEffect(()=>{if(loaded)return;const timer=setTimeout(()=>setSlowLoad(true),3000);return()=>clearTimeout(timer);},[loaded]);
  useEffect(()=>{
    if(!saving){setSavePhase(0);return;}
    const first=setTimeout(()=>setSavePhase(1),300),second=setTimeout(()=>setSavePhase(2),3000);
    return()=>{clearTimeout(first);clearTimeout(second);};
  },[saving]);
  useEffect(()=>{if(!repeatNote)return;const timer=setTimeout(()=>setRepeatNote(false),3000);return()=>clearTimeout(timer);},[repeatNote]);
  // 見かた（1試合ずつ / 一覧）。URL の ?view=list に持たせるので、読み直しても、ブックマークしても残る
  const [view,setView]=useState<LiveView>(()=>typeof window==='undefined'?'single':parseViewParam(location.search));
  useEffect(()=>{const sync=()=>setView(parseViewParam(location.search));sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  const changeView=(next:LiveView)=>{setView(next);try{history.replaceState(history.state,'',location.pathname+withViewParam(location.search,next)+location.hash);}catch{/* URLを書けなくても画面は切りかわる */}};
  const eventId = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('event') || 'my-tournament';
  // fromWatch = 別の画面からの知らせ。いまの試合が、自分が知らない間に変わっていたら、注意を出す
  const load=(fromWatch=false)=>void readPrivateEvent(eventId).then((value)=>{
    if(fromWatch&&value&&curRef.current!==null&&value.currentBout!==curRef.current)setRemote(true);
    curRef.current=value?value.currentBout:null;
    setData(value);setReadFailed(false);setLoaded(true);
  }).catch(()=>{setReadFailed(true);setLoaded(true);});
  useEffect(()=>{ load(); return watchPrivateEvent(eventId,()=>load(true)); },[eventId]);
  const bout=data?.bouts[data.currentBout];
  // 行から開いたあと: 画面の一番上へ戻し、「第N試合」にフォーカスを置く（読み上げ・キーボードのため）
  useEffect(()=>{
    if(view!=='single'||!openedFromList.current||!bout)return;
    openedFromList.current=false;
    try{window.scrollTo({top:0,left:0,behavior:'instant'});}catch{window.scrollTo(0,0);}
    boutLabel.current?.focus({preventScroll:true});
  },[view,bout]);
  const byId=useMemo(()=>new Map(data?.fighters.map((f)=>[f.id,f])??[]),[data]);
  const back='/private/?event='+encodeURIComponent(eventId);
  const pageClass='live-page bg-slate-100 p-6 text-lg text-slate-950';
  const linkClass='live-list-focus inline-flex min-h-[48px] items-center rounded-xl bg-indigo-700 px-5 text-lg font-black text-white';
  const styleTag=<style>{PAGE_CSS}</style>;
  if(!loaded) return <main className={pageClass}>{styleTag}<div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    <p className="text-xl font-bold">このパソコンのデータを読んでいます…</p>
    {slowLoad
      ? <>
          <ErrorLine role="alert" className="mt-3">読めません。3秒たっても、画面が出ません</ErrorLine>
          <NextSlot active label="もう一度ひらく" className="mt-3"><button type="button" onClick={()=>location.reload()} className={linkClass}>もう一度ひらく</button></NextSlot>
        </>
      : <Caution title="そのまま待つ" className="mt-3">⏳ 画面が出るまで、3秒ほどかかります。</Caution>}
  </div></main>;
  if(!data)return <main className={pageClass}>{styleTag}<div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    {readFailed
      ? <>
          <ErrorLine role="alert">保存データを読めません（データは消えていません）</ErrorLine>
          <p className="mt-3 font-bold">① プライベートウィンドウでは使えません。ふつうのウィンドウで開く</p>
          <p className="mt-1 font-bold">② それでもだめなら、準備画面で「コピーのファイルから戻す」</p>
        </>
      : <>
          <ErrorLine role="alert">この大会は、このブラウザにありません</ErrorLine>
          <p className="mt-3">この大会は、別のパソコンかブラウザで作りましたか？ 作ったパソコンの、同じブラウザで開いてください。</p>
        </>}
    {readFailed
      ? <NextSlot active label="もう一度ひらく" className="mt-4"><button type="button" onClick={()=>location.reload()} className={linkClass}>もう一度ひらく</button></NextSlot>
      : null}
    {readFailed
      ? <p className="mt-4"><a href={back} className="live-list-focus inline-flex min-h-[48px] items-center rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800">準備画面へ戻る</a></p>
      : <NextSlot active label="準備画面へ戻る" className="mt-4"><a href={back} className={linkClass}>準備画面へ戻る</a></NextSlot>}
    <Hint className="mt-3">別のパソコンで使うときは、準備画面の「コピーのファイル」から戻します</Hint>
  </div></main>;
  const list=view==='list';
  const red=bout?byId.get(bout.redId):undefined, blue=bout?byId.get(bout.blueId):undefined;
  const musicEnabled=data.entryConfig?.music ?? true;
  const last=data.bouts.length-1;
  const isFirst=data.currentBout===0, isLast=data.currentBout>=last;
  // 保存できたら true。1試合ずつの画面と一覧の画面で、同じ保存・同じ守りを使う
  const jump=async(index:number,via:MoveVia|'undo'):Promise<boolean>=>{
    if(savingRef.current||index<0||index>=data.bouts.length)return false;
    savingRef.current=true;setSaving(true);const next={...data,currentBout:index};
    try{const saved=await writePrivateEvent(next);curRef.current=saved.currentBout;setData(saved);setNotice(null);setUndo(null);setRemote(false);return true;}
    catch(error){
      if(error instanceof PrivateSaveConflict){load();setNotice({kind:'conflict'});}
      else setNotice({kind:'save',via,index:via==='list'?index:undefined,...saveFailNotice(via,data.currentBout)});
      return false;
    }
    finally{savingRef.current=false;setSaving(false);}
  };
  // 「前の試合」「次の試合」。続けて同じボタンが押されたら、1回だけ動かす
  const step=(dir:'prev'|'next')=>{
    if(isRepeatPress(lastPress.current,dir,Date.now())){setRepeatNote(true);return;}
    const before=data.currentBout,to=dir==='next'?before+1:before-1;
    void (async()=>{
      if(!(await jump(to,dir)))return;
      lastPress.current={dir,at:Date.now()};setRepeatNote(false);
      setUndo({to:before,at:to,via:dir,since:Date.now()});
    })();
  };
  // 一覧の行を押す: 今の試合にして、1試合ずつの画面で開く。保存できなかったら一覧のまま（エラーを出す）
  const openFromList=(index:number)=>{
    if(savingRef.current)return;
    void (async()=>{
      const before=data.currentBout;
      if(index!==before){
        setSavingRow(index);
        const ok=await jump(index,'list');
        setSavingRow(null);
        if(!ok)return;
        setUndo({to:before,at:index,via:'list',since:Date.now()});
      }
      openedFromList.current=true;setSettling(true);
      if(settleTimer.current)clearTimeout(settleTimer.current);
      settleTimer.current=setTimeout(()=>setSettling(false),700);
      changeView('single');
    })();
  };
  // いま表示中のほうは、塗りつぶさない（薄い灰＋太い枠＋「✓ 表示中」）。塗りのボタンがあると、そちらが『押すところ』に見えてしまうため
  const pick=(mode:LiveView)=>'live-list-focus live-list-noprint touch-manipulation min-h-[64px] w-full rounded-xl px-3 text-xl font-black sm:px-8 '+(view===mode?'border-4 border-slate-900 bg-slate-200 text-slate-950':'border-2 border-slate-700 bg-white text-slate-900');
  // 黄色は1つ: 最後の試合では「次の試合 →」が押せないので、黄色は「一覧」ボタンへ移る。一覧で「いまの試合」が見えているときは、「1試合ずつ」ボタンへ。保存に失敗したときは、失敗したボタンに「もう一度押す」
  const retryDir=notice?.kind==='save'&&(notice.via==='next'||notice.via==='prev')?notice.via:null;
  const yellowList=!list&&!!bout&&!retryDir&&isLast;
  const yellowSingle=list&&listWantsSingle;
  const yellowSlot:'prev'|'next'|null=!bout?null:retryDir??(isLast?null:'next');
  const prepLink=(extra:string)=><div className={cx('live-list-noprint flex flex-wrap items-center gap-x-3 gap-y-1',extra)}><Hint>直しても、いまの試合は変わりません</Hint><a href={back} className="live-list-focus inline-flex min-h-[48px] items-center rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800">準備画面へ戻る（選手や試合をなおす）</a></div>;
  // 「準備画面へ戻る」は、前・次のボタンから遠い所に置く: 広い画面では上の「表示のしかた」の右、スマホでは一番下
  const viewBtn=(mode:LiveView,text:string,yellow:boolean,label:string)=><NextSlot active={yellow} label={label} className={cx('live-list-noprint min-w-0',yellow?'basis-full sm:basis-auto':'flex-1 sm:flex-none')}><button type="button" aria-pressed={view===mode} onClick={()=>changeView(mode)} className={pick(mode)}><span className="block leading-tight">{text}</span>{view===mode?<span aria-hidden="true" className="block text-[17px] font-bold leading-tight">✓ 表示中</span>:null}</button></NextSlot>;
  const switcher=<div className="live-list-noprint mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"><div role="group" aria-label="表示のしかた" className="live-list-noprint flex flex-wrap items-center gap-3"><span className="w-full text-lg font-black sm:w-auto">表示のしかた</span><div className="flex w-full flex-wrap gap-3 sm:w-auto sm:flex-nowrap">{viewBtn('single','1試合ずつ',yellowSingle,'試合を進めるときは「1試合ずつ」を押す')}{viewBtn('list','一覧',yellowList,'「一覧」を押して、全部の試合を見る')}</div></div>{!list&&bout?prepLink('ml-auto hidden md:flex'):null}</div>;
  const footBtn='live-list-focus touch-manipulation select-none min-h-[64px] w-full rounded-2xl text-xl font-black sm:min-h-[76px] ';
  const saveFailed=notice?.kind==='save';
  const noticeBox=notice?<div role="alert" className={cx('live-list-noprint tos-error text-[17px]',list&&'fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl shadow-xl',!list&&'mb-2')}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">
        <p className="m-0"><span aria-hidden="true">✕ </span>{notice.kind==='save'?notice.text:'実行していません：別の画面で変わっていたので、最新の内容に読み直しました。'}</p>
        <p className="m-0 mt-1">{notice.kind==='save'?notice.more:'いまの試合は 第'+(data.currentBout+1)+'試合 です。やりたいなら、もう一度押す。'}</p>
        {notice.kind==='save'?<p className="m-0 mt-1 font-bold">{notice.tip}</p>:null}
      </div>
      <button type="button" onClick={()=>setNotice(null)} className="live-list-focus touch-manipulation min-h-[48px] shrink-0 self-start rounded-xl border-2 border-[#991b1b] bg-white px-4 text-[17px] font-black text-slate-950">わかった（閉じる）</button>
    </div>
  </div>:null;
  const remoteBox=remote?<Caution className="live-list-noprint mt-3">別の画面で変わりました。いまは第{data.currentBout+1}試合です。合っていれば何もしません。
    <div className="mt-2"><button type="button" onClick={()=>setRemote(false)} className="tos-safe-btn live-list-focus touch-manipulation">わかった</button></div></Caution>:null;
  // 試合を動かした直後の案内。動かした先の試合が、まだ今の試合のときだけ出す（別の画面でまた変わったら、古い「もどす」は出さない）
  const undoShown=!list&&!!bout&&!!undo&&data.currentBout===undo.at;
  const moved=undoShown&&undo?moveNotice(undo.via,undo.to,undo.at):null;
  const left=undoShown&&undo?undoSecondsLeft(undo.since,clock):0;
  const undoBox=undoShown&&undo&&moved?(left>0
    ? <Caution role="status" className="live-list-noprint mb-2">
        {moved.text}
        {undo.via==='list'?<span className="font-black">（あと{left}秒）</span>:null}
        <div className="mt-2"><button type="button" disabled={saving} onClick={()=>void jump(undo.to,'undo')} className={cx('tos-safe-btn live-list-focus touch-manipulation w-full sm:w-auto',saving&&'tos-locked')}>{moved.undoLabel}</button></div>
      </Caution>
    : <div className="live-list-noprint mb-2 flex flex-wrap items-center gap-2"><span className="text-[17px] font-bold text-slate-700">まちがえたとき：</span>
        <button type="button" disabled={saving} onClick={()=>void jump(undo.to,'undo')} className="live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800 underline">{moved.undoLabel}</button></div>):null;
  const savingLine=savePhase===1?<p className="live-list-noprint m-0 mb-2 text-[17px] font-bold text-slate-800">⏳ 保存しています…</p>
    :savePhase===2?<ErrorLine className="live-list-noprint mb-2">保存できていません。試合は進んでいません</ErrorLine>:null;
  const savedBadge=<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
    {saveFailed
      ? <span className="rounded-full border-2 border-[#b91c1c] bg-[#fef2f2] px-3 py-1 text-[17px] font-black text-[#991b1b]"><span aria-hidden="true">✕ </span>保存できていません</span>
      : <span className="rounded-full border-2 border-[#166534] bg-[#f0fdf4] px-3 py-1 text-[17px] font-black text-[#166534]"><span aria-hidden="true">✓ </span>保存済み（このパソコンの中）</span>}
    {saveFailed?null:<span className="text-[17px] font-bold text-slate-700">押すたびに保存されます。閉じても大丈夫</span>}
  </span>;
  const contract=bout?contractWeight(red,blue):'';
  const contractText=bout?(contract||bout.className||'契約未入力'):'';
  const sameFighter=!!bout&&!!bout.redId&&bout.redId===bout.blueId;
  const problemOf=(fighter:LocalFighter|undefined):FighterProblem=>!fighter?'missing':sameFighter?'same':null;
  return <main className={'live-page flex flex-col bg-slate-100 p-3 text-slate-950'+(settling?' pointer-events-none':'')}>{styleTag}<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-white px-5 py-3 shadow-sm"><h1 className="text-xl font-black [overflow-wrap:anywhere]">{data.title}</h1><b ref={boutLabel} tabIndex={-1} className="live-list-focus flex flex-wrap items-baseline gap-x-3 rounded-lg px-1">{bout?<><span className="text-[40px] font-black leading-tight">{'第'+(data.currentBout+1)+'試合'}</span><span className="text-xl font-bold text-slate-700">{'全'+data.bouts.length+'試合'}</span></>:<span className="text-xl">全0試合</span>}</b>{savedBadge}</header>{switcher}{list?<>{noticeBox}{remoteBox}</>:null}{list?<ListView data={data} eventId={eventId} saving={saving} onOpen={openFromList} onWantSingle={setListWantsSingle} pressedIndex={savingRow} retryIndex={notice?.kind==='save'&&notice.via==='list'&&notice.index!==undefined?notice.index:null}/>:bout?<><section className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_minmax(0,1fr)]"><FighterCard side="red" fighter={red} musicEnabled={musicEnabled} problem={problemOf(red)}/><div className="grid min-w-0 place-items-center rounded-2xl bg-white p-3 text-center"><div className="min-w-0 max-w-full"><p className="text-2xl font-black leading-none text-slate-600">VS</p><p className="mt-3 text-[clamp(1.75rem,3.5vw,2.75rem)] font-black leading-tight [overflow-wrap:anywhere]">{contractText}</p>{contract?<p className="mt-1 text-[17px] font-bold text-slate-700">（決めた体重）</p>:!bout.className?<ErrorLine className="mt-2 text-left">体重が入っていません（準備画面で入れる）</ErrorLine>:null}<p className="mt-2 text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">{bout.rule}</p></div></div><FighterCard side="blue" fighter={blue} musicEnabled={musicEnabled} problem={problemOf(blue)}/></section><footer className="live-single-footer mt-3 rounded-2xl bg-white p-2 shadow-[0_-4px_12px_rgba(15,23,42,0.18)]">{noticeBox}{remoteBox}{undoBox}{savingLine}{repeatNote?<p className="live-list-noprint m-0 mb-2 text-[17px] font-bold text-slate-800">いま進んだところです（続けて押したぶんは、無視しました）</p>:null}{isLast&&last>0?<OkLine className="mb-2">全部おわりました。最後の試合です（これで全部終わりです）</OkLine>:null}<div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-3"><NextSlot active={yellowSlot==='prev'} label="もう一度押す" row><button aria-label="← 前の試合" disabled={saving||isFirst} onClick={()=>step('prev')} className={footBtn+'border-4 border-slate-800 bg-white text-slate-950 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700'+(isFirst?' tos-locked':'')}><span className="block">← 前の試合</span>{isFirst?null:<span className="live-foot-hint block text-[17px] font-bold leading-tight text-slate-700">{'前は 第'+data.currentBout+'試合'}</span>}</button>{isFirst?<LockReason className="mt-1">最初の試合です（前はありません）</LockReason>:null}</NextSlot><NextSlot active={yellowSlot==='next'} label={retryDir==='next'?'もう一度押す':'この試合が終わったら押す'} row><button aria-label="次の試合 →" disabled={saving||isLast} onClick={()=>step('next')} className={footBtn+'border-4 border-indigo-900 bg-indigo-700 text-white disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700'+(isLast?' tos-locked':'')}><span className="block">次の試合 →</span>{isLast?null:<span className="live-foot-hint block text-[17px] font-bold leading-tight text-indigo-100">{nextHint(data.currentBout,data.bouts.length)}</span>}</button>{isLast?<LockReason className="mt-1">ここが最後なので押せません</LockReason>:null}</NextSlot></div>{last===0?<Hint className="mt-1 text-center">この大会は1試合だけです</Hint>:null}</footer>{prepLink('mt-6 md:hidden')}</>:<EmptyBouts eventId={eventId}/>}</main>;
}
