'use client';

import type { ReactNode } from 'react';
import { RECORD_DETAIL_LIMITS } from '../../core/recordDetail.ts';
import { countOf, drawOf, emptyOtherText, emptyTitleText, type KickText, type OtherText, type TitleText } from './recordDetailText.ts';

/**
 * くわしい戦績の入力欄（申し込みのページ）。新しいリンク（rd=on）だけで出す。
 * 文字から決まりの形を作るのは recordDetailText.ts、決まりの確認と送る形は core/recordDetail.ts。
 * 戦績の一行（fighter.record）は、ここのキックの数から決まる（ページ側で kickRecordText を使う）。
 */

const box = 'rounded-2xl border-2 border-slate-400 bg-white p-4';
const label = 'block text-[1.0625rem] font-bold text-slate-900';
// 選んだ欄は、ほかの欄（申し込みのページの inputBase）と同じ青い輪郭。直す欄は、赤い太い枠（tos-input-error）
const input = 'mt-2 block w-full min-h-14 min-w-0 rounded-2xl border-2 px-4 py-3 text-lg font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-600';
const choice = 'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-slate-500 bg-white px-4 text-lg font-bold';
const plusBtn = 'min-h-12 w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-[1.0625rem] font-bold text-slate-900';
const minusBtn = 'min-h-12 rounded-xl border-2 border-slate-500 bg-white px-4 text-[1.0625rem] font-bold text-slate-900';

type Props = {
  kick: KickText;
  setKick: (next: KickText) => void;
  otherOn: boolean;
  setOtherOn: (on: boolean) => void;
  others: OtherText[];
  setOthers: (next: OtherText[]) => void;
  titleOn: boolean;
  setTitleOn: (on: boolean) => void;
  titles: TitleText[];
  setTitles: (next: TitleText[]) => void;
  /** 送ろうとして決まりに合わなかった所（文）。送ったあとだけ、ページが渡す。空なら何も出さない */
  problems?: string[];
  /** 戦績の欄（この箱ぜんぶ）から、ほかの所へ移ったとき（箱の中の欄どうしで移るときは呼ばない）。ページは、ほかの欄の「欄を出た時」と同じにあつかう */
  onLeave?: () => void;
};

