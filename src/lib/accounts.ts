import type { Account, Transaction, Transfer } from "./types";

/** একটি লেনদেন ব্যালেন্সে কতটা যোগ/বিয়োগ করে (sumTx.balance-এর নিয়মেই) */
export function txEffect(t: Transaction): number {
  return t.type === "income" || t.type === "withdraw" ? t.amount : -t.amount;
}

export interface AccountRow {
  account: Account;
  balance: number;
}

export interface AccountSummary {
  rows: AccountRow[];
  /** কোনো অ্যাকাউন্টে বসানো নেই এমন লেনদেনের নিট (মুছে ফেলা অ্যাকাউন্টের লেনদেনও এখানে ধরা হয়) */
  unassigned: number;
  /** সব অ্যাকাউন্টের ব্যালেন্স + অ্যাকাউন্টহীন লেনদেন */
  total: number;
}

/**
 * প্রতিটি অ্যাকাউন্টের ব্যালেন্স = শুরুর ব্যালেন্স + (ওই অ্যাকাউন্টের আয়/উত্তোলন − খরচ/সঞ্চয়) + আসা ট্রান্সফার − যাওয়া ট্রান্সফার।
 * ট্রান্সফার মোট অঙ্কে কিছু বদলায় না।
 */
export function accountSummary(accounts: Account[], txs: Transaction[], transfers: Transfer[]): AccountSummary {
  const bal = new Map<string, number>(accounts.map((a) => [a.id, a.openingBalance]));
  let unassigned = 0;
  for (const t of txs) {
    const eff = txEffect(t);
    if (t.accountId && bal.has(t.accountId)) bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + eff);
    else unassigned += eff;
  }
  for (const tr of transfers) {
    if (!bal.has(tr.fromAccountId) || !bal.has(tr.toAccountId)) continue;
    bal.set(tr.fromAccountId, (bal.get(tr.fromAccountId) ?? 0) - tr.amount);
    bal.set(tr.toAccountId, (bal.get(tr.toAccountId) ?? 0) + tr.amount);
  }
  const rows = accounts.map((account) => ({ account, balance: bal.get(account.id) ?? 0 }));
  const total = rows.reduce((s, r) => s + r.balance, 0) + unassigned;
  return { rows, unassigned, total };
}
