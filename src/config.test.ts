import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "./config.js";

const previousVault = process.env.OBSIDIAN_VAULT_ROOT;
const previousHome = process.env.HOME;

try {
  process.env.HOME = "/Users/jin";
  delete process.env.OBSIDIAN_VAULT_ROOT;

  const config = loadConfig();
  assert.equal(
    config.obsidianVaultRoot,
    path.join("/Users/jin", "Documents", "Obsidian Vault"),
  );

  process.env.OBSIDIAN_VAULT_ROOT = "/tmp/custom-vault";
  assert.equal(loadConfig().obsidianVaultRoot, "/tmp/custom-vault");
} finally {
  if (previousVault === undefined) {
    delete process.env.OBSIDIAN_VAULT_ROOT;
  } else {
    process.env.OBSIDIAN_VAULT_ROOT = previousVault;
  }

  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
}

console.log("config tests passed");
