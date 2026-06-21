import type { HealthReport, CheckResult } from "./healthcheck.js";

/**
 * ヘルスチェックのアラートを「本当に必要な時だけ」LINEに送るためのゲート（純粋関数）。
 *
 * 実ログの騒音対策:
 * - 自己回復した失敗（line_webhook が落ちたが systemd_self_heal で復活）は通知しない。
 * - 一時的なブレで即通知しない（既定3回連続で同じ障害が続いた時だけ）。
 * - 通知しすぎない（既定60分に1回まで）。
 */

export interface AlertState {
  failKey: string;
  streak: number;
  lastAlertAt: string | null;
}

export interface AlertDecideOptions {
  streakThreshold?: number;
  throttleMs?: number;
}

const DEFAULT_STREAK = 3;
const DEFAULT_THROTTLE_MS = 60 * 60 * 1000;

/** 自己回復した失敗を除いた「実害のある失敗」だけを残す。 */
export function effectiveFailures(report: HealthReport): CheckResult[] {
  const selfHealOk = report.checks.some(c => c.name === "systemd_self_heal" && c.ok);
  return report.failures.filter(f => {
    // webhook が落ちても self-heal が復活させていれば実害なし＝無視。
    if (f.name === "line_webhook" && selfHealOk) return false;
    return true;
  });
}

export function decideAlert(
  prev: AlertState | undefined,
  report: HealthReport,
  now: Date,
  opts: AlertDecideOptions = {},
): { alert: boolean; state: AlertState } {
  const streakThreshold = opts.streakThreshold ?? DEFAULT_STREAK;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const lastAlertAt = prev?.lastAlertAt ?? null;

  const failures = effectiveFailures(report);
  if (failures.length === 0) {
    // 実害なし → 連続カウントをリセット（通知しない）。
    return { alert: false, state: { failKey: "", streak: 0, lastAlertAt } };
  }

  const key = failures.map(f => f.name).sort().join(",");
  const streak = prev && prev.failKey === key ? prev.streak + 1 : 1;

  let alert = false;
  if (streak >= streakThreshold) {
    if (!lastAlertAt || now.getTime() - Date.parse(lastAlertAt) >= throttleMs) {
      alert = true;
    }
  }

  return {
    alert,
    state: { failKey: key, streak, lastAlertAt: alert ? now.toISOString() : lastAlertAt },
  };
}
