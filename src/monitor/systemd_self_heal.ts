import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type SystemdRunner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export type SelfHealAction =
  | { service: string; action: "healthy"; detail: string }
  | { service: string; action: "restart"; detail: string }
  | { service: string; action: "needs_human"; detail: string }
  | { service: string; action: "blocked"; detail: string };

export interface SystemdSelfHealResult {
  ok: boolean;
  actions: SelfHealAction[];
}

export interface SystemdSelfHealOptions {
  services: string[];
  allowRestart: boolean;
  runner?: SystemdRunner;
}

const DEFAULT_RUNNER: SystemdRunner = async (command, args) => execFileP(command, args);

export function isAllowedOpenqlowService(service: string): boolean {
  return /^openqlow-[a-z0-9-]+\.service$/.test(service);
}

async function isActive(service: string, runner: SystemdRunner): Promise<boolean> {
  try {
    const { stdout } = await runner("systemctl", ["is-active", service]);
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

export async function runSystemdSelfHeal(options: SystemdSelfHealOptions): Promise<SystemdSelfHealResult> {
  const runner = options.runner ?? DEFAULT_RUNNER;
  const actions: SelfHealAction[] = [];

  for (const service of options.services) {
    if (!isAllowedOpenqlowService(service)) {
      actions.push({ service, action: "blocked", detail: "openqlow service 以外は自動操作しません" });
      continue;
    }

    if (await isActive(service, runner)) {
      actions.push({ service, action: "healthy", detail: "active" });
      continue;
    }

    if (!options.allowRestart) {
      actions.push({ service, action: "needs_human", detail: "inactive; self-heal disabled" });
      continue;
    }

    await runner("systemctl", ["restart", service]);
    const recovered = await isActive(service, runner);
    actions.push({
      service,
      action: "restart",
      detail: recovered ? "restarted and active" : "restart attempted but still inactive",
    });
  }

  return { ok: actions.every(a => a.action === "healthy" || (a.action === "restart" && a.detail.includes("active"))), actions };
}

export function servicesFromEnv(value = process.env.OPENQLOW_MONITOR_SERVICES): string[] {
  return (value ?? "openqlow-webhook.service")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

export function formatSelfHealResult(result: SystemdSelfHealResult): string {
  return result.actions.map(a => `${a.service}: ${a.action} (${a.detail})`).join("; ");
}
