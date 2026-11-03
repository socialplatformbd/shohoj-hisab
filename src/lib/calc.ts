import { addMonths, daysBetween, addDays, inRange, monthKey, monthsBetween, startOfMonth, endOfMonth } from "./dates";
import { percentOf } from "./money";
import type { Budget, Category, Debt, Repayment, Transaction } from "./types";

/** সব হিসাব deterministic পূর্ণসংখ্যা (paisa) গণিত — AI-এর কোনো ভূমিকা নেই */

export interface Totals {
  income: number;
  expense: number;
  saving: number;
  withdraw: number;
  /** বর্তমান জমা সঞ্চয় = জমা − তোলা */
  savings: number;
  /** ব্যালেন্স = আয় − খরচ − সঞ্চয় জমা + সঞ্চয় তোলা */
  balance: number;
}

export function sumTx(txs: Transaction[]): Totals {
  let income = 0,
    expense = 0,
    saving = 0,
    withdraw = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
    else if (t.type === "saving") saving += t.amount;
    else withdraw += t.amount;
  }
  return { income, expense, saving, withdraw, savings: saving - withdraw, balance: income - expense - saving + withdraw };
}

export function filterRange(txs: Transaction[], from: string, to: string): Transaction[] {
  return txs.filter((t) => inRange(t.date, from, to));
}

export interface SeriesPoint {
  key: string; // তারিখ বা মাস
  income: number;
  expense: number;
}

export function monthlySeries(txs: Transaction[], fromMonth: string, toMonth: string): SeriesPoint[] {
  const n = monthsBetween(fromMonth, toMonth);
  const map = new Map<string, SeriesPoint>();
  for (let i = 0; i <= n; i++) {
    const k = addMonths(fromMonth, i);
    map.set(k, { key: k, income: 0, expense: 0 });
  }
  for (const t of txs) {
    const p = map.get(monthKey(t.date));
    if (!p) continue;
    if (t.type === "income") p.income += t.amount;
    else if (t.type === "expense") p.expense += t.amount;
  }
  return [...map.values()];
}

export function dailySeries(txs: Transaction[], from: string, to: string): SeriesPoint[] {
  const n = daysBetween(from, to);
  const map = new Map<string, SeriesPoint>();
  for (let i = 0; i <= n; i++) {
    const k = addDays(from, i);
    map.set(k, { key: k, income: 0, expense: 0 });
  }
  for (const t of txs) {
    const p = map.get(t.date);
    if (!p) continue;
    if (t.type === "income") p.income += t.amount;
    else if (t.type === "expense") p.expense += t.amount;
  }
  return [...map.values()];
}

export interface CategoryTotal {
  categoryId: string;
  total: number;
  percent: number;
  count: number;
}

export function categoryBreakdown(txs: Transaction[], type: "income" | "expense" = "expense"): CategoryTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    const e = map.get(t.categoryId) ?? { total: 0, count: 0 };
    e.total += t.amount;
    e.count += 1;
    grand += t.amount;
    map.set(t.categoryId, e);
  }
  return [...map.entries()]
    .map(([categoryId, e]) => ({ categoryId, total: e.total, count: e.count, percent: percentOf(e.total, grand) }))
    .sort((a, b) => b.total - a.total);
}

// ---------- বাজেট ----------
export type BudgetLevel = "ok" | "warn" | "over";

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number; // ঋণাত্মক হলে সীমা ছাড়িয়েছে
  percent: number;
  level: BudgetLevel;
}

export const WARN_PERCENT = 80;

export function budgetLevel(percent: number): BudgetLevel {
  if (percent >= 100) return "over";
  if (percent >= WARN_PERCENT) return "warn";
  return "ok";
}

export function budgetStatuses(budgets: Budget[], txs: Transaction[], month: string): BudgetStatus[] {
  const from = startOfMonth(month + "-01");
  const to = endOfMonth(month + "-01");
  const monthTx = txs.filter((t) => t.type === "expense" && inRange(t.date, from, to));
  const totalSpent = monthTx.reduce((s, t) => s + t.amount, 0);
  const byCat = new Map<string, number>();
  for (const t of monthTx) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);

  return budgets
    .filter((b) => b.month === month)
    .map((b) => {
      const spent = b.categoryId === null ? totalSpent : (byCat.get(b.categoryId) ?? 0);
      const percent = percentOf(spent, b.amount);
      return { budget: b, spent, remaining: b.amount - spent, percent, level: budgetLevel(percent) };
    })
    .sort((a, b) => {
      if (a.budget.categoryId === null) return -1;
      if (b.budget.categoryId === null) return 1;
      return b.percent - a.percent;
    });
}

// ---------- ধার-দেনা ----------
export type DebtStatus = "unpaid" | "partial" | "paid";

export interface DebtSummary {
  debt: Debt;
  paid: number;
  remaining: number;
  status: DebtStatus;
  overdue: boolean;
  percent: number;
  repayments: Repayment[];
}

/** পরিশোধিত অঙ্ক সব সময় সংরক্ষিত repayment রেকর্ড থেকে নতুন করে হিসাব হয় — আলাদা করে জমানো থাকে না */
export function summarizeDebt(debt: Debt, allRepayments: Repayment[], today: string): DebtSummary {
  const repayments = allRepayments.filter((r) => r.debtId === debt.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const paid = repayments.reduce((s, r) => s + r.amount, 0);
  const remaining = Math.max(0, debt.amount - paid);
  const status: DebtStatus = remaining === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  const overdue = status !== "paid" && !!debt.dueDate && debt.dueDate < today;
  return { debt, paid, remaining, status, overdue, percent: percentOf(Math.min(paid, debt.amount), debt.amount), repayments };
}

export function debtTotals(debts: Debt[], repayments: Repayment[], today: string) {
  let receivable = 0;
  let payable = 0;
  const summaries = debts.map((d) => summarizeDebt(d, repayments, today));
  for (const s of summaries) {
    if (s.debt.kind === "lent") receivable += s.remaining;
    else payable += s.remaining;
  }
  return { receivable, payable, summaries };
}

export function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}
