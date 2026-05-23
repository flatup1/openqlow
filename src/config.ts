import path from "node:path";

export interface OpenqlowConfig {
  root: string;
  flatupAiOsRoot: string;
  obsidianVaultRoot: string;
  inboxRelative: string;
  dryRun: boolean;
  typefullyConfigPath: string;
}

export function loadConfig(): OpenqlowConfig {
  const root = process.env.OPENQLOW_ROOT || process.cwd();
  const home = process.env.HOME || "/Users/jin";
  return {
    root,
    flatupAiOsRoot:
      process.env.FLATUP_AI_OS_ROOT || path.resolve(root, "../flatup-ai-os"),
    obsidianVaultRoot:
      process.env.OBSIDIAN_VAULT_ROOT || path.join(home, "Documents", "Obsidian Vault"),
    inboxRelative: process.env.OPENQLOW_INBOX_RELATIVE || "30_INBOX/openqlow",
    dryRun: process.env.OPENQLOW_DRY_RUN !== "false",
    typefullyConfigPath:
      process.env.TYPEFULLY_CONFIG_PATH || path.join(process.env.HOME || "/Users/jin", ".config/typefully/config.json"),
  };
}
