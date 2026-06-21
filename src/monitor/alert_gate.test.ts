import assert from "node:assert/strict";
import { decideAlert, effectiveFailures, type AlertState } from "./alert_gate.js";
import type { HealthReport } from "./healthcheck.js";

function report(failNames: string[], extra: Array<{ name: string; ok: boolean }> = []): HealthReport {
  const failures = failNames.map(name => ({ name, ok: false }));
  const checks = [...failures, ...extra.map(e => ({ name: e.name, ok: e.ok }))];
  return { ok: failures.length === 0, timestamp: "t", checks, failures };
}

// 自己回復(line_webhook落ち + systemd_self_heal ok)は実害なし＝通知しない。
{
  const r = report(["line_webhook"], [{ name: "systemd_self_heal", ok: true }]);
  assert.equal(effectiveFailures(r).length, 0);
  const d = decideAlert(undefined, r, new Date(), { streakThreshold: 3 });
  assert.equal(d.alert, false);
  assert.equal(d.state.streak, 0);
}

// 本当の障害は3回連続で初めて通知。
{
  const now = new Date("2026-06-21T00:00:00Z");
  const r = report(["openrouter"]);
  let s: AlertState | undefined;
  let d = decideAlert(s, r, now); assert.equal(d.alert, false); s = d.state; // 1
  d = decideAlert(s, r, now); assert.equal(d.alert, false); s = d.state;     // 2
  d = decideAlert(s, r, now); assert.equal(d.alert, true); s = d.state;      // 3 → 通知
  // 直後はスロットルで再通知しない。
  d = decideAlert(s, r, now); assert.equal(d.alert, false);
}

// 60分経過後は再通知できる。
{
  const r = report(["openrouter"]);
  const t0 = new Date("2026-06-21T00:00:00Z");
  let s = decideAlert(undefined, r, t0).state;
  s = decideAlert(s, r, t0).state;
  const fired = decideAlert(s, r, t0); assert.equal(fired.alert, true); s = fired.state;
  const later = new Date("2026-06-21T01:01:00Z");
  const again = decideAlert(s, r, later); assert.equal(again.alert, true);
}

// 回復したら次の障害はまた1からカウント。
{
  const r1 = report(["openrouter"]);
  const ok = report([]);
  let s = decideAlert(undefined, r1, new Date()).state;
  s = decideAlert(s, ok, new Date()).state;
  assert.equal(s.streak, 0);
  const d = decideAlert(s, r1, new Date(), { streakThreshold: 3 });
  assert.equal(d.alert, false);
  assert.equal(d.state.streak, 1);
}

console.log("alert gate tests passed");
