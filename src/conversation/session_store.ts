// 会話セッションの永続ストア（記憶係コマンド用）
// 1 LINE userId につき 1 セッション。30 分 TTL。
// ファイル: ${OPENQLOW_ROOT}/state/conversations/{userId}.json

import fs from "node:fs/promises";
import path from "node:path";
import { openqlowPath } from "../utils/paths.js";

export type Genre = "trial" | "enrollment" | "inquiry" | "member_change" | "other";

export interface GenreEntry {
  type: Genre;
  data: Record<string, string>;
  /** 質問ID と回答のペア。順序保持のため Record ではなく配列で持つ。 */
  answers: Array<{ key: string; question: string; answer: string }>;
}

export type SessionStep =
  | "awaiting_yes_no"        // Q1
  | "awaiting_genre_choice"  // Q2
  | "awaiting_genre_detail"  // Q3..Q7
  | "awaiting_more_genre"    // Q8 (続けるか？)
  | "ready_to_save";         // 保存待機

export interface ConversationSession {
  userId: string;
  command: string;             // 起動コマンド名（例: "/昨日の記録"）
  step: SessionStep;
  /** 現在の genre 入力中の type */
  activeGenre?: Genre;
  /** 現在の genre 内で何問目か（0 始まり） */
  activeGenreQuestionIndex: number;
  /** 集めた genre 回答群 */
  genres: GenreEntry[];
  /** 「なし」で終了したセッションは保存スキップ（空ログ作らない） */
  skipSave?: boolean;
  startedAt: string;           // ISO8601
  expiresAt: string;           // ISO8601 (30 分後)
  lastInteractionAt: string;   // ISO8601
}

export interface SessionStoreOptions {
  /** TTL ミリ秒。デフォルト 30 分。 */
  ttlMs?: number;
  /** 現在時刻提供関数。テスト用に差し替え可能。 */
  now?: () => Date;
  /** state 保存先のオーバーライド（テスト用） */
  baseDir?: string;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export class SessionStore {
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly baseDir: string;

  constructor(opts: SessionStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.now = opts.now ?? (() => new Date());
    this.baseDir = opts.baseDir ?? openqlowPath("state", "conversations");
  }

  private fileFor(userId: string): string {
    // ユーザーIDをそのままファイル名に使う（LINE userId は英数字 33 文字）
    if (!/^U[0-9a-fA-F]{32}$/.test(userId) && !userId.startsWith("test-")) {
      // 想定外形式は安全側で sha256 を取って固定長化
      // ただし import を避けるため小規模代替: 英数字以外を _ に置換
    }
    const safe = userId.replace(/[^A-Za-z0-9_-]/g, "_");
    return path.join(this.baseDir, `${safe}.json`);
  }

  async load(userId: string): Promise<ConversationSession | undefined> {
    try {
      const raw = await fs.readFile(this.fileFor(userId), "utf-8");
      const session = JSON.parse(raw) as ConversationSession;

      // TTL チェック
      const expires = new Date(session.expiresAt).getTime();
      if (Number.isNaN(expires) || expires < this.now().getTime()) {
        await this.destroy(userId);
        return undefined;
      }

      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async start(userId: string, command: string): Promise<ConversationSession> {
    // 既存セッションは破棄
    await this.destroy(userId);

    const now = this.now();
    const session: ConversationSession = {
      userId,
      command,
      step: "awaiting_yes_no",
      activeGenreQuestionIndex: 0,
      genres: [],
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      lastInteractionAt: now.toISOString(),
    };

    await this.save(session);
    return session;
  }

  async save(session: ConversationSession): Promise<void> {
    const now = this.now();
    session.lastInteractionAt = now.toISOString();
    // 操作のたびに TTL をリフレッシュ
    session.expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();

    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.fileFor(session.userId), JSON.stringify(session, null, 2));
  }

  async destroy(userId: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(userId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async exists(userId: string): Promise<boolean> {
    const session = await this.load(userId);
    return session !== undefined;
  }
}

export function defaultSessionStore(): SessionStore {
  return new SessionStore();
}
