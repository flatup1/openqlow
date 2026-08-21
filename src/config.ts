import path from "node:path";

export interface OpenqlowConfig {
  root: string;
  flatupAiOsRoot: string;
  obsidianVaultRoot: string;
  inboxRelative: string;
  dryRun: boolean;
  typefullyConfigPath: string;
}

/**
 * 設定の誤りで「別の場所へ静かに書く」のを止めるためのエラー。
 * 落ちるほうが、気づかないまま間違った場所へ書き続けるより安全。
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * HOME を起点にしたパスを組み立てる。
 *
 * 以前はここに `/Users/jin` を直書きしていた。Mac以外（本番のLinux VPS）で
 * HOME が無いと、存在しないMacのパスへ黙って書きに行く状態だった。
 * 推測でパスを作らず、根拠が無ければ何が足りないかを言って止まる。
 */
function fromHome(envVarName: string, ...parts: string[]): string {
  const home = process.env.HOME;
  if (!home) {
    throw new ConfigError(
      `${envVarName} が未設定で、HOME も取得できません。${envVarName} を明示的に設定してください。`,
    );
  }
  return path.join(home, ...parts);
}

/**
 * 本番では HOME からの推測を許さない。
 *
 * systemd の本番ユニットは `ProtectHome=true` で動き、HOME はコードが期待する
 * 場所を指さない。本番で env が抜けていたら、推測せず起動時に止める。
 * （`deploy/openqlow.vps.env.example` は必要な値をすべて設定済み）
 */
function requiredInProduction(envVarName: string, value: string | undefined): string | undefined {
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new ConfigError(
      `本番では ${envVarName} の明示的な設定が必要です（/etc/openqlow/openqlow.env を確認）。`,
    );
  }
  return undefined;
}

export function loadConfig(): OpenqlowConfig {
  const root = process.env.OPENQLOW_ROOT || process.cwd();
  const vaultRoot = requiredInProduction("OBSIDIAN_VAULT_ROOT", process.env.OBSIDIAN_VAULT_ROOT);
  const typefullyPath = requiredInProduction("TYPEFULLY_CONFIG_PATH", process.env.TYPEFULLY_CONFIG_PATH);

  return {
    root,
    flatupAiOsRoot:
      process.env.FLATUP_AI_OS_ROOT || path.resolve(root, "../flatup-ai-os"),
    obsidianVaultRoot:
      vaultRoot || fromHome("OBSIDIAN_VAULT_ROOT", "Documents", "Obsidian Vault"),
    inboxRelative: process.env.OPENQLOW_INBOX_RELATIVE || "30_INBOX/openqlow",
    dryRun: process.env.OPENQLOW_DRY_RUN !== "false",
    typefullyConfigPath:
      typefullyPath || fromHome("TYPEFULLY_CONFIG_PATH", ".config", "typefully", "config.json"),
  };
}
