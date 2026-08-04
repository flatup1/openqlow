// 経費の永続化（JSONファイルストア・依存ゼロ）
//
// crm/store.ts と同じ作り。1オーナー運用なので全件読み書きで足りる。
// 帳簿は壊すと復元できないため、書き込みは必ず一時ファイル経由の rename（原子的）にする。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeExpenseInput, type Expense, type ExpenseInput } from "./expense.js";

export interface ExpenseStore {
  create(input: ExpenseInput): Promise<Expense>;
  getAll(): Promise<Expense[]>;
  get(id: number): Promise<Expense | undefined>;
  update(id: number, patch: ExpenseInput): Promise<Expense | undefined>;
  remove(id: number): Promise<boolean>;
}

async function readAll(filePath: string): Promise<Expense[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Expense[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(filePath: string, list: Expense[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

/**
 * JSONファイルを背後に持つ経費帳を開く。
 * @param filePath 保存先 JSON のパス
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export function openExpenseStore(filePath: string, now: () => Date = () => new Date()): ExpenseStore {
  const stamp = () => now().toISOString();

  return {
    async create(input) {
      const list = await readAll(filePath);
      const nextId = list.reduce((max, e) => Math.max(max, e.id), 0) + 1;
      const at = stamp();
      const expense: Expense = {
        id: nextId,
        ...normalizeExpenseInput(input),
        createdAt: at,
        updatedAt: at,
      };
      list.push(expense);
      await writeAll(filePath, list);
      return expense;
    },

    async getAll() {
      return readAll(filePath);
    },

    async get(id) {
      const list = await readAll(filePath);
      return list.find(e => e.id === id);
    },

    async update(id, patch) {
      const list = await readAll(filePath);
      const index = list.findIndex(e => e.id === id);
      if (index < 0) return undefined;
      const current = list[index];
      // 既存値をベースに差分だけ上書きする（部分更新で他の欄が消えないように）
      const merged: ExpenseInput = {
        date: patch.date ?? current.date,
        vendor: patch.vendor ?? current.vendor,
        amount: patch.amount ?? current.amount,
        account: patch.account ?? current.account,
        taxCategory: patch.taxCategory ?? current.taxCategory,
        note: patch.note ?? current.note,
        businessRatio: patch.businessRatio ?? current.businessRatio,
        paymentMethod: patch.paymentMethod ?? current.paymentMethod,
        receipt: patch.receipt ?? current.receipt,
        invoiceNumber: patch.invoiceNumber ?? current.invoiceNumber,
        subsidyTag: patch.subsidyTag ?? current.subsidyTag,
        assetLife: patch.assetLife ?? current.assetLife,
      };
      const updated: Expense = {
        ...normalizeExpenseInput(merged),
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
      const next = list.filter(e => e.id !== id);
      if (next.length === list.length) return false;
      await writeAll(filePath, next);
      return true;
    },
  };
}
