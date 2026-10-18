'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { boutClassWarning } from '../../../core/classRules.ts';
import { contractWeight, safeMusicUrl, type LocalFighter, type LocalTournament } from '../../../core/privateTournament.ts';
import { PrivateSaveConflict, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../../lib/privateStore.ts';
import ListView, { EmptyBouts } from './ListView.tsx';
import { Caution, ErrorLine, Hint, NextSlot, WithBreaks, cx } from './liveMarks.tsx';
import { MUSIC_NEW_TAB, NO_TITLE, OFFLINE_NOTE, PREP_LINK_NOTE, REOPEN_NOTE, displayName, isHeldKeyRepeat, isRepeatPress, isSamePerson, liveMusicOn, moveNotice, musicLabel, musicState, nextHint, parseViewParam, saveFailNotice, undoSecondsLeft, withViewParam, type LiveView, type MoveVia } from './listLogic.ts';

/*
  試合当日の画面。色と言葉の約束（黄=次はここ / 薄い黄=気をつけて / 赤=まちがい・失敗 / 緑=できた / 灰の点線=今は押せない）は app/globals.css の .tos-*。
  黄色の「次はここ」は、1つの状態に1つだけ:
    1試合ずつ = 「次の試合 →」（最後の試合では、押すものがないので黄色なし。保存に失敗したら失敗したボタン） / 一覧 = ListView の中で決める（最後の試合では黄色なし） / 空・読めない = 準備画面へ戻る
*/

/* 赤と青は、色だけでなく「言葉」と「形」でも分ける: 赤コーナー=▲ / 青コーナー=■ 。帯は 24px の太字 */
const SIDE = {
  red: { label: '赤コーナー', mark: '▲', border: 'border-rose-700', band: 'bg-rose-700' },
  blue: { label: '青コーナー', mark: '■', border: 'border-blue-700', band: 'bg-blue-700' },
} as const;

type FighterProblem = 'missing' | 'same' | null;

function FighterCard({ side, fighter, musicEnabled, problem }: { side: 'red'|'blue'; fighter: LocalFighter | undefined; musicEnabled: boolean; problem: FighterProblem }) {
  const [playing, setPlaying] = useState(false);
  const musicUrl = musicEnabled ? safeMusicUrl(fighter?.musicUrl ?? '') : '';
  const music = musicState(fighter, musicEnabled);
  useEffect(()=>setPlaying(false),[fighter?.id]);
  const look = SIDE[side];
  const hasPhoto = !!fighter?.photoDataUrl;
  const className = fighter?.fighterClass?.trim() ?? '';
  const noName = !!fighter && !fighter.name.trim();
  return <article className={'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border-4 bg-white text-[17px] min-[1600px]:text-[22px] ' + look.border}>
    {/* クラスは、色のついた帯の中に書く。上にあるので、前・次の帯や写真の下に隠れない */}
    <p className={'live-band live-corner-band flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1 text-center text-2xl font-black text-white min-[1600px]:text-[32px] ' + look.band}><span><span aria-hidden="true">{look.mark} </span>{look.label}</span>{className ? <span className="inline-block min-w-0 max-w-full rounded-full border-[3px] border-slate-800 bg-white px-4 text-2xl font-black leading-tight text-slate-950 min-[1600px]:text-[32px] [overflow-wrap:anywhere]">{className}</span> : null}</p>
    {/* 写真の高さは、画面の高さに合わせて決める（高い画面では大きく、低い画面では名前の場所をあける）。写真がある人もない人も同じ高さ（2人の名前が、同じ高さにならぶ） */}
    <div className="live-photo relative h-[clamp(72px,calc(100vh-760px),420px)] shrink-0 bg-slate-100">
      {hasPhoto ? <img src={fighter?.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-slate-600">👤 写真なし</div>}
    </div>
    <div className="p-3">
      <h2 className="text-center text-[clamp(2.25rem,4.4vw,3.5rem)] font-black leading-tight [overflow-wrap:anywhere] min-[1600px]:text-[clamp(3.5rem,3.6vw,5rem)]">{displayName(fighter)}</h2>
      <p className="mt-1 text-center text-xl font-bold text-slate-700 [overflow-wrap:anywhere] min-[1600px]:text-[28px]">{fighter?.gym}</p>
      {noName ? <ErrorLine className="mt-2">名前が入っていません。準備画面で入れてください</ErrorLine> : null}
      {problem === 'missing' ? <ErrorLine className="mt-2">選手が選ばれていません。準備画面で選んでください</ErrorLine> : null}
      {problem === 'same' ? <ErrorLine className="mt-2">まちがい：赤と青が同じ選手です。準備画面で直してください</ErrorLine> : null}
      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3"><b>意気込み</b><p className="mt-1 [overflow-wrap:anywhere]">{fighter?.comment || '未入力'}</p></div>
      {musicUrl ? <div className="mt-2">
        <a href={musicUrl} target="_blank" rel="noreferrer" onClick={()=>setPlaying(true)} className="live-list-focus flex min-h-[56px] flex-wrap items-center justify-center gap-x-2 rounded-xl border-4 border-slate-700 bg-white p-3 text-center text-xl font-black text-slate-950 min-[1600px]:text-[26px]">{playing ? '▶ 曲の画面を開きました' : '▶ 入場曲を開く'}<span className="text-[17px] font-bold text-slate-700 min-[1600px]:text-[22px]">{playing ? MUSIC_NEW_TAB : MUSIC_NEW_TAB + 'で曲の画面が開きます'}</span></a>
        {playing ? <Caution className="mt-2">別のタブで開きました。曲は自分で再生ボタンを押します。試合の画面にもどるには、タブを切りかえます。</Caution> : null}
      </div> :
        !musicEnabled ? <p className="mt-2 rounded-xl bg-slate-100 p-3 text-center font-bold text-slate-700">この大会は入場曲なし</p> :
        music === 'empty' ? null :
        <>
          <p className={'mt-2 rounded-xl border-4 p-3 text-center text-[18px] font-black leading-snug min-[1600px]:text-[24px] ' + (music === 'none' ? 'border-[#a16207] bg-[#fefce8] text-[#1c1917]' : 'border-[#b91c1c] bg-[#fef2f2] text-[#991b1b]')}>{musicLabel(music)}</p>
          {music === 'broken' ? <ErrorLine className="mt-2">曲のリンクが使えません。Apple Music か YouTube の https:// だけ使えます。準備画面で直してください</ErrorLine> : null}
        </>}
    </div>
  </article>;
}

/** 保存に失敗した／別の画面とぶつかった。画面に出す赤い言葉は1つだけ（role="alert" は1つ） */
type Notice = { kind: 'save'; via: MoveVia | 'undo'; text: string; more: string; tip: string; index?: number } | { kind: 'conflict' };
/** 試合を動かした直後の案内（元にもどす／すすむ）。to = もどる先の試合、at = 動かしたあとの試合（0 始まり） */
type Undo = { to: number; at: number; via: MoveVia; since: number };

/** 前・次のボタンの帯が、画面の何割をこえたら「くっつけない」か。準備画面の上下の帯（app/private/page.tsx の measureChrome）も同じ割合 */
const FOOT_FLOW_SHARE = 0.4;
/** 「もどす」の大きい箱が小さい1行に変わっても、その場所の高さを残す上限（px）。名前の場所が動かないように。もっと高いときは、動くより場所を取りすぎるほうが悪いので、ここまで */
const UNDO_MIN_CAP = 72;

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
  // 前・次のボタンの帯。背が画面の40%をこえる（小さい画面・大きい文字・拡大・失敗の知らせ）ときは、くっつけない（.live-footer-flow）
  const footerRef=useRef<HTMLElement>(null);
  // 「もどす」を押すと、その案内（と、押したボタン）が消える。キーボードの位置が消えないよう、次は「次の試合 →」へ移す
  const nextBtnRef=useRef<HTMLButtonElement>(null);
  const [footFlow,setFootFlow]=useState(false);
  // 試合を動かしたあと、「もどす」（前の試合にもどる）ボタンを出す。10秒は大きい箱＋残り秒数、そのあとは小さい1行で、次に押すまで残す
  const [undo,setUndo]=useState<Undo|null>(null);
  const [clock,setClock]=useState(0);
  // 画面が動き出したか（JavaScript が動かないブラウザでは false のまま。「3秒ほどかかります」は、動き出してから出す）
  const [mounted,setMounted]=useState(false);
  // ネットがつながっているか。閉じたあとに開き直すにはネットが要るので、切れているときだけ黄色で知らせる
  const [online,setOnline]=useState(true);
  // 一覧で失敗したときの赤い知らせ（画面の下に固定）。この箱の高さぶん、下に余白を足し、失敗した行を箱の上まで動かす
  const toastRef=useRef<HTMLDivElement>(null);
  const [toastH,setToastH]=useState(0);
  // 「もどす」の箱の高さ（大きい箱の高さを覚えて、10秒あとの小さい1行も同じ高さにする。名前の場所が動かない）
  const undoBigRef=useRef<HTMLDivElement>(null);
  const undoBigH=useRef(0);
  useEffect(()=>{const el=undoBigRef.current;if(el)undoBigH.current=Math.ceil(el.getBoundingClientRect().height);});
  useEffect(()=>{
    setMounted(true);
    const sync=()=>setOnline(typeof navigator==='undefined'||navigator.onLine!==false);
    sync();
    window.addEventListener('online',sync);window.addEventListener('offline',sync);
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};
  },[]);
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
  const footerOn=view==='single'&&!!data&&data.bouts.length>1&&!!data.bouts[data.currentBout];
  useEffect(()=>{
    const el=footerRef.current;
    if(!footerOn||!el){setFootFlow(false);return;}
    const root=document.documentElement;
    const measure=()=>{
      const height=Math.ceil(el.getBoundingClientRect().height);
      const flow=height>window.innerHeight*FOOT_FLOW_SHARE;
      setFootFlow(flow);
      // くっつく帯の高さぶん、キーボードで来た所（入場曲のリンクなど）を上へ動かす。css の html:has(.live-single-footer) と同じ値を、ここからも直接入れる（:has が使えない Safari 15.0〜15.3 でも、帯の下に隠れない）
      root.style.setProperty('--live-foot-h',(flow?0:height)+'px');
      root.style.scrollPaddingBottom=(flow?16:height+12)+'px';
    };
    measure();
    window.addEventListener('resize',measure);
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(el);
    return()=>{window.removeEventListener('resize',measure);observer?.disconnect();root.style.removeProperty('--live-foot-h');root.style.removeProperty('scroll-padding-bottom');};
  },[footerOn]);
  // 失敗の知らせが出たら、帯がくっついていなくても見える所まで動かす（赤い言葉と、黄色の「もう一度押す」を見のがさない）
  useEffect(()=>{if(notice&&footerOn)footerRef.current?.scrollIntoView({block:'nearest'});},[notice,footerOn,footFlow]);
  // 一覧で保存に失敗したとき: 赤い知らせの箱は画面の下に固定される。その下に「もう一度押す」が隠れないよう、
  // 箱の高さぶん下に余白を足し（scroll-padding と ページの下の余白）、失敗した行を、箱の上に見える所まで動かす
  const listToast=view==='list'&&!!notice;
  const failedRow=notice?.kind==='save'&&notice.via==='list'&&notice.index!==undefined?notice.index:null;
  useEffect(()=>{
    const root=document.documentElement;
    const box=toastRef.current;
    if(!listToast||!box){setToastH(0);return;}
    const apply=()=>{const h=Math.ceil(box.getBoundingClientRect().height)+24;setToastH(h);root.style.scrollPaddingBottom=h+'px';};
    apply();
    const row=failedRow===null?null:document.getElementById('live-list-row-'+failedRow);
    const target=row?(row.querySelector<HTMLElement>('[data-tos-next]')??row):null;
    target?.scrollIntoView({block:'nearest'});
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(apply);
    observer?.observe(box);
    return()=>{observer?.disconnect();root.style.removeProperty('scroll-padding-bottom');setToastH(0);};
  },[listToast,failedRow,notice]);
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
  // data-tos-loading = 画面を動かす部品（JavaScript）が動かないとき、layout.tsx の見張りが10秒後に「ブラウザが古いかもしれません」と赤でなく黄色で知らせる目印
  if(!loaded) return <main data-tos-loading="1" className={pageClass}><div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    <h1 className="text-xl font-bold">このパソコンのデータを読んでいます…</h1>
    {slowLoad
      ? <>
          <ErrorLine role="alert" className="mt-3">読めません。3秒たっても、画面が出ません</ErrorLine>
          <NextSlot active label="もう一度ひらく" className="mt-3"><button type="button" onClick={()=>location.reload()} className={linkClass}>もう一度ひらく</button></NextSlot>
        </>
      : mounted ? <Caution title="そのまま待つ" className="mt-3">⏳ 画面が出るまで、3秒ほどかかります。</Caution> : null}
  </div></main>;
  if(!data)return <main className={pageClass}><div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
    <h1 className="mb-3 text-xl font-black">試合当日の画面</h1>
    {readFailed
      ? <>
          <ErrorLine role="alert">保存データを読めません（データは消えていません）</ErrorLine>
          <p className="mt-3 font-bold">① プライベートウィンドウでは使えません。ふつうのウィンドウで開き直してください</p>
          <p className="mt-1 font-bold">② それでもだめなときは、下の「準備画面へ戻る」を押します。準備画面で「コピーのファイルから戻す」を使います</p>
        </>
      : <>
          <ErrorLine role="alert">この大会は、このブラウザにありません</ErrorLine>
          <p className="mt-3">この大会は、別のパソコンかブラウザで作りましたか？ 作ったパソコンの、同じブラウザで開いてください。</p>
        </>}
    {/* 黄色は「準備画面へ戻る」。「もう一度ひらく」を黄色にすると、①（ふつうのウィンドウで開く）と食いちがう（読み直しても、プライベートウィンドウのままでは同じ） */}
    <NextSlot active label={readFailed?'①をしてもだめなとき：準備画面へ':'準備画面へ戻る'} className="mt-4"><a href={back} className={linkClass}>準備画面へ戻る</a></NextSlot>
    {readFailed
      ? <div className="mt-4"><button type="button" onClick={()=>location.reload()} className="live-list-focus inline-flex min-h-[48px] items-center rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800">もう一度ひらく</button><Hint className="mt-1">ふつうのウィンドウで開いても読めないとき、もう一度ためします</Hint></div>
      : null}
    <Hint className="mt-3">別のパソコンで使うときは、準備画面の「コピーのファイル」から戻します</Hint>
  </div></main>;
  const list=view==='list';
  const red=bout?byId.get(bout.redId):undefined, blue=bout?byId.get(bout.blueId):undefined;
  const musicEnabled=liveMusicOn(data);
  // 赤と青のクラスがちがう（どちらも入っていて、ちがう）とき。知らせるだけで、試合を進めるのは止めない
  const classMix=!!bout&&boutClassWarning(red,blue)!=='';
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
  const pick=(mode:LiveView)=>'live-list-focus live-list-noprint touch-manipulation min-h-[56px] w-full whitespace-nowrap rounded-xl px-3 text-xl font-black sm:px-8 '+(view===mode?'border-4 border-slate-900 bg-slate-200 text-slate-950':'border-2 border-slate-700 bg-white text-slate-900');
  // 黄色は、多くて1つ: ふだんは「次の試合 →」。一覧で「いまの試合」が見えているときは、「1試合ずつ」ボタンへ。保存に失敗したときは、失敗したボタンに「もう一度押す」。
  // 最後の試合と、1試合だけの大会は、押すものがないので黄色なし（前は最後の試合で「一覧」に黄色を付けたが、一覧が「1試合ずつ」を指し返して、行ったり来たりになり、黄色が入る分、名前の場所も動いた）
  const retryDir=notice?.kind==='save'&&(notice.via==='next'||notice.via==='prev')?notice.via:null;
  const oneBout=data.bouts.length===1;
  const yellowSingle=list&&listWantsSingle;
  const yellowSlot:'prev'|'next'|null=!bout?null:retryDir??(isLast?null:'next');
  // このリンクは、同じタブで開く（新しいタブは開かない）。この画面が準備画面に変わる。もとの準備画面が開いたままなら、データがぶつからないよう、先のほうを閉じてもらう
  const prepLink=(extra:string)=><div className={cx('live-list-noprint flex flex-wrap items-center gap-x-3 gap-y-1',extra)}><Hint>直しても、いまの試合は変わりません</Hint><a href={back} className="live-list-focus inline-flex min-h-[48px] items-center rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800">準備画面へ戻る（選手や試合をなおす）</a><Hint>{PREP_LINK_NOTE}</Hint><Hint className="basis-full">{REOPEN_NOTE}</Hint></div>;
  // 「準備画面へ戻る」は、前・次のボタンから遠い所（いちばん下）に置く。上の「表示のしかた」の行は、1行にしておく
  const viewBtn=(mode:LiveView,text:string,yellow:boolean,label:string)=><NextSlot active={yellow} label={label} row className={cx('live-list-noprint min-w-0',yellow?'basis-full sm:basis-auto lg:w-[34rem] lg:max-w-full':'flex-1 max-[359px]:basis-full sm:flex-none')}><button type="button" aria-pressed={view===mode} onClick={()=>changeView(mode)} className={pick(mode)}><span className="block leading-tight">{text}</span>{view===mode?<span aria-hidden="true" className="block text-[17px] font-bold leading-tight">✓ 表示中</span>:null}</button></NextSlot>;
  const switcher=<div className="live-list-noprint mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-sm"><div role="group" aria-label="表示のしかた" className="live-list-noprint flex min-w-0 max-w-full flex-wrap items-center gap-3"><span className="live-switch-label w-full text-lg font-black sm:w-auto">表示のしかた</span><div className="flex w-full min-w-0 max-w-full flex-wrap gap-3 sm:w-auto">{viewBtn('single','1試合ずつ',yellowSingle,'試合を進めるときは「1試合ずつ」を押す')}{viewBtn('list','一覧',false,'')}</div></div></div>;
  // 前・次のボタン。保存しているあいだも disabled にしない（disabled にするとキーボードの位置が消える）。aria-disabled にして、押しても何も起きないようにする
  const footBtn='live-list-focus touch-manipulation select-none min-h-[64px] w-full rounded-2xl text-xl font-black sm:min-h-[76px] ';
  const saveFailed=notice?.kind==='save';
  // 失敗の知らせ。赤い1行（何が起きたか）が先。くわしい説明と「わかった（閉じる）」は、「くわしく見る」の中。小さい画面では、2行目も消す（黄色の「もう一度押す」が、すぐ下にある）
  const noticeBox=notice?<div ref={list?toastRef:undefined} role="alert" className={cx('live-list-noprint tos-error text-[17px]',list&&'fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl shadow-xl',!list&&'mb-2')}>
    <div className="min-w-0 leading-snug [overflow-wrap:anywhere]">
      <p className="m-0"><span aria-hidden="true">✕ </span>{notice.kind==='save'?notice.text:'実行していません：別の画面で変わっていたので、最新の内容に読み直しました。'}</p>
      <p className={cx('m-0 mt-1',!list&&notice.kind==='save'&&'live-fail-more')}>{notice.kind==='save'?notice.more:'いまの試合は 第'+(data.currentBout+1)+'試合です。やりたいときは、もう一度押してください。'}</p>
      {notice.kind==='save'
        ? <details className="mt-1"><summary className="live-list-focus flex min-h-[44px] cursor-pointer items-center font-black">くわしく見る</summary>
            <p className="m-0 mt-1 font-bold">{notice.tip}</p>
            <button type="button" onClick={()=>setNotice(null)} className="live-list-focus touch-manipulation mt-2 min-h-[48px] rounded-xl border-2 border-[#991b1b] bg-white px-4 text-[17px] font-black text-slate-950">わかった（閉じる）</button>
          </details>
        : <button type="button" onClick={()=>setNotice(null)} className="live-list-focus touch-manipulation mt-2 min-h-[48px] rounded-xl border-2 border-[#991b1b] bg-white px-4 text-[17px] font-black text-slate-950">わかった（閉じる）</button>}
    </div>
  </div>:null;
  const remoteBox=remote?<Caution className="live-list-noprint mt-3">別の画面で変わりました。いまは第{data.currentBout+1}試合です。合っていれば何もしません。
    <div className="mt-2"><button type="button" onClick={()=>setRemote(false)} className="tos-safe-btn live-list-focus touch-manipulation">わかった</button></div></Caution>:null;
  // 試合を動かした直後の案内。動かした先の試合が、まだ今の試合のときだけ出す（別の画面でまた変わったら、古い「もどす」は出さない）。
  // 前・次のボタンの帯には入れない（帯が背高くなって、選手の名前をかくすため）。名前の上の、ふつうの流れの中に、1行で出す
  const undoShown=!list&&!!bout&&!!undo&&data.currentBout===undo.at;
  const moved=undoShown&&undo?moveNotice(undo.via,undo.to,undo.at):null;
  const left=undoShown&&undo?undoSecondsLeft(undo.since,clock):0;
  const undoPress=()=>{
    if(saving||!undo)return;
    void (async()=>{if(await jump(undo.to,'undo'))nextBtnRef.current?.focus({preventScroll:true});})();
  };
  const undoBox=undoShown&&undo&&moved?(left>0
    ? <div ref={undoBigRef} className="live-undo tos-caution live-list-noprint mt-2 flex-wrap items-center gap-x-4 gap-y-2 text-[17px]" style={{display:'flex',paddingTop:6,paddingBottom:6}}>
        {/* 読み上げの箱（role="status"）には、変わらない文だけを入れる。残りの秒数は、箱の『外』に置いて、目で見るだけにする（箱の中で毎秒かわると、同じ文が何度も読み上げられてしまう） */}
        <div className="m-0 min-w-0 flex-1 font-bold [overflow-wrap:anywhere]"><p role="status" className="m-0 inline"><span className="tos-caution-title"><span aria-hidden="true">⚠ </span>気をつけて：</span>{moved.text}</p>{undo.via==='list'?<span aria-hidden="true" className="font-black">（あと{left}秒）</span>:null}</div>
        <button type="button" aria-disabled={saving||undefined} onClick={undoPress} style={{minHeight:48,padding:'6px 16px'}} className={cx('tos-safe-btn live-list-focus touch-manipulation w-full sm:w-auto',saving&&'tos-locked')}>{moved.undoLabel}</button>
      </div>
    : <div className="live-list-noprint mt-2 flex flex-wrap items-center gap-2" style={{minHeight:Math.min(undoBigH.current,UNDO_MIN_CAP)||undefined}}><span className="text-[17px] font-bold text-slate-700">まちがえたとき：</span>
        <button type="button" aria-disabled={saving||undefined} onClick={undoPress} className="live-list-focus touch-manipulation min-h-[48px] rounded-xl border-2 border-slate-500 bg-white px-4 text-[17px] font-bold text-slate-800 underline">{moved.undoLabel}</button></div>):null;
  const savingLine=savePhase===1?<p className="live-list-noprint m-0 mb-2 text-[17px] font-bold text-slate-800">⏳ 保存しています…</p>
    :savePhase===2?<ErrorLine className="live-list-noprint mb-2">保存できていません。試合は進んでいません</ErrorLine>:null;
  const savedBadge=<span className="live-list-noprint flex flex-wrap items-center gap-x-3 gap-y-1">
    {saveFailed
      ? <span className="rounded-full border-2 border-[#b91c1c] bg-[#fef2f2] px-3 py-1 text-[17px] font-black text-[#991b1b]"><span aria-hidden="true">✕ </span>保存できていません</span>
      : <span className="rounded-full border-2 border-[#166534] bg-[#f0fdf4] px-3 py-1 text-[17px] font-black text-[#166534]"><span aria-hidden="true">✓ </span>保存済み<span className="live-saved-paren">（このパソコンの中）</span></span>}
    {saveFailed?null:<span className="live-saved-hint text-[17px] font-bold text-slate-700">押すたびに保存されます。ネットが弱いときは、閉じないでください</span>}
  </span>;
  const contract=bout?contractWeight(red,blue):'';
  const contractText=bout?(contract||bout.className||'契約未入力'):'';
  const ruleText=bout?.rule.trim()??'';
  const sameFighter=!!bout&&!!bout.redId&&bout.redId===bout.blueId;
  const samePerson=!!bout&&isSamePerson(red,blue);
  const problemOf=(fighter:LocalFighter|undefined):FighterProblem=>!fighter?'missing':sameFighter?'same':null;
  const prevLocked=saving||isFirst, nextLocked=saving||isLast;
  const hideSwitcher=!list&&oneBout;
  // キーを押しっぱなしにすると、0.5秒あとから同じキーが何度も届く。ボタンの上では、その連打を捨てる（押しっぱなしで、何試合も進まないように）
  const dropHeldKey=(event:KeyboardEvent<HTMLElement>)=>{if(isHeldKeyRepeat(event)&&(event.target as HTMLElement).closest('button'))event.preventDefault();};
  return <main onKeyDown={dropHeldKey} style={listToast&&toastH?{paddingBottom:toastH}:undefined} className={'live-page flex flex-col bg-slate-100 p-3 text-slate-950'+(settling?' pointer-events-none':'')}><div className="live-top"><header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-white px-5 py-1.5 shadow-sm"><h1 className="live-title text-xl font-black [overflow-wrap:anywhere]">{data.title.trim()||NO_TITLE}</h1><b ref={boutLabel} tabIndex={-1} className="live-list-focus flex flex-wrap items-baseline gap-x-3 rounded-lg px-1">{bout?<><span className="text-[40px] font-black leading-tight">{'第'+(data.currentBout+1)+'試合'}</span><span className="text-xl font-bold text-slate-700">{'全'+data.bouts.length+'試合'}</span></>:<span className="text-xl">全0試合</span>}</b>{savedBadge}</header>{hideSwitcher?null:switcher}</div>
    {online?null:<Caution title="ネットがつながっていません" className="live-list-noprint mt-2">{OFFLINE_NOTE}</Caution>}
    {list?<>{noticeBox}{remoteBox}</>:<>{undoBox}{remoteBox}</>}
    {!list&&classMix?<ErrorLine role="status" mark="⚠ " className="live-mix live-list-noprint mt-2">{'クラスがちがう試合です（赤：'+(red?.fighterClass??'').trim()+'／青：'+(blue?.fighterClass??'').trim()+'）。ルールがちがうので、準備画面で組み合わせを確かめてください。試合は、このまま進められます。'}</ErrorLine>:null}
    {!list&&samePerson?<ErrorLine role="status" mark="⚠ " className="live-mix live-list-noprint mt-2">同じ人かもしれません：赤と青が、同じ名前・同じジムです。準備画面で確かめてください。試合は、このまま進められます。</ErrorLine>:null}
    {list
      ? <ListView data={data} eventId={eventId} saving={saving} onOpen={openFromList} onWantSingle={setListWantsSingle} pressedIndex={savingRow} retryIndex={notice?.kind==='save'&&notice.via==='list'&&notice.index!==undefined?notice.index:null}/>
      : bout
        ? <>
            {/* ルールは、2人の上に、大きな字で。クラスで決まる大事なことなので、遠くからでも読めるように */}
            {ruleText?<p className="live-rule mt-2 rounded-2xl border-4 border-slate-700 bg-white px-4 py-1 text-center text-xl font-black leading-snug text-slate-950 [overflow-wrap:anywhere] md:text-[1.75rem]"><span className="mr-2 text-[17px] font-bold text-slate-700">ルール</span><WithBreaks text={ruleText}/></p>:null}
            <section className="live-sec mt-2 grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)_minmax(0,1fr)]">
              <FighterCard side="red" fighter={red} musicEnabled={musicEnabled} problem={problemOf(red)}/>
              <div className="grid min-w-0 place-items-center rounded-2xl bg-white p-3 text-center"><div className="min-w-0 max-w-full"><p className="text-2xl font-black leading-none text-slate-600">VS</p><p className="mt-3 text-[clamp(1.75rem,3.5vw,2.75rem)] font-black leading-tight [overflow-wrap:anywhere]">{contract?<><span className="whitespace-nowrap">{contract.replace(/契約$/,'')}</span><wbr/><span className="whitespace-nowrap">契約</span></>:contractText}</p>{contract?<p className="mt-1 text-[17px] font-bold text-slate-700">（決めた体重）</p>:!bout.className?<ErrorLine className="mt-2 text-left">体重が入っていません（準備画面で入れてください）</ErrorLine>:null}</div></div>
              <FighterCard side="blue" fighter={blue} musicEnabled={musicEnabled} problem={problemOf(blue)}/>
            </section>
            {oneBout
              ? <div className="live-bottom mt-3 grid gap-2"><Hint className="text-center">この大会は1試合だけです</Hint>{prepLink('justify-center text-center')}</div>
              : <>
                  <footer ref={footerRef} className={cx('live-single-footer mt-3 rounded-2xl bg-white p-2 shadow-[0_-4px_12px_rgba(15,23,42,0.18)]',footFlow&&'live-footer-flow')}>
                    {noticeBox}{savingLine}{repeatNote?<p className="live-list-noprint m-0 mb-2 text-[17px] font-bold text-slate-800">いま進んだところです（続けて押したぶんは、無視しました）</p>:null}
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))] items-start gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                      <NextSlot active={yellowSlot==='prev'} label="もう一度押す" row><button aria-label="← 前の試合" aria-disabled={prevLocked||undefined} onClick={()=>{if(!prevLocked)step('prev');}} className={footBtn+'border-4 border-slate-800 bg-white text-slate-950'+(isFirst?' tos-locked':'')}><span className="block">← 前の試合</span>{isFirst?<span className="block text-[17px] font-bold leading-tight"><span aria-hidden="true">🔒 </span>最初の試合です（前はありません）</span>:<span className="live-foot-hint block text-[17px] font-bold leading-tight text-slate-700">{'前は 第'+data.currentBout+'試合'}</span>}</button></NextSlot>
                      <NextSlot active={yellowSlot==='next'} label={retryDir==='next'?'もう一度押す':'この試合が終わったら押す'} row><button ref={nextBtnRef} aria-label="次の試合 →" aria-disabled={nextLocked||undefined} onClick={()=>{if(!nextLocked)step('next');}} className={footBtn+'border-4 border-indigo-900 bg-indigo-700 text-white'+(isLast?' tos-locked':'')}><span className="block">次の試合 →</span>{isLast?<span className="block text-[17px] font-bold leading-tight"><span aria-hidden="true">🔒 </span>これが最後の試合です。押せません</span>:<span className="live-foot-hint block text-[17px] font-bold leading-tight text-indigo-100">{nextHint(data.currentBout,data.bouts.length)}</span>}</button></NextSlot>
                    </div>
                  </footer>
                  {prepLink('live-bottom mt-2')}
                </>}
          </>
        : <EmptyBouts eventId={eventId}/>}
  </main>;
}
