import assert from "node:assert/strict";
import { runSystemdSelfHeal } from "./systemd_self_heal.js";

function fakeRunner(states: Record<string, string>) {
  const calls: Array<{ command: string; args: string[] }> = [];
  return {
    calls,
    runner: async (command: string, args: string[]) => {
      calls.push({ command, args });
      const service = args[args.length - 1];
      if (command !== "systemctl") throw new Error(`unexpected command: ${command}`);
      if (args[0] === "is-active") {
        return { stdout: `${states[service] ?? "inactive"}\n`, stderr: "" };
      }
      if (args[0] === "restart") {
        states[service] = "active";
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    },
  };
}

{
  const fake = fakeRunner({ "openqlow-webhook.service": "failed" });
  const result = await runSystemdSelfHeal({
    services: ["openqlow-webhook.service"],
    allowRestart: true,
    runner: fake.runner,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.actions.map(a => a.action), ["restart"]);
  assert.deepEqual(fake.calls.map(c => c.args.join(" ")), [
    "is-active openqlow-webhook.service",
    "restart openqlow-webhook.service",
    "is-active openqlow-webhook.service",
  ]);
}

{
  const fake = fakeRunner({ "mysql.service": "failed" });
  const result = await runSystemdSelfHeal({
    services: ["mysql.service"],
    allowRestart: true,
    runner: fake.runner,
  });

  assert.equal(result.ok, false);
  assert.equal(result.actions[0]?.action, "blocked");
  assert.equal(fake.calls.length, 0, "許可外サービスには systemctl すら呼ばない");
}

{
  const fake = fakeRunner({ "openqlow-webhook.service": "failed" });
  const result = await runSystemdSelfHeal({
    services: ["openqlow-webhook.service"],
    allowRestart: false,
    runner: fake.runner,
  });

  assert.equal(result.ok, false);
  assert.equal(result.actions[0]?.action, "needs_human");
  assert.deepEqual(fake.calls.map(c => c.args.join(" ")), ["is-active openqlow-webhook.service"]);
}

console.log("systemd self-heal tests passed");
