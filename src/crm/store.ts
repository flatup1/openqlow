// 見込み客の永続化（JSONファイルストア・依存ゼロ）
//
// SQLite 相当の最小 CRUD を提供する。1オーナー運用前提のため単純なファイル読み書き。
// created_at / updated_at は自動付与。id は AUTOINCREMENT 相当（max(id)+1）。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeProspectInput,
  type Prospect,
  type ProspectInput,
} from "./prospect.js";

export interface ProspectStore {
  create(input: ProspectInput): Promise<Prospect>;
  getAll(): Promise<Prospect[]>;
  get(id: number): Promise<Prospect | undefined>;
  findByExternalId(externalId: string): Promise<Prospect | undefined>;
  update(id: number, patch: ProspectInput): Promise<Prospect | undefined>;
  remove(id: number): Promise<boolean>;
}

async function readAll(filePath: string): Promise<Prospect[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Prospect[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(filePath: string, list: Prospect[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  // 一時ファイルに書き切ってから rename（同一ディレクトリ内なので原子的）。
  // 保存の途中で中断しても本体（名簿）が壊れない。
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

/**
 * JSONファイルを背後に持つ見込み客ストアを開く。
 * @param filePath 保存先 JSON のパス
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export function openProspectStore(filePath: string, now: () => Date = () => new Date()): ProspectStore {
  const stamp = () => now().toISOString();

  return {
    async create(input) {
      const list = await readAll(filePath);
      const nextId = list.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const at = stamp();
      const prospect: Prospect = {
        id: nextId,
        ...normalizeProspectInput(input),
        createdAt: at,
        updatedAt: at,
      };
      list.push(prospect);
      await writeAll(filePath, list);
      return prospect;
    },

    async getAll() {
      return readAll(filePath);
    },

    async get(id) {
      const list = await readAll(filePath);
      return list.find(p => p.id === id);
    },

    async findByExternalId(externalId) {
      if (!externalId) return undefined;
      const list = await readAll(filePath);
      return list.find(p => p.externalId === externalId);
    },

    async update(id, patch) {
      const list = await readAll(filePath);
      const index = list.findIndex(p => p.id === id);
      if (index < 0) return undefined;
      const current = list[index];
      const normalized = normalizeProspectInput({ ...current, ...patch });
      const updated: Prospect = {
        ...normalized,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: stamp(),
      };
      list[index] = updated;
      await writeAll(filePath, list);
      return updated;
    },

    async remove(id) {
      const list = await readAll(filePath);
      const next = list.filter(p => p.id !== id);
      if (next.length === list.length) return false;
      await writeAll(filePath, next);
      return true;
    },
  };
}
