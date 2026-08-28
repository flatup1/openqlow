// Brand Growth Phase 4: 保存先をどこにするか。
//
// 参照: CLAUDE_CODE_IMPLEMENTATION_SPEC §11、IMPLEMENTATION_BOOK §6。
//
// 決めごと:
//   - 保存先は差し替えられる（引数 > 環境変数 > 既定）。
//   - 既定は Git 追跡外の runtime ディレクトリ。ソースの中には絶対に書かない。
//   - テストは一時ディレクトリだけを使う（この module は既定値を勝手に作らない）。
//
// この module はディレクトリを作らない。パスを決めるだけ。

import path from "node:path";

/** 保存先を差し替える環境変数名。未設定が既定。 */
export const BRAND_GROWTH_ROOT_ENV = "BRAND_GROWTH_DATA_ROOT";

/** 既定の保存先（リポジトリ直下からの相対）。.gitignore で追跡外にしてある。 */
export const DEFAULT_RUNTIME_DIRNAME = "runtime";
export const DEFAULT_STORE_SUBDIR = "brand_growth";

/** 保存先として使ってはいけない場所。原本や記録を上書きしないための線引き。 */
const FORBIDDEN_TOP_SEGMENTS: readonly string[] = Object.freeze([
  "src",
  "port",
  "docs",
  "scripts",
  "deploy",
  "knowledge",
  ".git",
]);

export class StoreConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreConfigError";
    this.code = code;
  }
}

export interface ResolveRootOptions {
  /** 明示指定。テストは必ずここに一時ディレクトリを渡す。 */
  readonly root?: string | null;
  /** 環境変数の束。既定は process.env。テストは偽の束を渡せる。 */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** リポジトリの基準ディレクトリ。既定は process.cwd()。 */
  readonly cwd?: string;
}

/**
 * 保存先の絶対パスを決める。
 *
 * 優先順位: 引数 root > 環境変数 > `<cwd>/runtime/brand_growth`。
 * ソースや docs の中を指していたら、書き込む前に止める。
 */
export function resolveStoreRoot(options: ResolveRootOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const explicit = options.root ?? null;
  const fromEnv = env[BRAND_GROWTH_ROOT_ENV] ?? null;

  const chosen =
    explicit !== null && explicit.trim() !== ""
      ? explicit
      : fromEnv !== null && fromEnv.trim() !== ""
        ? fromEnv
        : path.join(cwd, DEFAULT_RUNTIME_DIRNAME, DEFAULT_STORE_SUBDIR);

  const absolute = path.resolve(cwd, chosen);
  assertWritableLocation(absolute, cwd);
  return absolute;
}

/** 追跡対象のソースや設計書の中へ書こうとしていないか。 */
function assertWritableLocation(absolute: string, cwd: string): void {
  const relative = path.relative(path.resolve(cwd), absolute);
  // リポジトリの外（一時ディレクトリなど）はそのまま許す。
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") {
      throw new StoreConfigError("root_is_repository", "store root must not be the repository root itself");
    }
    return;
  }
  const top = relative.split(path.sep)[0] ?? "";
  if (FORBIDDEN_TOP_SEGMENTS.includes(top)) {
    throw new StoreConfigError(
      "root_inside_tracked_source",
      `store root must not be inside tracked source directory: ${top}`,
    );
  }
}

/** 既定の保存先が Git 追跡外かどうかを、人が確かめるための名前。 */
export function defaultRootTopSegment(): string {
  return DEFAULT_RUNTIME_DIRNAME;
}
