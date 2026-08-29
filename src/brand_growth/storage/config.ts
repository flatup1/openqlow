// Brand Growth Phase 4: 保存先をどこにするか。
//
// 参照: CLAUDE_CODE_IMPLEMENTATION_SPEC §11、IMPLEMENTATION_BOOK §6、
//       ADR-0015 Narrow Local Event Store Boundary。
//
// 決めごと:
//   - この module は実行環境（環境変数、実行時の作業ディレクトリ）を一切読まない。
//     基準ディレクトリと環境変数の束は、呼び出し側が明示的に渡す。
//   - 保存先は差し替えられる（引数 root > 渡された env > 渡された cwd の既定）。
//   - 既定は Git 追跡外の runtime ディレクトリ。ソースの中には絶対に書かない。
//   - 基準が決まらないときは推測せず StoreConfigError で止める（fail closed）。
//   - テストは一時ディレクトリだけを使う（この module は既定値を勝手に作らない）。
//
// この module はディレクトリを作らない。パスを決めるだけ。
// 同じ明示入力からは、いつ・どのプロセスで呼んでも同じ結果になる。

import path from "node:path";

/** 保存先を差し替える環境変数名。読むのは「渡された束」だけで、実プロセスの環境ではない。 */
export const BRAND_GROWTH_ROOT_ENV = "BRAND_GROWTH_DATA_ROOT";

/** 既定の保存先（渡された cwd からの相対）。.gitignore で追跡外にしてある。 */
export const DEFAULT_RUNTIME_DIRNAME = "runtime";
export const DEFAULT_STORE_SUBDIR = "brand_growth";

/** 環境変数の既定は空。呼び出し側が渡さない限り、環境からは何も来ない。 */
const EMPTY_ENV: Readonly<Record<string, string | undefined>> = Object.freeze({});

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
  /**
   * 環境変数の束。既定は空。
   * 実プロセスの環境そのものは読まないので、使うなら呼び出し側が渡す。
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * リポジトリの基準ディレクトリ（絶対パス）。呼び出し側が明示的に渡す。
   * 実行時の作業ディレクトリへは落ちない。相対パスを渡すと fail closed になる。
   */
  readonly cwd?: string | null;
}

/** 空白だけ・未指定を「指定なし」に均す。 */
function pickExplicit(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value;
}

/**
 * 保存先の絶対パスを決める。
 *
 * 優先順位: 引数 root > 渡された env > `<渡された cwd>/runtime/brand_growth`。
 * 絶対パスの root も cwd も無ければ、推測せずに止める。
 * ソースや docs の中を指していたら、書き込む前に止める。
 */
export function resolveStoreRoot(options: ResolveRootOptions = {}): string {
  const env = options.env ?? EMPTY_ENV;

  const cwd = pickExplicit(options.cwd);
  if (cwd !== null && !path.isAbsolute(cwd)) {
    // 相対 cwd を path.resolve へ渡すと実プロセスの作業ディレクトリが混ざる。先に止める。
    throw new StoreConfigError("relative_cwd", "cwd must be an absolute path; resolve it in the caller");
  }

  const explicit = pickExplicit(options.root);
  const fromEnv = pickExplicit(env[BRAND_GROWTH_ROOT_ENV]);
  const fallback = cwd === null ? null : path.join(cwd, DEFAULT_RUNTIME_DIRNAME, DEFAULT_STORE_SUBDIR);

  const chosen = explicit ?? fromEnv ?? fallback;
  if (chosen === null || (!path.isAbsolute(chosen) && cwd === null)) {
    throw new StoreConfigError(
      "missing_root",
      "store root is undecidable: pass an absolute root, or an absolute cwd to resolve against",
    );
  }

  // cwd が無い場合に届くのは絶対パスだけ。ここで実プロセスの作業ディレクトリは使わない。
  const absolute = cwd === null ? path.normalize(chosen) : path.resolve(cwd, chosen);
  assertWritableLocation(absolute, cwd);
  return absolute;
}

/**
 * 追跡対象のソースや設計書の中へ書こうとしていないか。
 *
 * 基準（cwd）が渡されていない場合、「リポジトリの中か」は判定できない。
 * その経路には絶対パスしか到達しないため、判定できる材料が無いことを明示して素通しする。
 * 追跡領域の保護が要るときは、呼び出し側が cwd を渡す。
 */
function assertWritableLocation(absolute: string, cwd: string | null): void {
  if (cwd === null) return;
  const relative = path.relative(cwd, absolute);
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
