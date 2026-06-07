import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pushAlert } from "../line_bot/notifier.js";
import { formatSelfHealResult, runSystemdSelfHeal, servicesFromEnv } from "./systemd_self_heal.js";

const execFileP = promisify(execFile);

export interface CheckResult {
  name: string;
  ok: boolean;
  latencyMs?: number;
  detail?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

async function timed(fn: () => Promise<{ ok: boolean; detail?: string; error?: string }>): Promise<{ ok: boolean; latencyMs: number; detail?: string; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function lineWebhookAttemptsForEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPENQLOW_LINE_WEBHOOK_ATTEMPTS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 20) return parsed;
  return env.OPENQLOW_MONITOR_SYSTEMD === "true" ? 8 : 1;
}

export async function checkOpenRouter(): Promise<CheckResult> {
  const r = await timed(async () => {
    const apiKey = process.env.OPENROUTER_API_KEY ?? "";
    const url = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "") + "/models";
    const res = await fetchWithTimeout(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, detail: `models endpoint ${res.status}` };
  });
  return { name: "openrouter", ...r };
}

function ollamaApiUrl(path: string): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const apiBase = base.endsWith("/api") ? base : `${base}/api`;
  return `${apiBase}${path}`;
}

export async function checkOllama(): Promise<CheckResult> {
  const r = await timed(async () => {
    const res = await fetchWithTimeout(ollamaApiUrl("/tags"), {}, 2000);
    if (!res.ok) return { ok: false, error: `ollama HTTP ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }> };
    const model = process.env.OLLAMA_MODEL;
    if (model && Array.isArray(data.models)) {
      const found = data.models.some(m => m.name === model || m.name?.startsWith(`${model}:`));
      if (!found) return { ok: false, error: `model not pulled: ${model}` };
      return { ok: true, detail: `ollama model ready: ${model}` };
    }
    return { ok: true, detail: "ollama reachable" };
  });
  return { name: "ollama", ...r };
}

export async function checkAnythingLLM(): Promise<CheckResult> {
  const r = await timed(async () => {
    const base = (process.env.ANYTHINGLLM_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
    const res = await fetchWithTimeout(`${base}/api/ping`, {}, 2000);
    if (!res.ok) return { ok: false, error: `anythingllm HTTP ${res.status}` };
    return { ok: true, detail: "anythingllm reachable" };
  });
  return { name: "anythingllm", ...r };
}

export async function checkLineWebhook(): Promise<CheckResult> {
  const r = await timed(async () => {
    const port = Number(process.env.OPENQLOW_LINE_PORT ?? 8787);
    const url = `http://localhost:${port}/line/webhook`;
    let lastError = "webhook unavailable";
    const attempts = lineWebhookAttemptsForEnv();
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await fetchWithTimeout(url, { method: "POST", body: "ping" }, 2000);
        // 200 with JSON "no approval command" is the expected healthy response,
        // 401 (signature failure) also indicates the server is running.
        if (res.status === 200 || res.status === 401) {
          return { ok: true, detail: attempts > 1 ? `webhook ${res.status} after ${attempt}/${attempts}` : `webhook ${res.status}` };
        }
        lastError = `webhook HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < attempts) await sleep(1000);
    }
    return { ok: false, error: lastError };
  });
  return { name: "line_webhook", ...r };
}

export async function checkNgrok(): Promise<CheckResult> {
  const r = await timed(async () => {
    const url = process.env.NGROK_API_URL ?? "http://127.0.0.1:4040/api/tunnels";
    const res = await fetchWithTimeout(url, {}, 2000);
    if (!res.ok) return { ok: false, error: `ngrok API HTTP ${res.status}` };
    const data = (await res.json()) as { tunnels?: Array<{ public_url?: string; proto?: string }> };
    const tunnels = data.tunnels ?? [];
    if (tunnels.length === 0) return { ok: false, error: "no tunnels active" };
    const httpsTunnel = tunnels.find(t => t.proto === "https") ?? tunnels[0];
    return { ok: true, detail: `tunnel: ${httpsTunnel?.public_url}` };
  });
  return { name: "ngrok", ...r };
}

export async function checkLaunchd(): Promise<CheckResult> {
  const r = await timed(async () => {
    try {
      const { stdout } = await execFileP("launchctl", ["list"]);
      const hasMorning = stdout.includes("com.flatup.openqlow.daily");
      const hasServe = stdout.includes("com.flatup.openqlow.serve");
      const hasMonitor = stdout.includes("com.flatup.openqlow.monitor");
      const loaded = [
        hasMorning ? "daily" : null,
        hasServe ? "serve" : null,
        hasMonitor ? "monitor" : null,
      ].filter(Boolean).join(", ");
      if (!hasMorning && !hasServe && !hasMonitor) {
        return { ok: false, error: "no openqlow launchd jobs loaded" };
      }
      return { ok: true, detail: `loaded: ${loaded}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  return { name: "launchd", ...r };
}

export async function checkSystemdSelfHeal(): Promise<CheckResult> {
  const r = await timed(async () => {
    const result = await runSystemdSelfHeal({
      services: servicesFromEnv(),
      allowRestart: process.env.OPENQLOW_MONITOR_SELF_HEAL === "true",
    });
    const detail = formatSelfHealResult(result);
    return result.ok ? { ok: true, detail } : { ok: false, error: detail };
  });
  return { name: "systemd_self_heal", ...r };
}

export interface HealthReport {
  ok: boolean;
  timestamp: string;
  checks: CheckResult[];
  failures: CheckResult[];
}

export function healthcheckNamesForEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = ["openrouter"];
  const systemdEnabled = env.OPENQLOW_MONITOR_SYSTEMD === "true";
  if (!systemdEnabled) names.push("line_webhook");
  if (env.OPENQLOW_CHECK_NGROK === "true") names.push("ngrok");
  if (env.OPENQLOW_CHECK_LAUNCHD === "true") names.push("launchd");
  if (env.OPENQLOW_CHECK_OLLAMA === "true") names.push("ollama");
  if (env.OPENQLOW_CHECK_ANYTHINGLLM === "true") names.push("anythingllm");
  if (systemdEnabled) names.push("systemd_self_heal", "line_webhook");
  return names;
}

export async function runHealthcheck(): Promise<HealthReport> {
  const pendingChecks = healthcheckNamesForEnv().map((name) => {
    if (name === "openrouter") return checkOpenRouter();
    if (name === "line_webhook") return checkLineWebhook();
    if (name === "ngrok") return checkNgrok();
    if (name === "launchd") return checkLaunchd();
    if (name === "ollama") return checkOllama();
    if (name === "anythingllm") return checkAnythingLLM();
    return checkSystemdSelfHeal();
  });
  const checks = await Promise.all(pendingChecks);
  const failures = checks.filter(c => !c.ok);
  return {
    ok: failures.length === 0,
    timestamp: new Date().toISOString(),
    checks,
    failures,
  };
}

export function formatReport(report: HealthReport): string {
  const lines = [
    `OPENQLOW Healthcheck @ ${report.timestamp}`,
    report.ok ? "✅ ALL GREEN" : `❌ ${report.failures.length} FAILED`,
    "",
  ];
  for (const c of report.checks) {
    const icon = c.ok ? "✅" : "❌";
    const detail = c.detail ?? c.error ?? "";
    lines.push(`${icon} ${c.name} (${c.latencyMs}ms) ${detail}`);
  }
  return lines.join("\n");
}

export async function runHealthcheckWithAlert(): Promise<HealthReport> {
  const report = await runHealthcheck();
  const text = formatReport(report);
  console.log(text);
  if (!report.ok) {
    try {
      await pushAlert(`${report.failures.length} services down`, text);
    } catch (err) {
      console.error("alert push failed:", err);
    }
  }
  return report;
}
