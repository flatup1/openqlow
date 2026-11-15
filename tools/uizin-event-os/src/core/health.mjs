// ランプの3段階（✅ 確認済み / ⚠️ 未確認 / ❌ 異常）。
// 「確かめていないのに ✅」を出さないため、古い確認は自動で「未確認」に落とす。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §3.1、AGENTS.md R5

export const DEFAULT_MAX_AGE_MS = 6000;

// record: { status: "ok" | "error" | "unknown", checkedAt: number(ms) | null, message }
export function lamp(record, nowMs, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!record || record.checkedAt == null) return { status: "unknown", message: record?.message || "未確認" };
  const age = nowMs - record.checkedAt;
  if (record.status === "ok" && age > maxAgeMs) {
    return { status: "unknown", message: "しばらく確かめられていません（未確認）" };
  }
  if (record.status === "error" && age > maxAgeMs * 10) {
    return { status: "unknown", message: record.message || "未確認" };
  }
  return { status: record.status, message: record.message || "" };
}

export const LAMP_ICON = { ok: "✅", unknown: "⚠️", error: "❌" };
