'use client';

/**
 * 停止は全画面に同期される。
 * この覆いが出ている間、どの画面も「待つ」以外のことを言わない。
 */

export function HoldOverlay({ message, subtitle }: { message: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07090d]/97 px-6 text-center">
      <div className="mb-6 h-3 w-40 rounded-full bg-rose-600" aria-hidden />
      <p className="text-[clamp(2.5rem,8vw,7rem)] font-black leading-tight text-white">{message}</p>
      {subtitle ? <p className="mt-6 text-lg font-semibold text-slate-400">{subtitle}</p> : null}
    </div>
  );
}