/** 戦績の3つの箱と、下の赤い注意。勝ち・引き分けの欄は、試合数が1以上のときだけ出る（試合数0＝未経験は、それで入力完了）。引き分けは、無ければ空のままでよい */
export function RecordDetailFields(p: Props): ReactNode {
  const games = countOf(p.kick.games);
  // 経験があるときだけ、勝ち・引き分けを出す（未経験は試合数0で、入力は完了）。負けは聞かない（試合数−勝ち−引き分け）
  const showKickDetail = games > 0;
  const kickWin = countOf(p.kick.win), kickDraw = drawOf(p.kick.draw);
  const winOver = games > 0 && Number.isInteger(kickWin) && kickWin > games;
  const drawOver = games > 0 && !winOver && Number.isInteger(kickWin) && Number.isInteger(kickDraw) && kickWin + kickDraw > games;
  // 勝ち（と引き分け）が試合数より多いときは、下の赤い一行（試合数と合わせて言う）で出しているので、同じことを2回は出さない
  const shownProblems = (p.problems ?? []).filter((text) => !((winOver && text.startsWith('キックボクシングの勝ちが、試合数')) || (drawOver && text.startsWith('キックボクシングの勝ちと引き分けを合わせた数'))));
  // 送ろうとして直す所があるときは、空の欄・数でない欄を赤い枠にして、上の赤い一覧（rd-problems）とつなぐ（読み上げでも、どの欄を直すか分かる）
  const checking = (p.problems ?? []).length > 0;
  const fieldLook = (bad: boolean, id: string, hint?: string, extra?: string) => ({
    'aria-invalid': bad ? true : undefined,
    'aria-describedby': [hint ? id + '-hint' : '', extra ?? '', bad && shownProblems.length ? 'rd-problems' : ''].filter(Boolean).join(' ') || undefined,
    className: input + (bad ? ' tos-input-error' : ' border-slate-500 bg-white'),
  });
  const numberField = (id: string, text: string, onText: (v: string) => void, name: string, hint?: string, over = false, overId?: string) => (
    <div className="min-w-0">
      <label htmlFor={id} className={label}>{name}</label>
      {hint ? <p id={id + '-hint'} className="text-[1.0625rem] text-slate-700">{hint}</p> : null}
      <input id={id} inputMode="numeric" autoComplete="off" value={text} onChange={(e) => onText(e.target.value)} {...fieldLook(over || (checking && !Number.isInteger(countOf(text))), id, hint, over ? overId : undefined)} />
    </div>
  );
  const textField = (id: string, text: string, onText: (v: string) => void, name: string, hint?: string, placeholder?: string, numeric = false) => (
    <div className="min-w-0">
      <label htmlFor={id} className={label}>{name}</label>
      {hint ? <p id={id + '-hint'} className="text-[1.0625rem] text-slate-700">{hint}</p> : null}
      <input id={id} inputMode={numeric ? 'numeric' : undefined} autoComplete="off" placeholder={placeholder} value={text} onChange={(e) => onText(e.target.value)} {...fieldLook(checking && (numeric ? !/^\d{4}$/.test(text.normalize('NFKC').trim()) : !text.trim()), id, hint)} />
    </div>
  );
  // 引き分け：無ければ空のままでよい（空＝0）。入れたときだけ、数字かを確かめる
  const drawField = (id: string, text: string, onText: (v: string) => void, over: boolean, overId?: string) => {
    const hint = '引き分けた試合の数です。無ければ、空のままでかまいません。';
    return (
      <div className="min-w-0">
        <label htmlFor={id} className={label}>引き分け</label>
        <p id={id + '-hint'} className="text-[1.0625rem] text-slate-700">{hint}</p>
        <input id={id} inputMode="numeric" autoComplete="off" value={text} onChange={(e) => onText(e.target.value)} {...fieldLook(over || (checking && !Number.isInteger(drawOf(text))), id, hint, over ? overId : undefined)} />
      </div>
    );
  };
  const onOff = (name: string, on: boolean, setOn: (v: boolean) => void, onTurnOn: () => void, onTurnOff: () => void) => (
    <fieldset className="mt-3 min-w-0">
      <legend className="text-[1.0625rem] font-bold text-slate-900">{name}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className={choice}><input type="radio" name={name} checked={!on} onChange={() => { setOn(false); onTurnOff(); }} className="h-6 w-6 accent-indigo-700" />なし</label>
        <label className={choice}><input type="radio" name={name} checked={on} onChange={() => { setOn(true); onTurnOn(); }} className="h-6 w-6 accent-indigo-700" />あり</label>
      </div>
    </fieldset>
  );
  const setOtherAt = (i: number, next: Partial<OtherText>) => p.setOthers(p.others.map((row, j) => (j === i ? { ...row, ...next } : row)));
  const setTitleAt = (i: number, next: Partial<TitleText>) => p.setTitles(p.titles.map((row, j) => (j === i ? { ...row, ...next } : row)));
  const otherLimit = RECORD_DETAIL_LIMITS.others, titleLimit = RECORD_DETAIL_LIMITS.titles;

  return (
    <div id="f-record" tabIndex={-1} className="min-w-0 space-y-6 outline-none" onBlur={(e) => { if (p.onLeave && !e.currentTarget.contains(e.relatedTarget as Node | null)) p.onLeave(); }}>
      <p className="text-lg font-black">戦績 必須</p>
      {shownProblems.length ? <ul id="rd-problems" className="grid gap-2 rounded-2xl border-2 border-red-700 bg-white p-4 text-[1.0625rem] font-bold text-red-700">{shownProblems.map((text, i) => <li key={i}>✕ {text}</li>)}</ul> : null}

      <section aria-labelledby="rd-kick-title" className={box}>
        <h3 id="rd-kick-title" className="text-lg font-black">【キックボクシングの戦績】</h3>
        <div className="mt-3 grid gap-4">
          {numberField('rd-kick-games', p.kick.games, (v) => p.setKick({ ...p.kick, games: v }), '試合数 必須', 'スパーリング大会も、試合数に入れてください。未経験の人は「0」と入れると、入力は完了です。')}
          {showKickDetail ? numberField('rd-kick-win', p.kick.win, (v) => p.setKick({ ...p.kick, win: v }), '勝ち 必須', '勝った試合の数です。', winOver, 'rd-kick-over') : null}
          {showKickDetail ? drawField('rd-kick-draw', p.kick.draw ?? '', (v) => p.setKick({ ...p.kick, draw: v }), drawOver, 'rd-kick-over') : null}
          {winOver ? <p id="rd-kick-over" className="text-[1.0625rem] font-bold text-red-700">勝ちが、試合数（{games}）より多くなっています。</p> : null}
          {drawOver ? <p id="rd-kick-over" className="text-[1.0625rem] font-bold text-red-700">勝ちと引き分けを合わせた数が、試合数（{games}）より多くなっています。</p> : null}
        </div>
      </section>

      <section aria-labelledby="rd-other-title" className={box}>
        <h3 id="rd-other-title" className="text-lg font-black">【他の格闘技の試合経験】</h3>
        {onOff('他の格闘技の試合経験', p.otherOn, p.setOtherOn,
          () => { if (p.others.length === 0) p.setOthers([emptyOtherText()]); },
          () => { /* 入れた行は消さない（「なし」を押しまちがえても、入力が消えない。「なし」のあいだは、行を使わない） */ })}
        {p.otherOn ? <div className="mt-4 grid gap-4">
          {p.others.map((row, i) => (
            <div key={i} className="grid gap-3 rounded-xl border-2 border-slate-300 p-3">
              <p className="text-[1.0625rem] font-bold">{i + 1}つ目の競技</p>
              {textField('rd-other-sport-' + i, row.sport, (v) => setOtherAt(i, { sport: v }), '競技名 必須', undefined, '例：空手')}
              {/* 2つの欄は、縦に1列に並べる（横に並べると、説明の行数がちがう分、入力欄の高さがずれて見える） */}
              {numberField('rd-other-games-' + i, row.games, (v) => setOtherAt(i, { games: v }), '試合数 必須', 'スパーリング大会も入れます')}
              {numberField('rd-other-win-' + i, row.win, (v) => setOtherAt(i, { win: v }), '勝ち 必須', '勝った試合の数です。', checking && countOf(row.win) > countOf(row.games))}
              {drawField('rd-other-draw-' + i, row.draw ?? '', (v) => setOtherAt(i, { draw: v }), checking && countOf(row.win) <= countOf(row.games) && countOf(row.win) + drawOf(row.draw) > countOf(row.games))}
              <button type="button" onClick={() => { const next = p.others.filter((_, j) => j !== i); p.setOthers(next); if (next.length === 0) p.setOtherOn(false); }} className={minusBtn}>この競技を消す</button>
            </div>
          ))}
          {p.others.length < otherLimit ? <button type="button" onClick={() => p.setOthers([...p.others, emptyOtherText()])} className={plusBtn}>競技を追加する</button> : <p className="text-[1.0625rem] text-slate-700">追加できるのは、{otherLimit}つまでです。</p>}
        </div> : null}
      </section>

      <section aria-labelledby="rd-title-title" className={box}>
        <h3 id="rd-title-title" className="text-lg font-black">【タイトル・入賞歴】</h3>
        {onOff('タイトル・入賞歴', p.titleOn, p.setTitleOn,
          () => { if (p.titles.length === 0) p.setTitles([emptyTitleText()]); },
          () => { /* 入れた行は消さない（「なし」を押しまちがえても、入力が消えない。「なし」のあいだは、行を使わない） */ })}
        {p.titleOn ? <div className="mt-4 grid gap-4">
          {p.titles.map((row, i) => (
            <div key={i} className="grid gap-3 rounded-xl border-2 border-slate-300 p-3">
              <p className="text-[1.0625rem] font-bold">{i + 1}つ目の実績</p>
              {textField('rd-title-event-' + i, row.event, (v) => setTitleAt(i, { event: v }), '大会名 必須', undefined, '例：〇〇カップ')}
              {textField('rd-title-year-' + i, row.year, (v) => setTitleAt(i, { year: v }), '獲得年 必須', '4けたの数字で入れてください', '例：2025', true)}
              {textField('rd-title-class-' + i, row.class, (v) => setTitleAt(i, { class: v }), '階級 必須', undefined, '例：-60kg')}
              {textField('rd-title-result-' + i, row.result, (v) => setTitleAt(i, { result: v }), 'タイトル名または入賞成績 必須', undefined, '例：優勝・3位')}
              <button type="button" onClick={() => { const next = p.titles.filter((_, j) => j !== i); p.setTitles(next); if (next.length === 0) p.setTitleOn(false); }} className={minusBtn}>この実績を消す</button>
            </div>
          ))}
          {p.titles.length < titleLimit ? <button type="button" onClick={() => p.setTitles([...p.titles, emptyTitleText()])} className={plusBtn}>実績を追加する</button> : <p className="text-[1.0625rem] text-slate-700">追加できるのは、{titleLimit}つまでです。</p>}
        </div> : null}
      </section>

      <p className="text-[1.0625rem] font-bold text-red-700">公平で安全なマッチメイクのため、スパーリング大会を含む戦績を正確にご申告ください。戦績の過少申告や虚偽の申告はお控えください。</p>
    </div>
  );
}
