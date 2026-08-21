import assert from "node:assert/strict";
import path from "node:path";
import { ConfigError, loadConfig } from "./config.js";

const previousVault = process.env.OBSIDIAN_VAULT_ROOT;
const previousTypefully = process.env.TYPEFULLY_CONFIG_PATH;
const previousHome = process.env.HOME;
const previousNodeEnv = process.env.NODE_ENV;

function reset(): void {
  delete process.env.OBSIDIAN_VAULT_ROOT;
  delete process.env.TYPEFULLY_CONFIG_PATH;
  delete process.env.NODE_ENV;
  process.env.HOME = "/home/tester";
}

try {
  // --- ローカル開発: HOME から組み立てる（従来どおり） ---
  reset();
  assert.equal(
    loadConfig().obsidianVaultRoot,
    path.join("/home/tester", "Documents", "Obsidian Vault"),
  );
  assert.equal(
    loadConfig().typefullyConfigPath,
    path.join("/home/tester", ".config", "typefully", "config.json"),
  );

  // --- 明示指定が最優先 ---
  reset();
  process.env.OBSIDIAN_VAULT_ROOT = "/tmp/custom-vault";
  assert.equal(loadConfig().obsidianVaultRoot, "/tmp/custom-vault");

  // --- Macのパスを直書きしない（以前は HOME 無しで /Users/jin を使っていた） ---
  reset();
  delete process.env.HOME;
  assert.throws(
    () => loadConfig(),
    (error: unknown) => error instanceof ConfigError && /OBSIDIAN_VAULT_ROOT/.test((error as Error).message),
    "HOME が無いときは推測せず、足りない環境変数の名前を言って止まる",
  );

  // HOME が無くても明示指定があれば動く
  reset();
  delete process.env.HOME;
  process.env.OBSIDIAN_VAULT_ROOT = "/opt/obsidian-vault";
  process.env.TYPEFULLY_CONFIG_PATH = "/etc/openqlow/typefully.json";
  assert.equal(loadConfig().obsidianVaultRoot, "/opt/obsidian-vault");

  // --- 本番では HOME からの推測を許さない ---
  // systemd の本番ユニットは ProtectHome=true。HOME はコードが期待する場所を指さない。
  reset();
  process.env.NODE_ENV = "production";
  assert.throws(
    () => loadConfig(),
    (error: unknown) => error instanceof ConfigError && /本番/.test((error as Error).message),
    "本番で OBSIDIAN_VAULT_ROOT が未設定なら起動時に止まる",
  );

  // 本番でも env が揃っていれば通る（deploy/openqlow.vps.env.example の状態）
  reset();
  process.env.NODE_ENV = "production";
  process.env.OBSIDIAN_VAULT_ROOT = "/opt/obsidian-vault";
  process.env.TYPEFULLY_CONFIG_PATH = "/etc/openqlow/typefully.json";
  const production = loadConfig();
  assert.equal(production.obsidianVaultRoot, "/opt/obsidian-vault");
  assert.equal(production.typefullyConfigPath, "/etc/openqlow/typefully.json");

  // --- 既定は dry-run（送らない側に倒れる） ---
  reset();
  delete process.env.OPENQLOW_DRY_RUN;
  assert.equal(loadConfig().dryRun, true, "OPENQLOW_DRY_RUN 未設定なら dry-run");
} finally {
  for (const [key, value] of [
    ["OBSIDIAN_VAULT_ROOT", previousVault],
    ["TYPEFULLY_CONFIG_PATH", previousTypefully],
    ["HOME", previousHome],
    ["NODE_ENV", previousNodeEnv],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("config tests passed");
